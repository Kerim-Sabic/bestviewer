import { cache, imageLoader } from "@cornerstonejs/core";
import {
  Enums as ToolsEnums,
  segmentation as csSegmentation,
  utilities as csToolsUtilities
} from "@cornerstonejs/tools";

import { type ImageId, type SegmentationId, type ViewportId } from "./brand";
import { err, getErrorMessage, ok, type Result } from "./result";

/**
 * Labelmap segmentation lifecycle for a stack viewport, using the **post-2.0
 * viewport-centric** Cornerstone API only (no tool-group-centric calls). A
 * segmentation (the data) is decoupled from its representation (how it is
 * drawn); the AI seam writes decoded masks into the labelmap image buffers and
 * triggers a targeted re-render. Clinical pixels originate in the validated
 * segmentation service — this module only renders what the service produced.
 */

const LABELMAP = ToolsEnums.SegmentationRepresentations.Labelmap;

export type LabelmapError =
  | { reason: "no_labelmap"; message: string }
  | { reason: "dimension_mismatch"; message: string }
  | { reason: "write_failed"; message: string };

export interface CreateStackLabelmapInput {
  readonly viewportId: ViewportId;
  readonly segmentationId: SegmentationId;
  /** Source (referenced) frame imageIds, in display order. */
  readonly referencedImageIds: readonly ImageId[];
}

/**
 * Derive a zeroed labelmap image per source frame, register the segmentation,
 * and attach a labelmap representation to the viewport. Idempotent-friendly:
 * caller should {@link removeLabelmap} a stale segmentation before recreating.
 */
export function createStackLabelmap(
  input: CreateStackLabelmapInput
): Result<readonly string[], LabelmapError> {
  if (input.referencedImageIds.length === 0) {
    return err({
      reason: "no_labelmap",
      message: "Cannot create a labelmap for an empty stack."
    });
  }

  try {
    const labelmapImages = imageLoader.createAndCacheDerivedLabelmapImages([
      ...input.referencedImageIds
    ]);
    const labelmapImageIds = labelmapImages.map((image) => image.imageId);

    csSegmentation.addSegmentations([
      {
        segmentationId: input.segmentationId,
        representation: {
          type: LABELMAP,
          data: { imageIds: labelmapImageIds }
        }
      }
    ]);

    csSegmentation.addLabelmapRepresentationToViewport(input.viewportId, [
      { segmentationId: input.segmentationId }
    ]);

    return ok(labelmapImageIds);
  } catch (error) {
    return err({ reason: "write_failed", message: getErrorMessage(error) });
  }
}

export interface WriteFrameMaskInput {
  readonly segmentationId: SegmentationId;
  /** Source frame imageId the mask belongs to. */
  readonly referencedImageId: ImageId;
  /** 0/1 per pixel, row-major, length width * height. */
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** 1-based labelmap segment the foreground pixels are written as. */
  readonly segmentIndex: number;
}

/**
 * Write a single-frame binary mask into the labelmap for one segment. The
 * contract is single-segment-per-write: set `segmentIndex` where the mask is
 * positive and clear (only) this segment where the mask is zero — other
 * segments are preserved so multi-label editing composes. A dimension mismatch
 * is a typed error, never a silent clip.
 */
export function writeFrameMask(
  input: WriteFrameMaskInput
): Result<void, LabelmapError> {
  const labelmapImageIds = csSegmentation.getLabelmapImageIdsForImageId(
    input.referencedImageId,
    input.segmentationId
  );
  const labelmapImageId = labelmapImageIds[0];

  if (labelmapImageId === undefined) {
    return err({
      reason: "no_labelmap",
      message: `No labelmap image is registered for frame ${input.referencedImageId}.`
    });
  }

  const labelmapImage = cache.getImage(labelmapImageId);

  if (!labelmapImage) {
    return err({
      reason: "no_labelmap",
      message: `Labelmap image ${labelmapImageId} is not in the cache.`
    });
  }

  const expected = input.width * input.height;

  if (input.mask.length !== expected) {
    return err({
      reason: "dimension_mismatch",
      message: `Mask length ${input.mask.length} does not match ${input.width}x${input.height}.`
    });
  }

  try {
    const voxel = labelmapImage.voxelManager;

    if (voxel) {
      const length = voxel.getScalarDataLength();

      if (length !== expected) {
        return err({
          reason: "dimension_mismatch",
          message: `Labelmap has ${length} voxels but the mask has ${expected}.`
        });
      }

      for (let index = 0; index < length; index += 1) {
        if (input.mask[index] === 1) {
          voxel.setAtIndex(index, input.segmentIndex);
        } else if (voxel.getAtIndex(index) === input.segmentIndex) {
          voxel.setAtIndex(index, 0);
        }
      }
    } else {
      const pixelData = labelmapImage.getPixelData();

      if (pixelData.length !== expected) {
        return err({
          reason: "dimension_mismatch",
          message: `Labelmap has ${pixelData.length} pixels but the mask has ${expected}.`
        });
      }

      for (let index = 0; index < pixelData.length; index += 1) {
        if (input.mask[index] === 1) {
          pixelData[index] = input.segmentIndex;
        } else if (pixelData[index] === input.segmentIndex) {
          pixelData[index] = 0;
        }
      }
    }

    csSegmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      input.segmentationId
    );
    csToolsUtilities.segmentation.triggerSegmentationRenderBySegmentationId(
      input.segmentationId
    );

    return ok(undefined);
  } catch (error) {
    return err({ reason: "write_failed", message: getErrorMessage(error) });
  }
}

export interface FrameLabelmap {
  readonly width: number;
  readonly height: number;
  /** Label index per pixel, row-major (0 = background, 1..N = segments). */
  readonly labels: Uint8Array;
}

/**
 * Read the current labelmap for one source frame back out of Cornerstone, so a
 * clinician-edited mask can be serialized (e.g. to DICOM SEG). Returns `null`
 * when the frame has no labelmap image cached.
 */
export function readFrameLabelmap(
  segmentationId: SegmentationId,
  referencedImageId: ImageId
): FrameLabelmap | null {
  const labelmapImageId = csSegmentation.getLabelmapImageIdsForImageId(
    referencedImageId,
    segmentationId
  )[0];

  if (labelmapImageId === undefined) {
    return null;
  }

  const labelmapImage = cache.getImage(labelmapImageId);

  if (!labelmapImage) {
    return null;
  }

  const width = labelmapImage.columns;
  const height = labelmapImage.rows;
  const labels = new Uint8Array(width * height);
  const voxel = labelmapImage.voxelManager;

  if (voxel) {
    const length = Math.min(voxel.getScalarDataLength(), labels.length);
    for (let index = 0; index < length; index += 1) {
      const value = voxel.getAtIndex(index);
      labels[index] = typeof value === "number" ? value : 0;
    }
  } else {
    const pixelData = labelmapImage.getPixelData();
    const length = Math.min(pixelData.length, labels.length);
    for (let index = 0; index < length; index += 1) {
      labels[index] = pixelData[index] ?? 0;
    }
  }

  return { width, height, labels };
}

/** Set the active segmentation + segment that subsequent writes target. */
export function setActiveSegment(
  viewportId: ViewportId,
  segmentationId: SegmentationId,
  segmentIndex: number
): void {
  csSegmentation.activeSegmentation.setActiveSegmentation(
    viewportId,
    segmentationId
  );
  csSegmentation.segmentIndex.setActiveSegmentIndex(segmentationId, segmentIndex);
}

/** Set a segment's RGBA color so the UI swatch matches the rendered mask. */
export function setSegmentColor(
  viewportId: ViewportId,
  segmentationId: SegmentationId,
  segmentIndex: number,
  rgba: readonly [number, number, number, number]
): void {
  csSegmentation.config.color.setSegmentIndexColor(
    viewportId,
    segmentationId,
    segmentIndex,
    [rgba[0], rgba[1], rgba[2], rgba[3]]
  );
}

/** Fill opacity for the labelmap, 0..1 (applies to active + inactive). */
export function setLabelmapOpacity(
  segmentationId: SegmentationId,
  fillAlpha: number
): void {
  const alpha = Math.min(Math.max(fillAlpha, 0), 1);

  csSegmentation.config.style.setStyle(
    { type: LABELMAP, segmentationId },
    { fillAlpha: alpha, fillAlphaInactive: alpha }
  );
}

export function setLabelmapVisibility(
  viewportId: ViewportId,
  segmentationId: SegmentationId,
  visible: boolean
): void {
  csSegmentation.config.visibility.setSegmentationRepresentationVisibility(
    viewportId,
    { segmentationId, type: LABELMAP },
    visible
  );
}

export function setSegmentVisibility(
  viewportId: ViewportId,
  segmentationId: SegmentationId,
  segmentIndex: number,
  visible: boolean
): void {
  csSegmentation.config.visibility.setSegmentIndexVisibility(
    viewportId,
    { segmentationId, type: LABELMAP },
    segmentIndex,
    visible
  );
}

/** Remove a segmentation entirely (representation + data). */
export function removeLabelmap(segmentationId: SegmentationId): void {
  csSegmentation.removeSegmentation(segmentationId);
}
