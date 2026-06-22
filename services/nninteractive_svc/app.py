"""Standalone nnInteractive service (runs in its own venv).

nnInteractive (DKFZ) ships an nnU-Net dependency stack that conflicts with SAM2,
so it runs as a separate process and the main Horalix service proxies to it
(see ../segmentation/backends/remote_backend.py). Reuses the shared contract,
RLE, DICOM source, and backend from ../segmentation.

  ORTHANC_URL=http://localhost:8042 \
  NNINTERACTIVE_MODEL_DIR=./model/nnInteractive_v1.0 \
  .venv-nnint/Scripts/python -m uvicorn app:app --host 0.0.0.0 --port 8002
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "segmentation")
)

from backends.nninteractive_backend import NnInteractiveBackend  # noqa: E402
from contract import (  # noqa: E402
    ModelInfo,
    ModelsResponse,
    SegmentationRequest,
    SegmentationResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("horalix.nninteractive")

MODEL_DIR = os.environ.get(
    "NNINTERACTIVE_MODEL_DIR",
    os.path.join(os.path.dirname(__file__), "model", "nnInteractive_v1.0"),
)
backend = NnInteractiveBackend(MODEL_DIR)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        backend.load()
        logger.info("nnInteractive loaded from %s", MODEL_DIR)
    except Exception as error:  # noqa: BLE001
        logger.warning("nnInteractive not loaded: %s", error)
    yield


app = FastAPI(title="Horalix nnInteractive Service", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready")
def ready() -> dict[str, object]:
    return {"ready": backend.ready(), "modelId": backend.model_id}


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
        ]
    )


@app.post("/segment", response_model=SegmentationResponse)
def segment(request: SegmentationRequest) -> SegmentationResponse:
    if not backend.ready():
        raise HTTPException(503, detail="nnInteractive is not loaded.")
    try:
        return backend.segment(request)
    except Exception as error:  # noqa: BLE001
        logger.exception("nnInteractive inference failed")
        raise HTTPException(500, detail=f"nnInteractive failed: {error}") from error
