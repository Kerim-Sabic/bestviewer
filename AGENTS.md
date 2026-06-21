# Horalix DICOM Viewer Agent Rules

This repository is for building the Horalix DICOM Viewer: a production-grade,
browser-based medical imaging viewer for radiology/cardiology workflows.

## Read Before Coding

Before implementation work, read:

- `docs/skills/elite-engineer/SKILL.md`
- `docs/skills/elite-engineer/references/architecture.md`
- The relevant `docs/skills/elite-engineer/references/*` file for the task
- `docs/skills/medical-imaging-viewer/SKILL.md`
- The relevant medical imaging reference:
  - `docs/skills/medical-imaging-viewer/references/engine-correctness.md`
  - `docs/skills/medical-imaging-viewer/references/ai-segmentation.md`
  - `docs/skills/medical-imaging-viewer/references/reading-room-uiux.md`

Medical imaging guidance wins on domain specifics. Elite engineering guidance wins on
general architecture, TypeScript, React, and UI craft.

## Current Starting Constraint

`packages/dicom-engine/` contains the local typed headless Cornerstone3D engine for this
repo. The original external engine source referenced by the setup prompt was not
available, so this package is now the source of truth. Keep it headless, typed, and
verified against installed Cornerstone `.d.ts` files before wiring UI features.

## Non-Negotiables

1. Verify against ground truth.
   - Install the exact `@cornerstonejs/*` versions used by the project.
   - Read the real `.d.ts` files under `node_modules/@cornerstonejs/*/dist/esm/**`
     before calling Cornerstone APIs.
   - Engine code is done only when it typechecks against installed package types.

2. Keep clinical output separate from language output.
   - Segmentation masks, measurements, and detections come only from validated
     segmentation/measurement paths.
   - VLMs may draft language only from existing measurements and segmentations.
   - Never route clinical masks or measurements through a VLM.

3. Respect the SaMD line.
   - Label the build as research-use or diagnostic-use.
   - Mark AI output as AI-generated and clinician-editable.
   - Do not imply a diagnosis unless the software is cleared for that use.

## Build Phases

Work in PR-sized phases. Do not advance to the next phase with a red build.

1. Skeleton and first pixels: scaffold the app, wire `packages/dicom-engine`, render one
   stack viewport from Orthanc.
2. Tools and measurement: manipulation tools, annotation tools, measurement panel,
   window/level presets, hotkeys.
3. Volume/MPR and layout: volume viewports, MPR planes, crosshairs, hanging protocols,
   viewport sync, cine.
4. AI segmentation: prompt tools, segmentation panel, live/refinement modes,
   multi-label, propagation, model-agnostic inference contract.
5. VLM report panel: editable AI-labeled impressions over existing measurements only.
6. Polish: reading-room dark theme, accessibility, performance, SaMD labeling.

## Verification Commands

Once the app is scaffolded and package scripts exist, run these before advancing phases:

```bash
npm run typecheck
npm run lint
npm run build
```

Use the project dev command for manual verification:

```bash
npm run dev
```

TypeScript must be strict, with `noUncheckedIndexedAccess` enabled.

## Definition Of Done

- `tsc --noEmit` clean under strict TypeScript.
- Lint clean.
- Zero `any`.
- Zero `as` except `as const` and narrow branded-id constructors.
- Zero non-null assertions.
- Zero `@ts-ignore`.
- No deprecated Cornerstone APIs.
- No `cornerstone-wado-image-loader`, `cornerstone-tools`, or `cornerstone-core`.
- AI output is visibly labeled, editable, and never presented as diagnosis.
- Displayed pixel values are not altered by UI chrome or visual effects.

## Architecture Rules

- Keep `app/` route files thin.
- Prefer vertical slices by feature/domain.
- Push client components to the leaf level.
- Do not introduce pass-through layers or premature abstractions.
- Use Zod or equivalent parsing at external boundaries.
- Use discriminated unions for async state and workflow state.
- Keep clinical, measurement, segmentation, language, and UI concerns explicitly
  separated.

## Forbidden Patterns

- Reimplementing `packages/dicom-engine`.
- Coding Cornerstone calls from memory.
- Tool-group-centric pre-2.0 segmentation APIs.
- Routing clinical masks, detections, or measurements through a VLM.
- Saturated UI chrome, gamification, or decoration that compromises reading-room use.
- Barrel-file re-export sprawl at feature boundaries.
- `useEffect` for event handling or derived state.
- Loading booleans where a discriminated union is needed.
