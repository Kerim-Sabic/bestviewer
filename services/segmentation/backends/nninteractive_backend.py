"""nnInteractive backend (optional).

nnInteractive (DKFZ) often feels more real-time/accurate than SAM-family models
on typical clinical structures. Its dependency stack (nnU-Net) can conflict with
SAM2's, so it is intended to run in its own venv/process and is enabled only when
`NNINTERACTIVE_MODEL_DIR` points at a downloaded model. If the package or weights
are absent, the backend stays not-ready and the viewer simply does not offer it —
never a fabricated mask.
"""

from __future__ import annotations

import time

import numpy as np
import torch

from backends.base import SegmentationBackend
from contract import FrameMask, SegmentationRequest, SegmentationResponse
from dicom_source import fetch_instance, instance_frames_rgb
from rle import encode_mask_rle


class NnInteractiveBackend(SegmentationBackend):
    def __init__(self, model_dir: str, device: str = "cuda") -> None:
        self.model_id = "nninteractive"
        self.label = "nnInteractive (DKFZ)"
        self.version = "v1"
        self._model_dir = model_dir
        self._device = device if torch.cuda.is_available() else "cpu"
        self._session = None
        self._loaded = False

    def ready(self) -> bool:
        return self._loaded

    def load(self) -> None:
        if self._loaded:
            return

        from nnInteractive.inference.inference_session import (
            nnInteractiveInferenceSession,
        )

        session = nnInteractiveInferenceSession(
            device=torch.device(self._device),
            use_torch_compile=False,
            verbose=False,
            torch_n_threads=8,
            do_autozoom=True,
        )
        session.initialize_from_trained_model_folder(self._model_dir)
        self._session = session
        self._loaded = True

    def segment(self, request: SegmentationRequest) -> SegmentationResponse:
        if not self._loaded:
            self.load()
        session = self._session
        assert session is not None

        started = time.perf_counter()
        dataset = fetch_instance(
            request.image.studyInstanceUid,
            request.image.seriesInstanceUid,
            request.image.sopInstanceUid,
        )
        frames = instance_frames_rgb(dataset)
        if not frames:
            raise ValueError("No frames decoded from the referenced instance.")

        frame_index = request.image.frameIndex
        if frame_index < 0 or frame_index >= len(frames):
            frame_index = 0

        # nnInteractive works on (C, X, Y, Z). A single grayscale slice is a
        # degenerate volume (1, H, W, 1); coordinates are (X=row, Y=col, Z=0)
        # while viewer prompts are image-pixel (x=col, y=row).
        rgb = frames[frame_index]
        gray = rgb[..., 0].astype(np.float32)
        height, width = gray.shape
        image = gray[np.newaxis, :, :, np.newaxis]  # (1, H, W, 1)

        session.set_image(image)
        target = torch.zeros((height, width, 1), dtype=torch.uint8)
        session.set_target_buffer(target)

        for prompt in request.prompts:
            if prompt.kind == "point":
                session.add_point_interaction(
                    (int(round(prompt.y)), int(round(prompt.x)), 0),
                    include_interaction=prompt.include,
                )
            else:
                session.add_bbox_interaction(
                    [
                        [int(round(prompt.y)), int(round(prompt.y + prompt.height))],
                        [int(round(prompt.x)), int(round(prompt.x + prompt.width))],
                        [0, 1],
                    ],
                    include_interaction=True,
                )

        result = session.target_buffer
        mask = (
            result.detach().cpu().numpy()
            if isinstance(result, torch.Tensor)
            else np.asarray(result)
        )
        mask = np.asarray(mask).reshape((height, width)) > 0

        frame = FrameMask(
            frameIndex=frame_index,
            width=int(width),
            height=int(height),
            runLengths=encode_mask_rle(mask),
        )
        return SegmentationResponse(
            modelId=self.model_id,
            modelVersion=self.version or "",
            confidence=None,
            inferenceMs=(time.perf_counter() - started) * 1000.0,
            frames=[frame],
        )
