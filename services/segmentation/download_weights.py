"""Download model weights into services/segmentation/weights/.

  python download_weights.py            # SAM2.1 base+ and MedSAM2
  python download_weights.py --sam2     # only SAM2.1
  python download_weights.py --medsam2  # only MedSAM2

Weights are large and never committed (see .gitignore). SAM2.1 comes from Meta's
public file host; MedSAM2 from the bowang-lab Hugging Face repo.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request

WEIGHTS_DIR = os.environ.get(
    "HORALIX_WEIGHTS_DIR", os.path.join(os.path.dirname(__file__), "weights")
)

SAM21_BASE_PLUS_URL = (
    "https://dl.fbaipublicfiles.com/segment_anything_2/092824/"
    "sam2.1_hiera_base_plus.pt"
)

MEDSAM2_REPO = "wanglab/MedSAM2"
MEDSAM2_FILE = "MedSAM2_latest.pt"


def _download_url(url: str, dest: str) -> None:
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  exists: {dest}")
        return
    print(f"  downloading {url}")
    tmp = f"{dest}.part"
    urllib.request.urlretrieve(url, tmp)  # noqa: S310 — trusted host
    os.replace(tmp, dest)
    print(f"  saved: {dest} ({os.path.getsize(dest) // (1024 * 1024)} MB)")


def download_sam2() -> None:
    print("SAM2.1 (general):")
    _download_url(
        SAM21_BASE_PLUS_URL, os.path.join(WEIGHTS_DIR, "sam2.1_hiera_base_plus.pt")
    )


def download_medsam2() -> None:
    print("MedSAM2 (medical):")
    dest = os.path.join(WEIGHTS_DIR, MEDSAM2_FILE)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  exists: {dest}")
        return
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(
        repo_id=MEDSAM2_REPO, filename=MEDSAM2_FILE, local_dir=WEIGHTS_DIR
    )
    print(f"  saved: {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download segmentation weights")
    parser.add_argument("--sam2", action="store_true", help="only SAM2.1")
    parser.add_argument("--medsam2", action="store_true", help="only MedSAM2")
    args = parser.parse_args()

    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    do_all = not args.sam2 and not args.medsam2

    if args.sam2 or do_all:
        download_sam2()
    if args.medsam2 or do_all:
        try:
            download_medsam2()
        except Exception as error:  # noqa: BLE001
            print(f"  MedSAM2 download failed: {error}", file=sys.stderr)

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
