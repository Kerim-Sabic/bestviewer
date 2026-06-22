"""Run-length encoding/decoding matching the viewer's scheme.

Row-major, alternating run lengths that START with a background (0) run — the
exact format `decodeFrameMask`/`encodeMaskRle` use in segmentation.ts. A
segmentation is mostly background, so RLE keeps a 512^2 mask to a few hundred
integers with no image codec.
"""

from __future__ import annotations

import numpy as np


def encode_mask_rle(mask: np.ndarray) -> list[int]:
    """Encode a 2D binary mask (row-major) into run lengths starting with a
    background run. If the first pixel is foreground, a leading zero-length
    background run is emitted so the alternation invariant holds."""
    flat = (np.asarray(mask).reshape(-1) > 0).astype(np.int8)
    n = int(flat.size)

    if n == 0:
        return [0]

    change_points = np.flatnonzero(np.diff(flat)) + 1
    bounds = np.concatenate(([0], change_points, [n]))
    lengths = np.diff(bounds).astype(int).tolist()

    if flat[0] == 1:
        return [0, *lengths]

    return lengths


def decode_mask_rle(run_lengths: list[int], width: int, height: int) -> np.ndarray:
    """Inverse of encode_mask_rle — used by SEG export to rebuild a mask."""
    total = width * height
    mask = np.zeros(total, dtype=np.uint8)
    offset = 0
    is_foreground = False

    for run in run_lengths:
        end = min(offset + run, total)
        if is_foreground:
            mask[offset:end] = 1
        offset = end
        is_foreground = not is_foreground
        if offset >= total:
            break

    return mask.reshape((height, width))
