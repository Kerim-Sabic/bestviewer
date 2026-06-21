# AI Segmentation Integration Reference

How to wire promptable AI segmentation into the viewer correctly and safely. Grounded in
the open-source state of the art (OHIF-AI / OHIF-SAM2, IEEE ISBI 2025) — study those
implementations rather than reinventing the seam.

## Table of Contents
1. [The model landscape and how to choose](#models)
2. [The clinical/language separation (hard rule)](#separation)
3. [Prompt types](#prompts)
4. [3D / temporal propagation](#propagation)
5. [The server inference contract](#contract)
6. [Putting a mask on screen](#mask-to-screen)
7. [Interaction patterns: live mode, refinement, multi-label](#interaction)

---

## Models

Promptable medical segmentation is a small, fast-moving field. The realistic menu (as
integrated by OHIF-AI) and what each is for:

- **SAM2** (Meta) — general promptable segmentation with video/temporal memory; strong,
  general, not medical-specialized.
- **MedSAM2** — SAM2 fine-tuned on large medical datasets (CT/MR/PET/US/endoscopy,
  including echocardiography). The default when you want a *medical* generalist and SAM2
  semantics (points, boxes, slice/frame propagation).
- **nnInteractive** — interactive segmentation that, in preliminary clinical testing, often
  feels **more real-time and more accurate** than SAM-family models on typical clinical
  structures. Benchmark it against MedSAM2 for your modality before committing.
- **SAM3** — newer SAM generation; evaluate availability and licensing.
- **VoxTell** — **text-prompted** segmentation ("segment the left ventricle") rather than
  visual prompts.

**Design the seam model-agnostic.** All visual-prompt models share the same contract
shape (image reference + prompt → mask), so the client and the labelmap-writing code
should not hardcode one model. Make the model a request parameter and let the deployment
choose. This is exactly how OHIF-AI offers a model menu behind one UI.

---

## Separation

Restating SKILL.md §I.2 because it is the rule most likely to be quietly broken:

- The **segmentation model** produces masks. Masks are clinical output.
- A **VLM** (MedGemma locally; or Gemini/GPT/Claude/Qwen/Gemma via API/router; or
  self-hosted via vLLM) produces **language** — report drafts, summaries, Q&A — reasoning
  over measurements that already exist.

A VLM may *technically* emit a segmentation (some can output mask tokens or boxes). Do not
route clinical masks through it. The viewer's measured numbers must always originate in the
segmentation/measurement layer, never in a token-predicting language model. When a VLM
drafts an impression, the numbers in that impression are passed in, not generated, and the
output is labeled AI-generated and left for clinician review (SaMD line).

---

## Prompts

Support the prompt types the chosen model accepts. The full set seen in production:

- **Point** — include/exclude clicks. The lightest prompt; one point can seed a whole
  structure. Model in image-pixel space with a polarity flag.
- **Bounding box** — drag a rectangle around the target. Strong for compact lesions.
- **Scribble** — freehand stroke through the structure.
- **Lasso** — freehand enclosing outline.
- **Text** — for text-prompted models (VoxTell): a natural-language target name.

Represent prompts as a discriminated union in image-pixel coordinates; the engine
translates a viewport mouse event into image pixels (through the frame geometry — not
canvas pixels), and the inference client serializes them. Keep the domain prompt type free
of any Cornerstone or transport detail.

---

## Propagation

The feature that makes AI segmentation feel magical and is now standard:

- **Single prompt → 3D/temporal propagation.** A point or scribble on **one** slice
  propagates the segmentation across the whole volume (or across frames of a loop) via the
  model's memory mechanism (SAM2's streaming memory; nnInteractive's own). The clinician
  prompts once, then fine-tunes.
- **Slice-extend.** Extend an existing segmentation to the next/previous slice on demand,
  then refine with manual tools — Cornerstone exposes this natively with the SAM model.
- After propagation, the result is editable with the full segmentation toolset (brush,
  eraser, threshold, island removal). Propagation seeds; it does not lock.

Design the inference request so it can carry either a single-slice prompt (server
propagates) or be called per-slice, and make propagation results land as ordinary
labelmap writes so the existing tools edit them.

---

## Contract

The wire contract between viewer and the on-prem inference service. Keep it as the single
source of truth (a schema module), parse responses at the boundary, and return typed
results for every failure mode.

**Request** (viewer → service): the image reference (study/series/SOP + frame index, since
the service is on the hospital network and can pull from PACS), the prompt (union above),
the target segment index, and the model id.

**Response** (service → viewer): the mask, **run-length encoded** (a segmentation is mostly
background; RLE shrinks a 512² mask from ~256 KB to a few hundred integers and needs no
image codec to decode), plus width/height, a confidence score, the model version, and
inference time. Decode RLE defensively — clip at the buffer end rather than overrunning on
a malformed stream.

**Failure modes are typed, not thrown:** caller-aborted (the clinician moved on), network
error, non-2xx, and schema-invalid response. Support `AbortSignal` so a superseded request
is cancelled — in live mode, prompts arrive faster than inference completes.

**Deployment:** on-prem GPU (hospital trust + data residency; pixels never leave the
network) is the default; browser WebGPU is a privacy option but cannot be assumed on
clinical hardware and SAM-family models need a GPU. Package the service as a container with
pinned CUDA/torch and health/readiness probes.

---

## Mask to Screen

The mask returned by the service is in **image-pixel** space for a specific frame. To
display it:

1. Decode RLE → a flat binary `Uint8Array`.
2. Map it to the right labelmap frame. Confirm dimensions match the labelmap image's pixel
   count; a mismatch is a typed error, not a silent clip.
3. Write it into the labelmap (`engine-correctness.md` → segmentation lifecycle) and
   trigger a targeted re-render.

Never paint masks onto the canvas directly — they must be labelmap segmentations so they
participate in windowing, the segmentation toolset, visibility/opacity controls, and DICOM
SEG export.

---

## Interaction

Patterns that make it usable, from the OHIF-AI playbook:

- **Live mode.** Optionally re-run inference on every prompt change so the mask updates as
  the clinician clicks, instead of a manual "run" button. Debounce and cancel superseded
  requests (AbortSignal).
- **Iterative refinement.** Add include/exclude points to correct an over- or
  under-segmentation; each refinement is a new prompt that replaces the mask for that
  target.
- **Multi-label.** Support multiple segments (organs, lesions) with distinct indices and
  colors; the active segment index routes writes. Keep per-segment visibility.
- **Confidence + provenance.** Show the model's confidence and stamp the segmentation with
  model id + version. AI output is labeled as such and is always clinician-editable
  (SaMD).
- **Latency honesty.** Show that inference is running; never freeze the UI on a GPU
  round-trip. Keep interaction responsive while the mask resolves.
