# Reading-Room UI/UX Reference

How a medical viewer should feel to the person reading studies all day. This is where a
viewer differentiates — the rendering engine is the same one everyone uses; the surface is
not. Apply your general visual-design standard (type scale, OKLCH tokens, 8-pt grid,
motion-with-purpose, INP budget) on top of these domain conventions. If a
`frontend-design` or `elite-engineer` visual standard is available, follow it for the
*how*; this file covers the *what* that is specific to radiology/cardiology.

## Table of Contents
1. [The dark reading-room aesthetic](#dark)
2. [Input conventions radiologists expect](#input)
3. [Window/level presets](#presets)
4. [Hanging protocols and layout](#hanging-protocols)
5. [Multi-viewport synchronization](#sync)
6. [Cine for multi-frame](#cine)
7. [The measurement & series panels](#panels)
8. [Performance as a UX feature](#performance)
9. [Accessibility and the SaMD line in UI](#a11y-samd)

---

## Dark

Reading rooms are dimly lit to maximize perceived contrast on the image; a bright UI
around a dark scan causes glare and eye strain over an 8-hour shift. Therefore:

- **Dark by design, not inverted.** Build the dark theme as the primary theme with elevated
  surfaces getting *lighter* and desaturated, shadows expressed as luminance, not a
  light theme with colors flipped. The image is the brightest thing on screen; chrome
  recedes.
- **Neutral, low-chroma chrome.** Avoid saturated UI color competing with the image.
  Reserve color for state (active tool, AI overlay, alerts) and segmentation labels.
- **Maximize the viewport.** Pixels are the product. Panels collapse; the image area is
  default-dominant; full-screen is one keystroke away.
- **Calibrated grayscale.** Respect the displayed dynamic range; don't apply UI filters,
  CSS `filter`, or blend modes over the image canvas that alter displayed pixel values.

---

## Input

PACS users have decades of muscle memory. Match it; do not invent novel gestures:

- **Scroll wheel → stack/slice navigation.** The core interaction. Up/down moves through
  the stack or volume slices.
- **Left-drag → window/level** (the default PACS convention: horizontal = width, vertical =
  center). When an annotation tool is active, it takes the primary button and W/L moves to
  passive.
- **Right-drag → zoom**, **middle-drag → pan**, **wheel-click** as auxiliary.
- **Keyboard hotkeys** for everything frequent: tool selection (e.g. `L` length, `P` probe,
  `B` brush), W/L presets (number keys `1`–`9`), invert (`I`), reset (`R` / spacebar),
  next/previous series, cine play/pause, layout presets, full-screen. Make them remappable;
  every site has preferences.
- **Reference lines / crosshairs** for MPR: hovering one plane shows the corresponding
  position on the others; clicking jumps all views to that point.

---

## Presets

Window/level presets are not decoration — they are how radiologists switch between tissues
in one click. Ship per-modality presets and bind them to number keys. Representative CT
presets (width / center, in HU):

| Preset | Width | Center |
|---|---|---|
| Brain | 80 | 40 |
| Subdural | 215 | 75 |
| Stroke | 40 | 40 |
| Soft tissue / Abdomen | 400 | 50 |
| Mediastinum | 350 | 50 |
| Liver | 150 | 30 |
| Lung | 1500 | −600 |
| Bone | 2500 | 480 |
| Angio (CTA) | 600 | 300 |

(Values are conventional starting points; sites tune them. MR has no universal HU scale —
derive presets from the sequence and the data's VOI, and honor any `WindowWidth` /
`WindowCenter` in the DICOM header as the initial preset.) Always seed the initial display
from the header's VOI if present, then let presets and manual W/L take over.

---

## Hanging Protocols

A hanging protocol is the rule that decides **which series go in which viewport cells and
how**, automatically, the moment a study opens — so the radiologist isn't dragging series
around. This is a hallmark of a serious viewer:

- **Layout by study type.** A chest CT hangs differently from a brain MR from a
  mammogram. Define protocols keyed on modality / body part / study description.
- **Prior comparison.** Place the current study beside the relevant prior in matching
  planes for side-by-side reading; sync their scrolling.
- **Sequence/series assignment.** For MR, route named sequences (T1, T2, FLAIR, DWI) into
  defined cells. For multi-phase CT, order phases.
- **Sensible default + manual override.** Auto-hang, but let the user re-arrange and
  optionally save a custom protocol. OHIF's hanging-protocol engine is a good reference
  model.

---

## Sync

When multiple viewports show related data, synchronize them so they move as one:

- **Scroll sync** — linked slice navigation across viewports (current vs prior; the three
  MPR planes).
- **Window/level sync** — one adjustment applies to all linked viewports.
- **Zoom/pan (camera) sync** — pan/zoom together for comparison.
- **Crosshair sync** — the MPR reference-line behavior above.

Make each synchronizer independently toggleable; radiologists turn them on and off
constantly depending on the task.

---

## Cine

Multi-frame studies (echocardiography loops, angiography, dynamic MR) are watched as
motion, not scrolled:

- **Play/pause, frame rate, loop/bounce.** Default the frame rate from the DICOM
  `CineRate` / `RecommendedDisplayFrameRate` when present.
- **Scrub bar** with current/total frame, and frame-step controls.
- **Multi-loop sync** for comparing loops side by side.
- Keep it smooth — dropped frames in an echo loop are clinically misleading.

---

## Panels

- **Series/thumbnail rail.** All series in the study as thumbnails with modality, count,
  description; click to load into the active viewport; drag to a cell.
- **Measurement panel.** Live list of measurements with value + unit, label, jump-to,
  edit, delete. Drive it from the annotation event stream via a tear-free store, not
  polling. Group untracked vs tracked findings.
- **Segmentation panel.** Per-segment list with color, label, visibility toggle, opacity,
  and the active-segment selector; AI-generated segments marked as such with model
  provenance.
- Panels are collapsible and never permanently steal image real estate.

---

## Performance

In a reading room, latency is a clinical-throughput problem, not a nicety:

- **Instant scroll.** Prefetch the series after the first image so wheel-scroll never
  stalls. Decode in workers (WASM).
- **Determinate progress, not spinners**, for study/series load. Skeleton the chrome;
  stream the image in.
- **INP ≤ 200 ms.** No synchronous work over ~50 ms in input handlers — W/L drag, scroll,
  and prompt clicks must stay on the frame budget. Profile; find the one big rock.
- **Surgical re-render.** Only the viewport whose data changed re-renders; the measurement
  list updates only the changed row.
- **Respect `prefers-reduced-motion`** for UI transitions — but never let motion settings
  alter image rendering or cine playback.

---

## A11y and SaMD in UI

The interface is where the medical-device line becomes visible:

- **Label the build.** "Research use only" vs "diagnostic use" must be unambiguous in the
  UI, not buried.
- **Mark AI output.** AI-generated segmentations and AI-drafted reports are visibly tagged
  as AI-generated, show model provenance, and are always clinician-editable. The UI must
  never present AI output as a final diagnosis.
- **No implied diagnosis.** Phrasing, badges, and confidence displays must not state or
  imply a clinical conclusion the software is not cleared to make.
- **Keyboard-complete + focus-visible.** Power users live on the keyboard; every action
  reachable without the mouse. High-contrast focus states that survive the dark theme.
- **Don't gamify.** No streaks, confetti, or engagement mechanics — this is a clinical
  tool; respect the seriousness of the context.
