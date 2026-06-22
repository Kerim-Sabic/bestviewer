"""On-prem GPU segmentation + SEG-export service for the Horalix viewer.

Implements the viewer's contract (`packages/dicom-engine/src/segmentation.ts`).
This is the *clinical* output path: masks originate here from a validated model,
never from a language model. A pluggable backend registry serves a model menu
(MedSAM2 / SAM2.1 / optional nnInteractive); each backend pulls the referenced
frame(s) from Orthanc, runs the prompts, and returns RLE masks. SaMD: research
use only until a validated model and the appropriate clearance are in place.

Endpoints
    GET  /health   -> liveness
    GET  /ready    -> readiness (any backend loaded)
    GET  /models   -> model menu with per-backend ready flags
    POST /segment  -> promptable segmentation (RLE masks; propagation for loops)
    POST /seg      -> build a DICOM SEG from a labelmap and STOW it to Orthanc
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from backends.base import SegmentationBackend
from backends.sam2_backend import Sam2Backend
from contract import (
    ModelInfo,
    ModelsResponse,
    SegExportRequest,
    SegExportResponse,
    SegmentationRequest,
    SegmentationResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("horalix.segmentation")

WEIGHTS_DIR = os.environ.get(
    "HORALIX_WEIGHTS_DIR", os.path.join(os.path.dirname(__file__), "weights")
)

_registry: dict[str, SegmentationBackend] = {}


def _build_registry() -> dict[str, SegmentationBackend]:
    backends: list[SegmentationBackend] = [
        Sam2Backend(
            model_id="medsam2",
            label="MedSAM2 (medical)",
            version="latest",
            config_file="configs/sam2.1/sam2.1_hiera_t.yaml",
            checkpoint=os.path.join(WEIGHTS_DIR, "MedSAM2_latest.pt"),
        ),
        Sam2Backend(
            model_id="sam2.1",
            label="SAM2.1 (general)",
            version="hiera-base-plus",
            config_file="configs/sam2.1/sam2.1_hiera_b+.yaml",
            checkpoint=os.path.join(WEIGHTS_DIR, "sam2.1_hiera_base_plus.pt"),
        ),
    ]

    # nnInteractive runs in its own venv/process (nnU-Net deps conflict with
    # SAM2); prefer proxying to it, fall back to in-process if a model dir is set.
    nninteractive_url = os.environ.get("NNINTERACTIVE_SERVICE_URL")
    nninteractive_dir = os.environ.get("NNINTERACTIVE_MODEL_DIR")
    if nninteractive_url:
        from backends.remote_backend import RemoteBackend

        backends.append(
            RemoteBackend(
                model_id="nninteractive",
                label="nnInteractive (DKFZ)",
                version="v1.0",
                base_url=nninteractive_url,
            )
        )
    elif nninteractive_dir:
        from backends.nninteractive_backend import NnInteractiveBackend

        backends.append(NnInteractiveBackend(nninteractive_dir))

    return {backend.model_id: backend for backend in backends}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _registry
    _registry = _build_registry()
    for backend in _registry.values():
        try:
            backend.load()
            logger.info("Loaded backend '%s' (%s)", backend.model_id, backend.version)
        except Exception as error:  # noqa: BLE001 — surface, do not crash startup
            logger.warning("Backend '%s' not loaded: %s", backend.model_id, error)
    yield


app = FastAPI(
    title="Horalix Segmentation Service", version="0.2.0", lifespan=lifespan
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, object]:
    ready_backends = [b.model_id for b in _registry.values() if b.ready()]
    return {
        "ready": len(ready_backends) > 0,
        "modelId": ready_backends[0] if ready_backends else "none",
    }


@app.get("/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    return ModelsResponse(
        models=[
            ModelInfo(
                id=backend.model_id,
                label=backend.label,
                version=backend.version,
                ready=backend.ready(),
            )
            for backend in _registry.values()
        ]
    )


@app.post("/segment", response_model=SegmentationResponse)
def segment(request: SegmentationRequest) -> SegmentationResponse:
    backend = _registry.get(request.modelId)
    if backend is None:
        raise HTTPException(404, detail=f"Unknown model '{request.modelId}'.")
    if not backend.ready():
        raise HTTPException(
            503, detail=f"Model '{request.modelId}' is not loaded on the GPU."
        )
    try:
        return backend.segment(request)
    except HTTPException:
        raise
    except Exception as error:  # noqa: BLE001
        logger.exception("Inference failed")
        raise HTTPException(500, detail=f"Inference failed: {error}") from error


@app.post("/seg", response_model=SegExportResponse)
def seg_export(request: SegExportRequest) -> SegExportResponse:
    from seg_export import build_and_store_seg

    try:
        return build_and_store_seg(request)
    except Exception as error:  # noqa: BLE001
        logger.exception("SEG export failed")
        return SegExportResponse(status="error", message=f"SEG export failed: {error}")
