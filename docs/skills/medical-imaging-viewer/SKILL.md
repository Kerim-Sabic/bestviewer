---
name: medical-imaging-viewer
description: >
  Build correct, production-grade medical imaging viewers on Cornerstone3D / DICOMweb
  (the engine behind OHIF) — rendering, measurement, AI segmentation (SAM2 / MedSAM2 /
  nnInteractive / SAM3 / VoxTell), and reading-room UI/UX. Use this skill WHENEVER the
  task touches a DICOM viewer, PACS-style interface, radiology or cardiology image
  review, Cornerstone3D or OHIF code, window/level, MPR, hanging protocols, labelmap
  segmentation, echocardiography viewers, or "view/annotate/segment a medical scan" —
  even if the user never says "Cornerstone" or "DICOM" by name. This skill encodes the
  domain failure modes (DICOM coordinate systems, VOI/modality LUTs, the post-2.0
  viewport-centric segmentation API, the SaMD line) that general coding knowledge gets
  wrong. It does NOT replace general engineering craft — it composes with it.
---

# Medical Imaging Viewer

This skill is the domain layer for building medical image viewers. It assumes you
already write excellent TypeScript/React (deep modules, branded types, discriminated
unions, no `any`/`as`/`!`). If an `elite-engineer` skill is available, **it governs all
general craft and this skill governs the medical-imaging specifics** — read both. This
file never restates generic engineering rules; it captures only what is specific to
radiology/cardiology imaging and has real, citable failure modes.

Medical imaging is a regulated, safety-critical domain where a confidently wrong pixel
can mislead a diagnosis. The bar is not "looks like a viewer" — it is "correct against
the DICOM standard, correct against the real Cornerstone API, and honest about what the
software is allowed to claim."

---

## I. THREE NON-NEGOTIABLES

These override convenience, speed, and the user's enthusiasm. Violating any one of them
produces software that is impressive in a demo and dangerous in a reading room.

### 1. Verify against ground truth — never code the API from memory

Cornerstone3D moves fast and its surface is large; training-data recall of its API is
**unreliable and version-dependent**. Before writing engine code:

1. `npm install` the exact `@cornerstonejs/*` packages the project uses.
2. Read the real `.d.ts` files (`node_modules/@cornerstonejs/<pkg>/dist/esm/**`) for the
   methods, enums, and type shapes you will call. Grep them; do not assume.
3. Write the code, then `tsc --noEmit` under `strict` before claiming it works.

"It typechecks against the installed types" is the only acceptable definition of done for
engine code. A function that looks plausible but calls a renamed or moved API is worse
than no code, because it fails in the browser, not the editor. This loop — install, read
types, typecheck — is what actually produces correct code; no amount of asserting
"best practices" substitutes for it.

### 2. Keep the clinical path and the language path separate

For AI features, the model that produces **clinical pixels or numbers** and the model
that produces **language** are different models with different trust levels, and they
must never blur:

- **Segmentation masks, measurements, detections → a validated segmentation model**
  (SAM2 / MedSAM2 / nnInteractive / SAM3). These are the clinical output.
- **Summaries, impressions, Q&A → a VLM** (MedGemma or a frontier/open-weight model)
  reasoning *over* the numbers the segmentation/measurement layer already produced.

A VLM must never be the source of a clinical mask or measurement, even when it
technically can emit one. See `references/ai-segmentation.md`.

### 3. Respect the Software-as-a-Medical-Device (SaMD) line

A viewer whose output influences diagnosis is a regulated medical device (EU MDR, US FDA).
From the first commit: label every build "research use only" vs "diagnostic use," never
let the UI state or imply a diagnosis the software is not cleared to make, and keep AI
output clearly marked as AI-generated and reviewable. When unsure whether a feature
crosses the line, say so and default to the conservative side. See
`references/reading-room-uiux.md` for how this shows up in the interface.

---

## II. VERSION CONTRACT (read before touching segmentation)

Cornerstone3D's architecture changed materially at **2.0** (shipped in OHIF 3.9). Pin the
major version in `package.json` and follow the post-2.0 API. The single most common
regression an agent introduces is regenerating the **pre-2.0 tool-group-centric**
segmentation calls. They are deprecated.

| Concern | Post-2.0 (correct) | Pre-2.0 (do NOT generate) |
|---|---|---|
| Segmentation representation | **Viewport-centric**: `addLabelmapRepresentationToViewport(viewportId, [...])` with a `{ segmentationId, type }` specifier | `addSegmentationRepresentationToToolGroup(toolGroupId, ...)` |
| Labelmap memory | **VoxelManager** (halves memory, optimized access) for volumes | direct large scalar-array copies |
| Rendering space | World coordinates via `imagePositionPatient` / `imageOrientationPatient`; tool state shared across 2D and 3D viewports | per-viewport pixel-space tool state |
| DICOM loader | `@cornerstonejs/dicom-image-loader` (TS, maintained) | `cornerstone-wado-image-loader` (deprecated) |

Always confirm the installed version's exact signatures via the verification loop in §I.1
— this table tells you *which paradigm*, the `.d.ts` tells you the *exact call*.

---

## III. HOW TO USE THE REFERENCES

Read the reference file for the part you are building. Each is self-contained and grounded
in the real API and real clinical convention. Read more than one when a feature spans them
(e.g. an AI segmentation panel spans `ai-segmentation` and `reading-room-uiux`).

| When building... | Read |
|---|---|
| Rendering, viewports, stack vs volume/MPR, window/level, VOI/modality LUT, measurements, the labelmap lifecycle, DICOM coordinate correctness | `references/engine-correctness.md` |
| Prompt-based AI segmentation (point/box/scribble/lasso/text), the server inference contract, 3D propagation, model selection and the clinical/language split | `references/ai-segmentation.md` |
| The interface: dark reading-room theme, keyboard/mouse conventions, window/level presets, hanging protocols, multi-viewport sync, cine, measurement panel, performance budget, and how the SaMD line shows up in UI | `references/reading-room-uiux.md` |

---

## IV. BEFORE THE FIRST LINE — A DOMAIN CHECKLIST

1. **Modality and data shape.** Is this a 2D stack (X-ray, single-frame), a multi-frame
   loop (echo, angiography), or a 3D volume needing MPR (CT, MR)? This decides
   stack-viewport vs volume-viewport and changes everything downstream.
2. **Where do pixels come from?** A DICOMweb server (WADO-RS/QIDO-RS) is the default.
   Confirm the endpoint and that the viewer is a client-side island (canvas cannot SSR).
3. **Where does AI run?** On-prem GPU is the trust-and-predictability default for
   hospitals; browser WebGPU is a privacy option but cannot be assumed on clinical
   hardware. Decide before designing the inference seam.
4. **What is this build allowed to claim?** Research vs diagnostic. Set the labeling now.
5. **Is there a reference implementation to study?** OHIF (the viewer) and OHIF-AI /
   OHIF-SAM2 (the AI integration) are open-source and battle-tested. Study them; do not
   pretend to be first.

Then read the relevant reference(s) and build, applying your general engineering craft
throughout.
