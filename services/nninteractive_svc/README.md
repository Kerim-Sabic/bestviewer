# nnInteractive service (separate venv)

nnInteractive (DKFZ) ships an nnU-Net dependency stack that conflicts with SAM2's
torch, so it runs as its own process. The main Horalix segmentation service
(`../segmentation`) proxies model id `nninteractive` to this one
(`backends/remote_backend.py`), so the viewer still shows a single model menu.

> Model license: **CC BY-NC-SA 4.0** — non-commercial research use.

## Setup (Blackwell / RTX 50-series)

```bash
cd services/nninteractive_svc
python -m venv .venv-nnint
.venv-nnint/Scripts/python -m pip install -U pip
.venv-nnint/Scripts/python -m pip install nninteractive fastapi "uvicorn[standard]" \
    pydicom pylibjpeg pylibjpeg-libjpeg pylibjpeg-openjpeg requests numpy huggingface_hub
# nnInteractive's resolver pulls a CPU torch — force the cu128 build back in:
.venv-nnint/Scripts/python -m pip install --force-reinstall --no-deps \
    torch torchvision --index-url https://download.pytorch.org/whl/cu128
# model
.venv-nnint/Scripts/python -c "from huggingface_hub import snapshot_download; \
    snapshot_download('nnInteractive/nnInteractive', local_dir='model', allow_patterns=['nnInteractive_v1.0/*'])"
```

## Run

```bash
ORTHANC_URL=http://localhost:8042 \
NNINTERACTIVE_MODEL_DIR=./model/nnInteractive_v1.0 \
.venv-nnint/Scripts/python -m uvicorn app:app --host 0.0.0.0 --port 8002

# then on the main service:
NNINTERACTIVE_SERVICE_URL=http://localhost:8002  # registers it in /models
```

It reuses the shared contract/RLE/DICOM-source from `../segmentation`. A 2D frame
is handled as a degenerate `(1, H, W, 1)` volume; nnInteractive is strongest on
true 3D CT/MR.
