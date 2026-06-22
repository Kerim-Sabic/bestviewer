"""Remote backend — proxies a model that runs in its own process/venv.

Used for nnInteractive, whose nnU-Net dependency stack conflicts with SAM2's, so
it runs as a separate service. The main service still presents one model menu;
`/segment` for this model id is forwarded to the remote service.
"""

from __future__ import annotations

import requests
from fastapi import HTTPException

from backends.base import SegmentationBackend
from contract import SegmentationRequest, SegmentationResponse


class RemoteBackend(SegmentationBackend):
    def __init__(
        self, model_id: str, label: str, version: str | None, base_url: str
    ) -> None:
        self.model_id = model_id
        self.label = label
        self.version = version
        self._base = base_url.rstrip("/")

    def ready(self) -> bool:
        try:
            response = requests.get(f"{self._base}/ready", timeout=3)
            return bool(response.ok and response.json().get("ready"))
        except requests.RequestException:
            return False

    def load(self) -> None:
        # The remote service loads its own weights.
        return None

    def segment(self, request: SegmentationRequest) -> SegmentationResponse:
        try:
            response = requests.post(
                f"{self._base}/segment", json=request.model_dump(), timeout=600
            )
        except requests.RequestException as error:
            raise HTTPException(502, detail=f"nnInteractive unreachable: {error}")

        if not response.ok:
            raise HTTPException(response.status_code, detail=response.text[:400])

        return SegmentationResponse(**response.json())
