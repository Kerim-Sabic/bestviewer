# Build Prompts - Guide

This repo now contains the Codex-ready medical imaging viewer scaffold, including the
local DICOM engine package and the extracted project skills under `docs/skills/`.

## The files

- `claude-code-prompt.md` - prompt intended for Claude Code.
- `codex-prompt.md` - prompt intended for Codex.
- `docs/skills/medical-imaging-viewer/` - extracted viewer skill instructions.
- `docs/skills/elite-engineer/` - extracted engineering skill instructions.
- `packages/dicom-engine/` - local Cornerstone and DICOMweb engine package.

## Why the prompts differ

The mission, phases, and definition of done are identical. What changes is how each
agent loads rules and verifies work.

| | Claude Code | Codex |
|---|---|---|
| Skill system | Native. Install `.skill` files and reference them by name. | Skills are committed into the repo as docs under `docs/skills/...`. |
| Persistent rules | `CLAUDE.md` | `AGENTS.md` |
| Planning | Plan mode first, with tracked todos. | Phase plan up front, with verification before advancing. |
| Verify loop | Install, read real `.d.ts`, then run type checks. | Install, read real `.d.ts`, then keep `typecheck`, `lint`, and `build` green. |

Both enforce the same non-negotiables: verify against real Cornerstone types, keep the
clinical segmentation path separate from language/VLM workflows, and respect the SaMD
line.

## Local development

Start the viewer:

```powershell
npm run dev -- --port 3001
```

Start Orthanc with DICOMweb enabled:

```powershell
docker compose up -d orthanc
```

Local endpoints:

- Viewer: `http://localhost:3001`
- Orthanc UI: `http://localhost:8042/ui/`
- Orthanc DICOMweb: `http://localhost:8042/dicom-web`

Upload a DICOM file into the local Orthanc instance:

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:8042/instances" -InFile "C:\path\to\file.dcm" -ContentType "application/dicom"
```

The viewer proxy defaults to `http://localhost:8042/dicom-web`. Override it with
`ORTHANC_DICOMWEB_URL` if Orthanc runs somewhere else.

The local Orthanc container disables authentication for development only. Do not expose
it outside your machine.

## Current status

Beyond the first Orthanc integration milestone, the viewer now has:

- **Rendering** — stack viewport from Orthanc DICOMweb (browse studies, load a
  series without pasting UIDs) and from **local DICOM files** dropped straight
  from your PC (no PACS round trip).
- **Measurement** — Length, Probe, Rectangle ROI, Bidirectional and Angle tools
  with a live measurement panel, layout-independent hotkeys, and window/level
  presets. Units are calibration-honest: millimetres only when `PixelSpacing`
  is present, pixels (flagged "uncalibrated") otherwise.
- **Cine** — play/pause, scrub, frame rate, loop/bounce for multi-frame loops.
- **AI segmentation seam** — a model-agnostic, typed inference contract
  (`packages/dicom-engine/src/segmentation.ts`) plus an on-prem GPU service
  scaffold (`services/segmentation/`). The prompt UI and labelmap rendering are
  the next step; the GPU service must be deployed for inference to run.

Volume/MPR and the VLM report panel remain later milestones. AI masks always
originate in the validated service, never in a language model (SaMD line).
