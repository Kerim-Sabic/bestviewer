import { formatDicomWebError } from "./dicomweb-errors";
import type { LoadedImageReference, LoadedSeries } from "../types";

export interface LoadDicomWebSeriesInput {
  readonly seriesInstanceUid: string;
  readonly studyInstanceUid: string;
  readonly wadoRoot: string;
}

export type LoadDicomWebSeriesResult =
  | { ok: true; value: LoadedSeries }
  | { ok: false; message: string };

export async function loadDicomWebSeries(
  input: LoadDicomWebSeriesInput
): Promise<LoadDicomWebSeriesResult> {
  const seriesInstanceUid = input.seriesInstanceUid.trim();
  const studyInstanceUid = input.studyInstanceUid.trim();
  const wadoRoot = input.wadoRoot.trim();

  if (!studyInstanceUid || !seriesInstanceUid) {
    return { ok: false, message: "Study UID and Series UID are required" };
  }

  try {
    const { fetchDicomWebSeries, SeriesInstanceUid, StudyInstanceUid } =
      await import("@horalix/dicom-engine");
    const result = await fetchDicomWebSeries({
      seriesInstanceUid: SeriesInstanceUid(seriesInstanceUid),
      studyInstanceUid: StudyInstanceUid(studyInstanceUid),
      wadoRoot
    });

    if (!result.ok) {
      return { ok: false, message: formatDicomWebError(result.error) };
    }

    return {
      ok: true,
      value: {
        imageIds: result.value.imageIds,
        imageReferences: toLoadedImageReferences(result.value),
        instanceCount: result.value.instances.length,
        loadedAt: new Date().toISOString(),
        modality: result.value.modality,
        recommendedFrameRate: result.value.recommendedFrameRate,
        seriesInstanceUid,
        source: "dicomweb",
        studyInstanceUid,
        wadoRoot
      }
    };
  } catch (error) {
    return { ok: false, message: getLoadErrorMessage(error) };
  }
}

export function getDefaultDicomWebRoot(): string {
  if (typeof window === "undefined") {
    return "/api/dicomweb";
  }

  return new URL("/api/dicomweb", window.location.origin).toString();
}

function toLoadedImageReferences(series: {
  readonly imageIds: LoadedSeries["imageIds"];
  readonly imageReferences: readonly Omit<LoadedImageReference, "imageId">[];
}): LoadedSeries["imageReferences"] {
  const references: LoadedImageReference[] = [];

  for (const [index, imageId] of series.imageIds.entries()) {
    const imageReference = series.imageReferences[index];

    if (imageReference) {
      references.push({ ...imageReference, imageId });
    }
  }

  return references;
}

function getLoadErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Series load failed";
}
