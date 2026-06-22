"""Pull and decode pixel frames from PACS (Orthanc) on the hospital network.

The service is on-prem, so it fetches the referenced instance directly from
Orthanc via WADO-URI (returns a single DICOM Part-10 object — no multipart to
parse) and decodes pixels with pydicom + the installed JPEG/JPEG2000 codecs.
Pixels never leave the network.
"""

from __future__ import annotations

import io
import os

import numpy as np
import pydicom
import requests
from pydicom.pixel_data_handlers.util import apply_voi_lut

ORTHANC_URL = os.environ.get("ORTHANC_URL", "http://localhost:8042").rstrip("/")


def fetch_instance(study_uid: str, series_uid: str, sop_uid: str) -> pydicom.Dataset:
    """Retrieve one instance as a Part-10 DICOM dataset via WADO-URI."""
    response = requests.get(
        f"{ORTHANC_URL}/wado",
        params={
            "requestType": "WADO",
            "studyUID": study_uid,
            "seriesUID": series_uid,
            "objectUID": sop_uid,
            "contentType": "application/dicom",
        },
        timeout=60,
    )
    response.raise_for_status()
    return pydicom.dcmread(io.BytesIO(response.content))


def instance_frames_rgb(dataset: pydicom.Dataset) -> list[np.ndarray]:
    """Decode every frame of an instance to a list of HxWx3 uint8 RGB arrays
    (what SAM-family models expect), at the frame's native resolution (so the
    returned mask is in the same image-pixel space the viewer prompted in)."""
    pixels = dataset.pixel_array
    samples_per_pixel = int(getattr(dataset, "SamplesPerPixel", 1))
    photometric = str(getattr(dataset, "PhotometricInterpretation", "MONOCHROME2"))

    frames: list[np.ndarray] = []

    if pixels.ndim == 2:
        frames = [pixels]
    elif pixels.ndim == 3:
        if samples_per_pixel == 3 and pixels.shape[-1] == 3:
            frames = [pixels]
        else:
            frames = [pixels[index] for index in range(pixels.shape[0])]
    elif pixels.ndim == 4:
        frames = [pixels[index] for index in range(pixels.shape[0])]
    else:
        raise ValueError(f"Unsupported pixel array shape {pixels.shape}")

    return [_to_rgb_uint8(frame, dataset, photometric) for frame in frames]


def _to_rgb_uint8(
    frame: np.ndarray, dataset: pydicom.Dataset, photometric: str
) -> np.ndarray:
    if frame.ndim == 3 and frame.shape[-1] == 3:
        if frame.dtype == np.uint8:
            return np.ascontiguousarray(frame)
        return _normalize(frame.astype(np.float32))

    gray = frame.astype(np.float32)

    if "WindowCenter" in dataset and "WindowWidth" in dataset:
        try:
            gray = apply_voi_lut(frame, dataset).astype(np.float32)
        except Exception:
            gray = frame.astype(np.float32)

    if photometric == "MONOCHROME1":
        gray = gray.max() - gray

    gray_u8 = _normalize(gray)
    return np.ascontiguousarray(np.stack([gray_u8, gray_u8, gray_u8], axis=-1))


def _normalize(array: np.ndarray) -> np.ndarray:
    lower, upper = np.percentile(array, [1.0, 99.0])
    if upper <= lower:
        lower, upper = float(array.min()), float(array.max())
    if upper <= lower:
        return np.zeros(array.shape, dtype=np.uint8)
    scaled = np.clip((array - lower) / (upper - lower), 0.0, 1.0) * 255.0
    return scaled.astype(np.uint8)
