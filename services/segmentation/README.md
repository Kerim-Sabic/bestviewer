# Horalix segmentation service (on-prem GPU)

Promptable AI segmentation / temporal tracking for the viewer. This is the
**clinical-output path** — masks and the measurements derived from them
originate here, in a validated model, never in a language model. It runs
**on-prem on a GPU** so pixels stay on the hospital network.

> **SaMD — research use only.** Until a validated model and the appropriate
> regulatory clearance are in place, output is AI-generated, clinician-editable,
> and must not be presented as a diagnosis.

## Contract

The single source of truth is [`packages/dicom-engine/src/segmentation.ts`](../../packages/dicom-engine/src/segmentation.ts).
`app.py` mirrors it. Summary:

`POST /segment`

```jsonc
// request
{
  "modelId": "medsam2",
  "image": { "studyInstanceUid": "…", "seriesInstanceUid": "…",
             "sopInstanceUid": "…", "frameIndex": 0 },
  "prompts": [ { "kind": "point", "x": 128, "y": 96, "include": true },
               { "kind": "box", "x": 40, "y": 30, "width": 80, "height": 60 } ],
  "segmentIndex": 1,
  "propagate": true        // use temporal memory to extend across frames
}
```

```jsonc
// response — one entry per frame, mask run-length encoded (row-major,
// alternating runs starting with a background run)
{
  "modelId": "medsam2", "modelVersion": "…",
  "confidence": 0.94, "inferenceMs": 180.2,
  "frames": [ { "frameIndex": 0, "width": 256, "height": 256,
                "runLengths": [ 65000, 12, 244, 18, … ] } ]
}
```

Prompts are in **image-pixel** coordinates (the viewer maps mouse → image
pixels through the frame geometry, not canvas pixels). The viewer proxies this
through `POST /api/segment`, which forwards to `SEGMENTATION_SERVICE_URL`.

## Models

A pluggable backend registry (`backends/`) serves a model menu behind one
contract. Shipped:

- **MedSAM2** (`medsam2`) — SAM2.1 fine-tuned on medical data; the default
  medical generalist. Weights `MedSAM2_latest.pt` (Hugging Face `wanglab/MedSAM2`).
- **SAM2.1** (`sam2.1`) — Meta's general promptable model. Weights
  `sam2.1_hiera_base_plus.pt`.
- **nnInteractive** (`nninteractive`) — optional (DKFZ); enable with
  `NNINTERACTIVE_MODEL_DIR` (run in its own venv to avoid dep conflicts).

Both SAM-family backends support **single-frame** prompts (image predictor) and
**temporal propagation** across a multi-frame loop (SAM2 video predictor) for
`propagate=true`. Each pulls the referenced instance from Orthanc via WADO-URI,
decodes pixels (pydicom + JPEG/JPEG2000 codecs), runs the prompts, and returns
RLE masks. `GET /models` lists every backend with a `ready` flag.

## Endpoints

- `GET /health` · `GET /ready` · `GET /models`
- `POST /segment` — promptable segmentation (+ propagation)
- `POST /seg` — build a DICOM SEG (highdicom) from a labelmap and STOW to Orthanc

## Run (GPU host — Blackwell / RTX 50-series needs CUDA 12.8 wheels)

```bash
cd services/segmentation
python -m venv .venv-sam
.venv-sam/Scripts/python -m pip install -U pip
.venv-sam/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
SAM2_BUILD_CUDA=0 .venv-sam/Scripts/python -m pip install "git+https://github.com/facebookresearch/sam2.git"
.venv-sam/Scripts/python -m pip install -r requirements.txt
.venv-sam/Scripts/python download_weights.py          # SAM2.1 + MedSAM2 into weights/
ORTHANC_URL=http://localhost:8042 .venv-sam/Scripts/python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

Then point the viewer at it (`.env.local`): `SEGMENTATION_SERVICE_URL=http://localhost:8000`.
A Docker build (`Dockerfile`, CUDA base) is provided for on-prem deployment.

`ORTHANC_URL` (default `http://localhost:8042`) is the Orthanc base the service
pulls frames from (WADO-URI) and STOWs SEGs to (DICOMweb).
