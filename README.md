# Build Prompts — Guide

Two prompts, same mission, tuned to how each agent actually works. Use them with the
`medical-imaging-viewer` skill and your `elite-engineer` skill, on top of the existing
`horalix-dicom-engine` you already have.

## The files

- **`claude-code-prompt.md`** — paste into Claude Code.
- **`codex-prompt.md`** — paste into Codex.

## Why they differ

The mission, phases, and definition of done are identical. What changes is **how each
agent loads the rules and verifies its work** — and that difference matters, because the
whole point is forcing the agent to verify against ground truth instead of improvising.

| | Claude Code | Codex |
|---|---|---|
| Skill system | Native. Install the `.skill` files; reference them by name. | None. The skill is **committed into the repo** as docs at `docs/skills/...` and referenced by path. |
| Persistent rules | `CLAUDE.md` | `AGENTS.md` (written as the first action, re-read each turn) |
| Planning | Plan mode first, `TodoWrite` to track phases | Phase plan up front, PR-sized commit per phase |
| Verify loop | Its bash tool: install → read `.d.ts` → `tsc --noEmit` | Sandbox: install → read `.d.ts` → `npm run typecheck`/`lint` green before advancing |

Both enforce the same three non-negotiables (verify against the real Cornerstone types;
keep the clinical/segmentation path separate from the language/VLM path; respect the SaMD
line) and the same forbidden-pattern list.

## Setup before pasting

**Claude Code**
1. Install both skills so they appear in the skill list: `medical-imaging-viewer.skill`
   (this folder) and your `elite-engineer.skill`. (In Claude Code, skills install from the
   skills directory or via the skills UI.)
2. Put the engine source at `packages/dicom-engine/`.
3. Paste `claude-code-prompt.md`. Let it run in plan mode and approve the plan.

**Codex**
1. Codex can't load `.skill` files, so unzip the skill and commit it:
   `docs/skills/medical-imaging-viewer/` (the `SKILL.md` + `references/`), and
   `docs/skills/elite-engineer/` if you have it. (A `.skill` file is just a zip — extract
   it and commit the folder.)
2. Put the engine source at `packages/dicom-engine/`.
3. Paste `codex-prompt.md`. It writes `AGENTS.md` first, then builds in phases.

## Using both at once (optional)

Running them side by side on the same spec is a useful way to compare output quality. Give
them **separate branches or worktrees** so they don't fight over the same files, then diff
the results. They share the same non-negotiables, so the two builds should be
architecturally comparable — the differences you see are the agents', not the brief's.

## A realistic expectation

These prompts produce a serious build, but neither agent has run the engine against a live
Orthanc + GPU inference service yet. Phase 1 (first pixels from a real study) and phase 4
(a real or faithfully-mocked MedSAM2 service) are where the integration risk actually
resolves — treat reaching those, green, as the real milestones, not the line count.
