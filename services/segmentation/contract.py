"""Wire contract for the Horalix segmentation service.

Mirrors `packages/dicom-engine/src/segmentation.ts` (the single source of truth
for the viewer <-> service contract). Prompts arrive in image-pixel coordinates;
masks are returned run-length-encoded (row-major, starting with a background
run). This service is the *clinical* output path — masks originate here from a
validated model, never from a language model.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


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
    runLengths: list[int]


class SegmentationResponse(BaseModel):
    modelId: str
    modelVersion: str
    confidence: Optional[float]
    inferenceMs: float
    frames: list[FrameMask]


class ModelInfo(BaseModel):
    id: str
    label: str
    version: Optional[str]
    ready: bool


class ModelsResponse(BaseModel):
    models: list[ModelInfo]


# --- DICOM SEG export -----------------------------------------------------


class SegMaskInput(BaseModel):
    segmentIndex: int
    runLengths: list[int]


class SegFrameInput(BaseModel):
    sopInstanceUid: str
    frameIndex: int
    width: int
    height: int
    masks: list[SegMaskInput]


class SegSegmentInput(BaseModel):
    index: int
    label: str
    color: list[int]


class SegExportRequest(BaseModel):
    studyInstanceUid: str
    seriesInstanceUid: str
    segments: list[SegSegmentInput]
    frames: list[SegFrameInput]


class SegExportResponse(BaseModel):
    status: Literal["ok", "error"]
    message: str
    segSopInstanceUid: Optional[str] = None
    studyInstanceUid: Optional[str] = None
