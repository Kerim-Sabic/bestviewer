"""SAM2.1 / MedSAM2 backend.

MedSAM2 is SAM2.1 fine-tuned on medical data, so both share this code — only the
(config, checkpoint) pair differs. Single-frame prompts run through the image
predictor; `propagate=True` runs the video predictor's streaming memory across
the frames of a multi-frame loop (the temporal "tracking" the viewer offers).
"""

from __future__ import annotations

import os
import shutil
import tempfile
import time

import numpy as np
import torch
from PIL import Image

from backends.base import SegmentationBackend
from contract import FrameMask, Prompt, SegmentationRequest, SegmentationResponse
from dicom_source import get_instance_frames, get_single_frame_rgb
from rle import encode_mask_rle


class Sam2Backend(SegmentationBackend):
    def __init__(
        self,
        model_id: str,
        label: str,
        version: str | None,
        config_file: str,
        checkpoint: str,
        device: str = "cuda",
    ) -> None:
        self.model_id = model_id
        self.label = label
        self.version = version
        self._config_file = config_file
        self._checkpoint = checkpoint
        self._device = device if torch.cuda.is_available() else "cpu"
        self._image_predictor = None
        self._video_predictor = None
        self._loaded = False

    def ready(self) -> bool:
        return self._loaded

    def load(self) -> None:
        if self._loaded:
            return
        if not os.path.exists(self._checkpoint):
            raise FileNotFoundError(
                f"Checkpoint not found: {self._checkpoint}. Run download_weights.py."
            )

        from sam2.build_sam import build_sam2, build_sam2_video_predictor
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        if self._device == "cuda":
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            torch.backends.cudnn.benchmark = True

        model = build_sam2(self._config_file, self._checkpoint, device=self._device)
        self._image_predictor = SAM2ImagePredictor(model)
        self._video_predictor = build_sam2_video_predictor(
            self._config_file, self._checkpoint, device=self._device
        )
        self._loaded = True
        self._warmup()

    def _warmup(self) -> None:
        """Run one tiny inference so CUDA kernels are compiled/autotuned before
        the first real click pays for it."""
        try:
            dummy = np.zeros((256, 256, 3), dtype=np.uint8)
            with torch.inference_mode(), self._autocast():
                self._image_predictor.set_image(dummy)
                self._image_predictor.predict(
                    point_coords=np.array([[128, 128]], dtype=np.float32),
                    point_labels=np.array([1], dtype=np.int32),
                    multimask_output=False,
                )
        except Exception:  # noqa: BLE001 — warmup is best-effort
            pass

    def segment(self, request: SegmentationRequest) -> SegmentationResponse:
        if not self._loaded:
            self.load()

        started = time.perf_counter()
        study = request.image.studyInstanceUid
        series = request.image.seriesInstanceUid
        sop = request.image.sopInstanceUid
        points, labels, box = _prompts_to_arrays(request.prompts)

        if request.propagate:
            # Whole-loop tracking: decode every frame (cached) and run the video
            # predictor's streaming memory across the cardiac cycle.
            frames = get_instance_frames(study, series, sop)
            if not frames:
                raise ValueError("No frames decoded from the referenced instance.")
            frame_index = request.image.frameIndex
            if frame_index < 0 or frame_index >= len(frames):
                frame_index = 0
            if len(frames) > 1:
                out_frames, confidence = self._segment_video(
                    frames, frame_index, points, labels, box
                )
            else:
                out_frames, confidence = self._segment_single(
                    frames[0], frame_index, points, labels, box
                )
        else:
            # Fast path: fetch and encode only the displayed frame.
            frame_index = max(request.image.frameIndex, 0)
            frame = get_single_frame_rgb(study, series, sop, frame_index)
            out_frames, confidence = self._segment_single(
                frame, frame_index, points, labels, box
            )

        return SegmentationResponse(
            modelId=self.model_id,
            modelVersion=self.version or "",
            confidence=confidence,
            inferenceMs=(time.perf_counter() - started) * 1000.0,
            frames=out_frames,
        )

    def _autocast(self):
        if self._device == "cuda":
            return torch.autocast("cuda", dtype=torch.bfloat16)
        return torch.autocast("cpu", dtype=torch.bfloat16, enabled=False)

    def _segment_single(self, frame_rgb, frame_index, points, labels, box):
        predictor = self._image_predictor
        assert predictor is not None
        with torch.inference_mode(), self._autocast():
            predictor.set_image(frame_rgb)
            masks, scores, _ = predictor.predict(
                point_coords=points,
                point_labels=labels,
                box=box,
                multimask_output=False,
            )

        mask = np.asarray(masks[0]) > 0
        height, width = mask.shape
        confidence = float(scores[0]) if scores is not None and len(scores) else None
        frame = FrameMask(
            frameIndex=frame_index,
            width=int(width),
            height=int(height),
            runLengths=encode_mask_rle(mask),
        )
        return [frame], confidence

    def _segment_video(self, frames, prompt_frame, points, labels, box):
        predictor = self._video_predictor
        assert predictor is not None
        temp_dir = tempfile.mkdtemp(prefix="horalix-sam2-")
        try:
            for index, frame in enumerate(frames):
                Image.fromarray(frame).save(
                    os.path.join(temp_dir, f"{index:06d}.jpg"), quality=95
                )

            results: list[FrameMask] = []
            with torch.inference_mode(), self._autocast():
                state = predictor.init_state(video_path=temp_dir)
                predictor.add_new_points_or_box(
                    inference_state=state,
                    frame_idx=prompt_frame,
                    obj_id=1,
                    points=points,
                    labels=labels,
                    box=box,
                )
                for out_frame_idx, _obj_ids, out_mask_logits in predictor.propagate_in_video(
                    state
                ):
                    mask = (
                        (out_mask_logits[0] > 0.0)
                        .squeeze(0)
                        .detach()
                        .cpu()
                        .numpy()
                    )
                    height, width = mask.shape
                    results.append(
                        FrameMask(
                            frameIndex=int(out_frame_idx),
                            width=int(width),
                            height=int(height),
                            runLengths=encode_mask_rle(mask),
                        )
                    )

            results.sort(key=lambda frame: frame.frameIndex)
            return results, None
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


def _prompts_to_arrays(prompts: list[Prompt]):
    points: list[list[float]] = []
    labels: list[int] = []
    box: list[float] | None = None

    for prompt in prompts:
        if prompt.kind == "point":
            points.append([prompt.x, prompt.y])
            labels.append(1 if prompt.include else 0)
        else:
            box = [
                prompt.x,
                prompt.y,
                prompt.x + prompt.width,
                prompt.y + prompt.height,
            ]

    point_coords = np.array(points, dtype=np.float32) if points else None
    point_labels = np.array(labels, dtype=np.int32) if labels else None
    box_array = np.array(box, dtype=np.float32) if box is not None else None
    return point_coords, point_labels, box_array
