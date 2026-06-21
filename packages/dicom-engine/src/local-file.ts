import { wadouri } from "@cornerstonejs/dicom-image-loader";
import { parseDicom, type DataSet } from "dicom-parser";

import { ImageId } from "./brand";
import { err, getErrorMessage, ok, type Result } from "./result";
import { ensureCornerstoneRuntime } from "./runtime";

export type LocalDicomError =
  | { reason: "empty"; message: string }
  | { reason: "parse"; message: string };

export interface LocalSeries {
  readonly imageIds: readonly ImageId[];
  /** Number of source files (DICOM instances) provided. */
  readonly instanceCount: number;
  /** Total renderable frames across all instances. */
  readonly frameCount: number;
  readonly modality: string | null;
  readonly recommendedFrameRate: number | null;
  readonly seriesInstanceUid: string | null;
  readonly studyInstanceUid: string | null;
  readonly description: string | null;
}

const TAG = {
  numberOfFrames: "x00280008",
  instanceNumber: "x00200013",
  seriesUid: "x0020000e",
  studyUid: "x0020000d",
  modality: "x00080060",
  seriesDescription: "x0008103e",
  recommendedFrameRate: "x00082144",
  cineRate: "x00180040",
  frameTime: "x00181063"
} as const;

interface ParsedInstance {
  readonly imageIds: readonly ImageId[];
  readonly instanceNumber: number;
}

/**
 * Load DICOM Part-10 files straight from the user's machine — no PACS round
 * trip. Files are registered with Cornerstone's wadouri file manager (yielding
 * `dicomfile:` image ids) and parsed locally for the geometry needed to build
 * the stack: multi-frame instances (echo/angio loops) expand to one image id
 * per frame; a set of single-frame instances (CT/MR) is ordered by
 * InstanceNumber so it scrolls anatomically.
 */
export async function loadLocalDicomFiles(
  files: readonly File[]
): Promise<Result<LocalSeries, LocalDicomError>> {
  if (files.length === 0) {
    return err({ reason: "empty", message: "No DICOM files were selected." });
  }

  try {
    ensureCornerstoneRuntime();
  } catch (error) {
    return err({ reason: "parse", message: getErrorMessage(error) });
  }

  const instances: ParsedInstance[] = [];
  let modality: string | null = null;
  let seriesInstanceUid: string | null = null;
  let studyInstanceUid: string | null = null;
  let description: string | null = null;
  let recommendedFrameRate: number | null = null;

  for (const file of files) {
    let dataSet: DataSet;

    try {
      dataSet = parseDicom(new Uint8Array(await file.arrayBuffer()));
    } catch (error) {
      return err({
        reason: "parse",
        message: `Could not parse ${file.name || "the file"}: ${getErrorMessage(error)}`
      });
    }

    const baseImageId = wadouri.fileManager.add(file);
    const frameCount = Math.max(dataSet.intString(TAG.numberOfFrames) ?? 1, 1);
    const instanceNumber = dataSet.intString(TAG.instanceNumber) ?? 0;

    instances.push({
      imageIds:
        frameCount > 1
          ? Array.from({ length: frameCount }, (_, index) =>
              ImageId(`${baseImageId}?frame=${index + 1}`)
            )
          : [ImageId(baseImageId)],
      instanceNumber
    });

    modality ??= dataSet.string(TAG.modality) ?? null;
    seriesInstanceUid ??= dataSet.string(TAG.seriesUid) ?? null;
    studyInstanceUid ??= dataSet.string(TAG.studyUid) ?? null;
    description ??= dataSet.string(TAG.seriesDescription) ?? null;
    recommendedFrameRate ??= readFrameRate(dataSet);
  }

  const imageIds = [...instances]
    .sort((a, b) => a.instanceNumber - b.instanceNumber)
    .flatMap((instance) => [...instance.imageIds]);

  return ok({
    imageIds,
    instanceCount: files.length,
    frameCount: imageIds.length,
    modality,
    recommendedFrameRate,
    seriesInstanceUid,
    studyInstanceUid,
    description
  });
}

function readFrameRate(dataSet: DataSet): number | null {
  const recommended = dataSet.intString(TAG.recommendedFrameRate);
  if (recommended !== undefined && recommended > 0) {
    return recommended;
  }

  const cineRate = dataSet.intString(TAG.cineRate);
  if (cineRate !== undefined && cineRate > 0) {
    return cineRate;
  }

  const frameTime = dataSet.floatString(TAG.frameTime);
  if (frameTime !== undefined && frameTime > 0) {
    return Math.round(1000 / frameTime);
  }

  return null;
}
