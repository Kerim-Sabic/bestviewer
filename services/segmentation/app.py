"""On-prem GPU segmentation service for the Horalix viewer.

Implements the viewer's segmentation contract (the single source of truth lives
in `packages/dicom-engine/src/segmentation.ts`). This service is the *clinical*
output path: it is where masks/measurements originate. The viewer never lets a
language model produce a mask. SaMD: research use only until a validated model
and the appropriate clearance are in place.

Endpoints
    POST /segment  -> promptable segmentation, returns RLE masks per frame
    GET  /health   -> liveness
    GET  /ready    -> readiness (backend loaded + GPU available)

The model backend is intentionally pluggable (MedSAM2 / SAM2 / nnInteractive).
Wire a real backend in `load_backend()`; until then `/segment` returns 501 so
the viewer surfaces an honest "not configured" state rather than a fake mask.
"""

from __future__ import annotations

import time
from typing import Literal, Optional, Union

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


# --- Contract (mirrors segmentation.ts) -----------------------------------


class PointPrompt(BaseModel):
    kind: Literal["point"]
    x: float
    y: float
    include: bool


class BoxPrompt(BaseModel):
    kind: Literal["box"]
    x: float
    y: float
    width: float
    height: float


Prompt = Union[PointPrompt, BoxPrompt]


class ImageReference(BaseModel):
    studyInstanceUid: str
    seriesInstanceUid: str
    sopInstanceUid: str
    frameIndex: int


class SegmentationRequest(BaseModel):
    modelId: str
    image: ImageReference
    prompts: list[Prompt] = Field(min_length=1)
    segmentIndex: int
    propagate: bool


class FrameMask(BaseModel):
    frameIndex: int
    width: int
    height: int
    # Row-major run-length encoding, alternating runs starting with background.
    runLengths: list[int]


class SegmentationResponse(BaseModel):
    modelId: str
    modelVersion: str
    confidence: Optional[float]
    inferenceMs: float
    frames: list[FrameMask]


# --- Backend --------------------------------------------------------------


class SegmentationBackend:
    """Pluggable inference backend. Replace with a real model.

    A real implementation must, on the GPU, once at startup:
      * load the chosen model weights (e.g. MedSAM2) onto CUDA,
    and per request:
      * pull the referenced frame(s) from PACS (study/series/sop + frame),
      * run the model with the prompts (already in image-pixel coordinates),
      * for `propagate=True`, use the model's temporal memory to extend the
        mask across frames of the loop,
      * RLE-encode each mask (row-major, starting with a background run),
      * never fabricate anatomy — return what the model produced.
    """

    model_id = "unconfigured"
    model_version = "0.0.0"

    def ready(self) -> bool:
        return False

    def segment(self, request: SegmentationRequest) -> SegmentationResponse:
        raise HTTPException(
            status_code=501,
            detail=(
                "No segmentation backend is wired. Implement SegmentationBackend "
                "with MedSAM2/SAM2/nnInteractive on a GPU and load it in "
                "load_backend()."
            ),
        )


def load_backend() -> SegmentationBackend:
    # return Sam2Backend(weights=os.environ["SAM2_WEIGHTS"], device="cuda")
    return SegmentationBackend()


app = FastAPI(title="Horalix Segmentation Service", version="0.1.0")
backend = load_backend()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, object]:
    return {"ready": backend.ready(), "modelId": backend.model_id}


@app.post("/segment", response_model=SegmentationResponse)
def segment(request: SegmentationRequest) -> SegmentationResponse:
    started = time.perf_counter()
    response = backend.segment(request)
    object.__setattr__(response, "inferenceMs", (time.perf_counter() - started) * 1000.0)
    return response
