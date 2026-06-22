import {
  encodeMaskRle,
  readFrameLabelmap,
  type SegmentationId
} from "@horalix/dicom-engine";
import { z } from "zod";

import type { SegmentDefinition } from "./ai-segmentation";
import type { LoadedSeries } from "../types";

/**
 * Serialize the (clinician-editable) labelmap to a standards-compliant DICOM
 * SEG and push it to Orthanc. The viewer reads the labelmap back out of
 * Cornerstone, RLE-encodes each segment per frame, and posts to the service,
 * which builds the SEG with `highdicom` (proper ReferencedSeries + algorithm
 * provenance) and STOWs it. AI output round-trips to PACS as a real SEG —
 * marked AI-generated, clinician-editable (SaMD).
 */

const SegExportResponseSchema = z.union([
  z.object({
    status: z.literal("ok"),
    message: z.string(),
    segSopInstanceUid: z.string().optional(),
    studyInstanceUid: z.string().optional()
  }),
  z.object({
    status: z.literal("error"),
    message: z.string()
  })
]);

export interface ExportSegmentationInput {
  readonly segmentationId: SegmentationId;
  readonly series: LoadedSeries;
  readonly segments: readonly SegmentDefinition[];
}

export type ExportSegmentationResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string };

interface FramePayload {
  readonly sopInstanceUid: string;
  readonly frameIndex: number;
  readonly width: number;
  readonly height: number;
  readonly masks: { readonly segmentIndex: number; readonly runLengths: number[] }[];
}

export async function exportSegmentationToOrthanc(
  input: ExportSegmentationInput
): Promise<ExportSegmentationResult> {
  const frames: FramePayload[] = [];

  for (const reference of input.series.imageReferences) {
    const labelmap = readFrameLabelmap(input.segmentationId, reference.imageId);

    if (!labelmap) {
      continue;
    }

    const masks: FramePayload["masks"] = [];

    for (const segment of input.segments) {
      const binary = new Uint8Array(labelmap.labels.length);
      let any = false;

      for (let index = 0; index < labelmap.labels.length; index += 1) {
        if (labelmap.labels[index] === segment.index) {
          binary[index] = 1;
          any = true;
        }
      }

      if (any) {
        masks.push({ segmentIndex: segment.index, runLengths: encodeMaskRle(binary) });
      }
    }

    if (masks.length > 0) {
      frames.push({
        sopInstanceUid: reference.sopInstanceUid,
        frameIndex: reference.frameIndex,
        width: labelmap.width,
        height: labelmap.height,
        masks
      });
    }
  }

  if (frames.length === 0) {
    return { ok: false, message: "Nothing to export — no segmented frames." };
  }

  const body = {
    studyInstanceUid: input.series.studyInstanceUid,
    seriesInstanceUid: input.series.seriesInstanceUid,
    segments: input.segments.map((segment) => ({
      index: segment.index,
      label: segment.label,
      color: segment.color
    })),
    frames
  };

  let response: Response;

  try {
    response = await fetch("/api/seg", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
  } catch (error) {
    return { ok: false, message: getErrorMessage(error) };
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch (error) {
    return { ok: false, message: `Invalid SEG response: ${getErrorMessage(error)}` };
  }

  const parsed = SegExportResponseSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, message: "SEG response did not match the expected schema." };
  }

  if (parsed.data.status === "error") {
    return { ok: false, message: parsed.data.message };
  }

  return { ok: true, message: parsed.data.message };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
