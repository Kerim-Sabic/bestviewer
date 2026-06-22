"""Backend protocol. A backend loads a model once and segments per request."""

from __future__ import annotations

from abc import ABC, abstractmethod

from contract import SegmentationRequest, SegmentationResponse


class SegmentationBackend(ABC):
    model_id: str = "unconfigured"
    label: str = "Unconfigured"
    version: str | None = None

    @abstractmethod
    def ready(self) -> bool:
        """True once weights are loaded on the device."""

    @abstractmethod
    def load(self) -> None:
        """Load weights onto the GPU. Safe to call more than once."""

    @abstractmethod
    def segment(self, request: SegmentationRequest) -> SegmentationResponse:
        """Run the model on the prompts. Never fabricate anatomy — return what
        the model produced. For propagate=True, use the model's temporal memory
        to extend the mask across the loop's frames."""
