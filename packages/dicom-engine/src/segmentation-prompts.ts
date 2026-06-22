import { utilities as csUtilities, type StackViewport } from "@cornerstonejs/core";

/**
 * Promptable-segmentation coordinate bridge. A viewport click/drag is a canvas
 * event; the inference contract speaks **image-pixel** coordinates. This module
 * translates one to the other through the frame geometry — never assuming canvas
 * pixels equal image pixels (zoom, pan, and display area all differ). It carries
 * no transport or Cornerstone detail beyond the conversion itself.
 */

export interface ImagePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Convert a canvas point (CSS pixels relative to the viewport canvas) into
 * image-pixel coordinates for the currently displayed frame. Returns `null`
 * when no frame is displayed or the point falls outside the image plane.
 */
export function canvasToImagePoint(
  viewport: StackViewport,
  canvasPoint: readonly [number, number]
): ImagePoint | null {
  const imageId = viewport.getCurrentImageId();

  if (!imageId) {
    return null;
  }

  const world = viewport.canvasToWorld([canvasPoint[0], canvasPoint[1]]);
  const image = csUtilities.worldToImageCoords(imageId, world);

  if (!image) {
    return null;
  }

  return { x: image[0], y: image[1] };
}

/**
 * Build an axis-aligned box prompt (in image-pixel space) from two canvas
 * corners. Returns `null` if either corner cannot be mapped, or the box is
 * degenerate (zero width/height).
 */
export function canvasCornersToImageBox(
  viewport: StackViewport,
  start: readonly [number, number],
  end: readonly [number, number]
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null {
  const a = canvasToImagePoint(viewport, start);
  const b = canvasToImagePoint(viewport, end);

  if (!a || !b) {
    return null;
  }

  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);

  if (width < 1 || height < 1) {
    return null;
  }

  return { x, y, width, height };
}
