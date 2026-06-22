import type { SegmentationPrompt } from "@horalix/dicom-engine";

import type { LoadedImageReference, LoadedSeries } from "../types";
import type { StackFrameState } from "@horalix/dicom-engine";

/**
 * Shared domain types and pure helpers for the promptable AI segmentation
 * workflow. Prompts live in image-pixel space (for inference) but also carry a
 * display marker in element/canvas pixels (for the transient overlay). Clinical
 * masks come only from the segmentation service — this layer orchestrates
 * prompts and renders results; it never fabricates anatomy.
 */

export type PromptMode = "off" | "point-include" | "point-exclude" | "box";

export type DisplayMarker =
  | { readonly kind: "point"; readonly x: number; readonly y: number; readonly include: boolean }
  | {
      readonly kind: "box";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

export interface PendingPrompt {
  readonly id: string;
  /** Image-pixel-space prompt sent to the inference service. */
  readonly prompt: SegmentationPrompt;
  /** Element-pixel-space marker for the transient overlay. */
  readonly display: DisplayMarker;
}

export interface SegmentDefinition {
  readonly index: number;
  readonly label: string;
  /** RGBA 0-255, matched to the rendered labelmap color. */
  readonly color: readonly [number, number, number, number];
  readonly visible: boolean;
}

export interface RunProvenance {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly confidence: number | null;
  readonly inferenceMs: number;
  readonly frameCount: number;
  readonly at: string;
}

export type AiRunState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "done"; readonly provenance: RunProvenance }
  | { readonly status: "error"; readonly message: string };

/**
 * Distinct, high-contrast segment colors (RGBA 0-255). Index 0 is unused
 * (background); segment N uses palette entry (N-1) modulo the palette length.
 */
export const SEGMENT_PALETTE: readonly (readonly [number, number, number, number])[] = [
  [248, 113, 113, 255],
  [74, 222, 128, 255],
  [96, 165, 250, 255],
  [251, 191, 36, 255],
  [192, 132, 252, 255],
  [34, 211, 238, 255],
  [251, 146, 60, 255],
  [244, 114, 182, 255]
] as const;

export function colorForSegment(
  index: number
): readonly [number, number, number, number] {
  const palette = SEGMENT_PALETTE[(index - 1) % SEGMENT_PALETTE.length];
  return palette ?? [248, 113, 113, 255];
}

export function rgbaToCss(color: readonly [number, number, number, number]): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
}

/** The source frame currently displayed, as an inference image reference. */
export function activeImageReference(
  series: LoadedSeries | null,
  frameState: StackFrameState
): LoadedImageReference | null {
  if (!series || series.imageReferences.length === 0) {
    return null;
  }

  const byImageId = series.imageReferences.find(
    (reference) => reference.imageId === frameState.currentImageId
  );

  if (byImageId) {
    return byImageId;
  }

  return series.imageReferences[frameState.currentIndex] ?? null;
}

/** Map a returned mask frame back to the source frame's imageId. */
export function imageIdForFrame(
  series: LoadedSeries,
  sopInstanceUid: string,
  frameIndex: number
): LoadedImageReference | null {
  return (
    series.imageReferences.find(
      (reference) =>
        reference.sopInstanceUid === sopInstanceUid &&
        reference.frameIndex === frameIndex
    ) ?? null
  );
}

export function createPromptId(): string {
  return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
