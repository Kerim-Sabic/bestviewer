"""Pull and decode pixel frames from PACS (Orthanc) on the hospital network.

The service is on-prem, so it fetches the referenced instance directly from
Orthanc via WADO-URI (returns a single DICOM Part-10 object — no multipart to
parse) and decodes pixels with pydicom + the installed JPEG/JPEG2000 codecs.
Pixels never leave the network.
"""

from __future__ import annotations

import io
import os
import threading
from collections import OrderedDict

import numpy as np
import pydicom
import requests
from PIL import Image
from pydicom.pixel_data_handlers.util import apply_voi_lut, convert_color_space

ORTHANC_URL = os.environ.get("ORTHANC_URL", "http://localhost:8042").rstrip("/")

# Decoding a 96-frame YBR ultrasound loop is the dominant per-request cost, and a
# clinician clicks the same loop many times. Cache the decoded frames per
# instance (small LRU) so we pull + decode once, then reuse. Capacity is in
# instances; ~3 loops of 96x800x600x3 ≈ 0.4 GB.
_FRAME_CACHE_CAPACITY = int(os.environ.get("HORALIX_FRAME_CACHE", "4"))
_frame_cache: "OrderedDict[str, list[np.ndarray]]" = OrderedDict()
_frame_cache_lock = threading.Lock()


def get_instance_frames(
    study_uid: str, series_uid: str, sop_uid: str
) -> list[np.ndarray]:
    """Decoded RGB frames for an instance, cached across requests."""
    key = f"{study_uid}|{series_uid}|{sop_uid}"
    with _frame_cache_lock:
        cached = _frame_cache.get(key)
        if cached is not None:
            _frame_cache.move_to_end(key)
            return cached

    frames = instance_frames_rgb(fetch_instance(study_uid, series_uid, sop_uid))

    with _frame_cache_lock:
        _frame_cache[key] = frames
        _frame_cache.move_to_end(key)
        while len(_frame_cache) > _FRAME_CACHE_CAPACITY:
            _frame_cache.popitem(last=False)
    return frames


_single_frame_cache: "OrderedDict[str, np.ndarray]" = OrderedDict()
_single_frame_lock = threading.Lock()


def get_single_frame_rgb(
    study_uid: str, series_uid: str, sop_uid: str, frame_index: int
) -> np.ndarray:
    """One frame as an RGB array — for single-frame (non-propagate) inference.

    Avoids pulling and decoding a whole 96-frame loop for one click: fetches just
    the requested frame via WADO-RS `rendered` (already display-RGB, correctly
    color-converted server-side). Falls back to the whole-instance cache if it is
    already decoded. Per-frame LRU so repeated clicks on a frame are instant.
    """
    key = f"{study_uid}|{series_uid}|{sop_uid}|{frame_index}"
    with _single_frame_lock:
        cached = _single_frame_cache.get(key)
        if cached is not None:
            _single_frame_cache.move_to_end(key)
            return cached

    instance_key = f"{study_uid}|{series_uid}|{sop_uid}"
    with _frame_cache_lock:
        whole = _frame_cache.get(instance_key)
    if whole is not None and 0 <= frame_index < len(whole):
        return whole[frame_index]

    url = (
        f"{ORTHANC_URL}/dicom-web/studies/{study_uid}/series/{series_uid}"
        f"/instances/{sop_uid}/frames/{frame_index + 1}/rendered"
    )
    response = requests.get(url, headers={"accept": "image/jpeg"}, timeout=30)
    response.raise_for_status()
    frame = np.ascontiguousarray(
        np.asarray(Image.open(io.BytesIO(response.content)).convert("RGB"))
    )

    with _single_frame_lock:
        _single_frame_cache[key] = frame
        _single_frame_cache.move_to_end(key)
        while len(_single_frame_cache) > 96:
            _single_frame_cache.popitem(last=False)
    return frame


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
        rgb = frame
        if photometric.startswith("YBR"):
            try:
                rgb = convert_color_space(frame, photometric, "RGB")
            except Exception:
                rgb = frame
        if rgb.dtype == np.uint8:
            return np.ascontiguousarray(rgb)
        return _normalize(rgb.astype(np.float32))

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
