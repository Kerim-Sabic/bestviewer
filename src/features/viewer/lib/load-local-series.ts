import { loadLocalDicomFiles } from "@horalix/dicom-engine";

import type { LoadedSeries } from "../types";

export type LoadLocalSeriesResult =
  | { readonly ok: true; readonly value: LoadedSeries }
  | { readonly ok: false; readonly message: string };

/**
 * Adapt the engine's local-file loader to the app's {@link LoadedSeries}, so a
 * dropped DICOM file flows through the exact same viewport path as a DICOMweb
 * series. Local files have no PACS identity, so synthesize friendly labels.
 */
export async function loadLocalSeries(
  files: readonly File[]
): Promise<LoadLocalSeriesResult> {
  const result = await loadLocalDicomFiles(files);

  if (!result.ok) {
    return { ok: false, message: result.error.message };
  }

  const series = result.value;

  return {
    ok: true,
    value: {
      imageIds: [...series.imageIds],
      imageReferences: [],
      instanceCount: series.instanceCount,
      loadedAt: new Date().toISOString(),
      modality: series.modality,
      recommendedFrameRate: series.recommendedFrameRate,
      seriesInstanceUid: series.seriesInstanceUid ?? series.description ?? "Local series",
      source: "local",
      studyInstanceUid: series.studyInstanceUid ?? "Local upload",
      wadoRoot: "local"
    }
  };
}
