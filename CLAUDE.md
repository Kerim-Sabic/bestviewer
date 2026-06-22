# Horalix DICOM Viewer

Production-grade, browser-based medical imaging viewer for radiology/cardiology
(Cornerstone3D 3.x + DICOMweb, Next 15 / React 19, TypeScript strict).

## Skills govern this work

Two project skills are installed natively under `.claude/skills/` and load
automatically:

- **medical-imaging-viewer** — domain correctness (DICOM coords, VOI/LUT,
  measurements, the post-2.0 viewport-centric segmentation API, SaMD).
- **elite-engineer** — architecture, TypeScript, React, and visual craft.

Medical-imaging guidance wins on domain specifics; elite-engineer wins on
general craft. They compose.

## Non-negotiables

1. **Verify against ground truth.** Read the real `.d.ts` under
   `node_modules/@cornerstonejs/*/dist/esm/**` before calling a Cornerstone API.
   Engine code is done only when it typechecks against installed types.
2. **Clinical output ≠ language output.** Masks/measurements/detections come
   only from validated segmentation/measurement paths. A VLM drafts language
   over numbers that already exist — never a clinical mask.
3. **SaMD line.** Build is labeled "Research use only". AI output is marked
   AI-generated, clinician-editable, never presented as a diagnosis. Do not
   alter displayed pixel values with UI chrome.

## Routing

- `/` — **home**: upload a study (STOW to Orthanc) or pick a previously uploaded
  one (`home-view.tsx`); each card links to the viewer.
- `/viewer/[study]` — the reading room **scoped to one study**: a left **cine
  rail** (all loadable series; switch between loops) + the viewport + tools. AI
  segmentation is always scoped to the one active cine; propagation is on by
  default so a single prompt tracks the whole loop and moves with cine playback.

## Architecture

- `packages/dicom-engine/` — the headless, typed engine (source of truth).
  Branded ids, `Result` type, runtime init, DICOMweb fetch, stack viewport +
  tool group, window/level, **measurements** (`measurement.ts`), **local file
  load** (`local-file.ts`), **AI segmentation seam** (`segmentation.ts`). Built
  to `dist/`; the app imports from there, so rebuild the workspace after engine
  edits (`npm run build --workspace @horalix/dicom-engine`).
- `src/features/viewer/` — vertical slice: components, hooks, lib, server.
- `src/app/api/` — thin Next proxies: `dicomweb` (WADO), `orthanc/studies`
  (QIDO), `segment` (→ on-prem GPU service via `SEGMENTATION_SERVICE_URL`).
- `services/segmentation/` — on-prem GPU inference service scaffold (FastAPI +
  CUDA Dockerfile) implementing the `segmentation.ts` contract.
- Server Components by default; the canvas island (`viewer-client.tsx`) is
  `ssr: false`. Parse external data with Zod. Discriminated unions for async
  and workflow state.

## Status

- **Done:** Phase 1 (render from Orthanc) · Phase 2 (Length/Probe/ROI/
  Bidirectional/Angle tools, measurement panel, hotkeys, window/level presets,
  cine) · local DICOM upload (in-browser) · UI overhaul · STOW-RS upload.
- **Phase 3 (AI + MPR), verified end-to-end in-browser:** promptable AI
  **segmentation + temporal tracking** — point/box prompts in image space,
  viewport-centric labelmap rendering, multi-label, opacity/visibility, live
  mode, provenance. Real on-prem GPU service serving a **3-model menu**:
  **MedSAM2 + SAM2.1** (`services/segmentation/`, SAM2 video propagation) and
  **nnInteractive** (`services/nninteractive_svc/`, separate venv, proxied) —
  all on Blackwell (torch cu128). **DICOM SEG export** → Orthanc (highdicom).
  **Volume/MPR** (axial/coronal/sagittal, verified on a CT phantom). **VLM
  report** wired to a local OpenAI-compatible server (`services/vlm/`); drafts
  language over existing numbers only — never a mask (SaMD).
- **Run:** segmentation service `uvicorn app:app --port 8000`; nnInteractive
  `uvicorn app:app --port 8002` (+ `NNINTERACTIVE_SERVICE_URL` on the main
  service); VLM `python -m llama_cpp.server --port 8001`. See each service's
  README / requirements header. `.env.local` sets `SEGMENTATION_SERVICE_URL`
  and `REPORT_PROVIDER`.
- **Verify in-browser:** `node scripts/e2e-verify.mjs` (click→mask),
  `node scripts/e2e-mpr.mjs` (MPR). `scripts/make_ct_phantom.py` seeds a
  synthetic CT volume for MPR.
- **Echo UX pass:** **LV function** panel — propagate an AI segment across the
  cardiac cycle, then auto-compute **Fractional Area Change** (ED/ES from the
  per-frame area curve, calibrated mm² when PixelSpacing present; honestly *not*
  called EF). Multi-frame loop labelmaps render correctly (engine keeps an
  order-aligned frame→labelmap map). Viewport quick tools (invert `I`, flip
  `H`/`V`, reset) + modality label. Verified in-browser: `scripts/e2e-cardiac.mjs`.
- **Next (echo-focused):** biplane Simpson's / GLS strain · A4C/A2C/PLAX hanging
  protocols + multi-loop sync · Doppler/velocity tools · swap MedGemma in for
  the report model · cardiac-specialized AI (EchoNet-style) behind the same seam.

## Verify

```bash
npm run typecheck   # engine tsc + next typegen + app tsc (strict, noUncheckedIndexedAccess)
npm run lint        # eslint --max-warnings=0
npm run dev -- --port 3001   # 3000 may be taken; Orthanc at :8042 (docker compose up -d orthanc)
```

For behavior changes, **run the app and observe** (the `verify` skill) — drive
the real GUI, don't just typecheck. Definition of done: tsc clean, lint clean,
zero `any`/`as` (except `as const` + branded constructors)/`!`/`@ts-ignore`, no
deprecated or pre-2.0 Cornerstone APIs.
