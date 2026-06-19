# Engine Correctness Reference

Grounded in Cornerstone3D **v3.x** (the 2.0+ architecture). Always confirm exact
signatures against the installed `.d.ts` — see SKILL.md §I.1. This file tells you the
concepts and the shape; the type definitions tell you the precise call for your version.

## Table of Contents
1. [Stack vs Volume — the first decision](#stack-vs-volume)
2. [DICOM coordinate correctness](#dicom-coordinates)
3. [Window/Level, VOI, and the modality LUT](#voi-and-luts)
4. [Measurements and calibration](#measurements)
5. [The segmentation labelmap lifecycle](#segmentation-lifecycle)
6. [Runtime, loading, and memory](#runtime-and-memory)
7. [The deprecated-call blacklist](#blacklist)

---

## Stack vs Volume

The single decision that shapes the engine. Get it right up front.

- **Stack viewport** (`ViewportType.STACK`): an ordered list of 2D images. Use for
  single-frame X-ray, and for multi-frame cine (echo, angio) where frames are time, not
  space. Images load directly via `viewport.setStack(imageIds)`.
- **Volume viewport** (`ViewportType.ORTHOGRAPHIC`): a reconstructed 3D volume sampled
  along an orientation (`OrientationAxis.AXIAL | CORONAL | SAGITTAL`). Use for CT/MR where
  MPR (multiplanar reformation) matters. Build a cached volume first
  (`volumeLoader.createAndCacheVolumeFromImages(volumeId, imageIds)`), then attach it with
  `setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId])`.

A volume requires consistent slice geometry; a stack does not. Do not force time-series
frames into a volume, and do not try to MPR a true 2D stack. When the same data is shown
in multiple viewports (axial/coronal/sagittal), they **share one cached volume** — this
is the memory win and the reason annotations are stored in world space (below).

---

## DICOM Coordinates

Cornerstone3D renders in the **patient world coordinate system**, placing each image via
its `imagePositionPatient` (origin) and `imageOrientationPatient` (row/column direction
cosines). Consequences you must respect:

- **Annotations live in physical space**, not pixel space. The same annotation renders
  correctly across axial/coronal/sagittal views of one volume. Never store measurement
  geometry in canvas pixels; let the tools store world coordinates.
- **Left/right and orientation labels matter.** Radiological convention flips left/right.
  Render orientation markers (A/P/L/R/S/I) from the direction cosines; do not hardcode.
- **Pixel ↔ world conversion** goes through the viewport (`worldToCanvas`,
  `canvasToWorld`, and the image's spacing/origin). When you receive an AI mask in *image
  pixel* space, you map it back through the frame's geometry — do not assume canvas pixels
  equal image pixels (zoom, pan, and display area all differ).
- **Multi-frame** instances index frames 1-based in WADO-RS (`/frames/1`). Single-frame
  instances are frame `1`. Off-by-one here loads the wrong slice silently.

---

## VOI and LUTs

Pixel values are not display values. The pipeline, in order:

1. **Modality LUT / rescale** (`RescaleSlope`, `RescaleIntercept`) maps stored values to a
   physical unit — e.g. CT to Hounsfield Units. This is intrinsic to the data; do not skip
   it or measurements in HU will be wrong.
2. **VOI LUT (window/level)** maps the modality-corrected range to display. Cornerstone
   expresses this as a **VOI range** `{ lower, upper }`. Clinicians think in
   **width/center**; convert: `lower = center - width/2`, `upper = center + width/2`. Apply
   via `viewport.setProperties({ voiRange })`.
3. **Presentation LUT / invert** for modalities displayed inverted (some X-ray).

`getViewport` returns the base `Viewport`, which does **not** expose `setProperties` —
that is on the stack/volume subclasses. Narrow by capability (a type guard checking for
the methods you use) or fetch the typed viewport (`getStackViewports().find(...)`) rather
than asserting with `as`. Per-modality default presets belong in the UI layer
(`reading-room-uiux.md`), but the *mechanism* is here.

---

## Measurements

Tools (`LengthTool`, `RectangleROITool`, `EllipticalROITool`, `ProbeTool`,
`BidirectionalTool`, `AngleTool`, …) emit annotations with cached statistics. Correctness
notes:

- **Physical units require calibration.** Length in mm depends on `PixelSpacing` (or
  `ImagerPixelSpacing` for projection radiography, with caveats). If spacing is absent or
  uncalibrated, report pixels and say so — never fabricate millimetres.
- **ROI statistics** (mean/stdDev/area) are computed on **modality-corrected** values
  (HU for CT). Surface them from the annotation's `cachedStats`, which is keyed by target
  (imageId/volumeId); do not invent a flat numeric schema — read what the tool stored.
- **Subscribe, don't poll.** Annotation lifecycle fires `ANNOTATION_COMPLETED`,
  `ANNOTATION_MODIFIED`, `ANNOTATION_REMOVED` on the core event target. Bridge these into
  your UI state through `useSyncExternalStore` (tear-free) rather than reading global tool
  state on a timer.
- Annotations are SVG-rendered, so they stay crisp at any monitor resolution and zoom.

---

## Segmentation Lifecycle

The 2.0+ **viewport-centric** flow. A *segmentation* (the data) is decoupled from a
*representation* (how it is drawn) — one segmentation can have a Labelmap representation
and a Contour representation simultaneously.

**Create + attach (stack labelmap):**
1. Derive a zeroed labelmap image per source frame:
   `imageLoader.createAndCacheDerivedLabelmapImages(referencedImageIds)`.
2. Register the segmentation:
   `segmentation.addSegmentations([{ segmentationId, representation: { type: Labelmap, data: { imageIds } } }])`.
3. Attach to the viewport:
   `segmentation.addLabelmapRepresentationToViewport(viewportId, [{ segmentationId }])`.

For **volume** labelmaps, derive with `volumeLoader.createAndCacheDerivedLabelmapVolume(referencedVolumeId)`
and register with `data: { volumeId }`.

**Write mask data (the AI seam):** fetch the labelmap image (`cache.getImage(labelmapImageId)`),
write the binary mask into its pixel buffer (`getPixelData().set(...)`, or the
**VoxelManager** for large volumes), then trigger a targeted re-render
(`csToolsUtilities.segmentation.triggerSegmentationRenderBySegmentationId(segmentationId)`).
Single-segment-per-write is a sane default contract: write `segmentIndex` where the mask
is positive, clear where zero.

**Style / visibility / active segment** go through `segmentation.config.style.setStyle`,
`segmentation.config.visibility.setSegmentationRepresentationVisibility`, and
`segmentation.activeSegmentation` / `segmentation.segmentIndex`. Confirm the exact paths in
the installed `.d.ts` — some live under `segmentation.*`, the render trigger lives under
`utilities.segmentation.*`.

**Interop:** support DICOM SEG import/export (and RTSTRUCT where relevant) so masks round-trip
to PACS. A mask that cannot leave the viewer is a dead end clinically.

---

## Runtime and Memory

- **One-time init is process-global.** `core.init()`, the DICOM image loader's `init()`,
  and tool registration (`addTool`) happen once before any rendering engine exists. Guard
  with an idempotent `ensureRuntime()` so React re-mounts and Strict-Mode double-invocation
  are safe.
- **Progressive loading + prefetch.** Cornerstone supports progressive retrieval and
  worker-based decoding (WASM). Prefetch the rest of a series after the first image so
  scrolling is instant; show a determinate progress affordance, not a spinner, for large
  studies.
- **GPU tier.** Volume rendering needs WebGL (tier 1+). Detect and degrade gracefully
  (CPU fallback exists but is slow); communicate it rather than rendering a black canvas.
- **Dispose deliberately.** Destroying a rendering engine and its tool group must be
  idempotent and must release the cache for volumes you no longer show, or long sessions
  leak.

---

## Blacklist

Never generate these — they are deprecated, wrong, or unsafe:

- `addSegmentationRepresentationToToolGroup(...)` and other tool-group-centric segmentation
  calls → use the viewport-centric API.
- `cornerstone-wado-image-loader`, `cornerstone-tools`, `cornerstone-core`,
  `react-cornerstone-viewport` → all superseded by `@cornerstonejs/*`.
- Skipping the modality LUT before computing HU statistics.
- Storing annotation geometry in canvas pixels.
- Reporting calibrated lengths when `PixelSpacing` is absent.
- `as`-asserting a base `Viewport` to a subclass to reach `setProperties` → narrow by
  capability instead.
