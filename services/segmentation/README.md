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

## Wiring a model

`load_backend()` returns a stub; `/segment` returns **501** until you implement
one. A real backend should be **model-agnostic-friendly** (MedSAM2 by default;
SAM2 / nnInteractive / SAM3 are drop-ins behind the same contract):

1. Load weights onto CUDA once at startup; set `model_id` / `model_version`,
   make `ready()` return `True`.
2. Per request: pull the referenced frame(s) from PACS, run the model with the
   prompts, and for `propagate=True` use the model's temporal memory to extend
   the mask across the loop.
3. RLE-encode each mask and return it. Never fabricate anatomy.

## Run

```bash
# build + run on a GPU host (needs the NVIDIA container runtime)
docker build -t horalix-seg services/segmentation
docker run --gpus all -p 8000:8000 horalix-seg

# point the viewer at it
SEGMENTATION_SERVICE_URL=http://localhost:8000 npm run dev -- --port 3001
```

`GET /health` (liveness) and `GET /ready` (model loaded) back the container
health checks.
