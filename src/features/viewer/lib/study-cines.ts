import type { ImageId } from "@horalix/dicom-engine";

import type { LoadedImageReference, LoadedSeries } from "../types";

/**
 * A selectable cine. Echo studies store each loop/view as its own multi-frame
 * instance inside one series, so "cine = instance" there. A CT/MR series of
 * single-frame slices is instead one cine (a stack/volume). The heuristic:
 * if a series has multi-frame instances, each instance becomes a cine; if its
 * instances are single-frame, the whole series is one cine.
 */
export interface Cine {
  readonly id: string;
  readonly studyInstanceUid: string;
  readonly seriesInstanceUid: string;
  readonly label: string;
  readonly modality: string | null;
  readonly frameCount: number;
  /** Source instances behind this cine (>1 only for single-frame stacks). */
  readonly instanceCount: number;
  readonly imageIds: ImageId[];
  readonly imageReferences: LoadedImageReference[];
  readonly recommendedFrameRate: number | null;
  readonly thumbnailUrl: string;
}

export interface StudyCinesInput {
  readonly studyInstanceUid: string;
  readonly series: readonly {
    readonly seriesInstanceUid: string;
    readonly modality: string | null;
    readonly isLoadable: boolean;
  }[];
  readonly wadoRoot: string;
}

export type LoadStudyCinesResult =
  | { readonly ok: true; readonly cines: Cine[] }
  | { readonly ok: false; readonly message: string };

function renderedFrameUrl(
  wadoRoot: string,
  study: string,
  series: string,
  sop: string
): string {
  return (
    `${wadoRoot.replace(/\/+$/, "")}/studies/${encodeURIComponent(study)}` +
    `/series/${encodeURIComponent(series)}/instances/${encodeURIComponent(sop)}` +
    `/frames/1/rendered`
  );
}

export async function loadStudyCines(
  input: StudyCinesInput
): Promise<LoadStudyCinesResult> {
  try {
    const { fetchDicomWebSeries, SeriesInstanceUid, StudyInstanceUid } =
      await import("@horalix/dicom-engine");

    const cines: Cine[] = [];

    for (const entry of input.series.filter((series) => series.isLoadable)) {
      const result = await fetchDicomWebSeries({
        seriesInstanceUid: SeriesInstanceUid(entry.seriesInstanceUid),
        studyInstanceUid: StudyInstanceUid(input.studyInstanceUid),
        wadoRoot: input.wadoRoot
      });

      if (!result.ok) {
        continue;
      }

      const series = result.value;
      const order: string[] = [];
      const groups = new Map<
        string,
        { imageIds: ImageId[]; refs: LoadedImageReference[] }
      >();

      series.imageIds.forEach((imageId, index) => {
        const reference = series.imageReferences[index];
        if (!reference) {
          return;
        }
        let group = groups.get(reference.sopInstanceUid);
        if (!group) {
          group = { imageIds: [], refs: [] };
          groups.set(reference.sopInstanceUid, group);
          order.push(reference.sopInstanceUid);
        }
        group.imageIds.push(imageId);
        group.refs.push({ ...reference, imageId });
      });

      const maxFrames = order.reduce(
        (max, sop) => Math.max(max, groups.get(sop)?.imageIds.length ?? 0),
        0
      );

      if (maxFrames > 1) {
        // Multi-frame loops: one cine per instance.
        for (const sop of order) {
          const group = groups.get(sop);
          if (!group) {
            continue;
          }
          cines.push({
            id: sop,
            studyInstanceUid: input.studyInstanceUid,
            seriesInstanceUid: entry.seriesInstanceUid,
            label: `Loop ${cines.length + 1}`,
            modality: series.modality,
            frameCount: group.imageIds.length,
            instanceCount: 1,
            imageIds: group.imageIds,
            imageReferences: group.refs,
            recommendedFrameRate: series.recommendedFrameRate,
            thumbnailUrl: renderedFrameUrl(
              input.wadoRoot,
              input.studyInstanceUid,
              entry.seriesInstanceUid,
              sop
            )
          });
        }
      } else {
        // Single-frame slices: the whole series is one cine (stack/volume).
        const imageIds: ImageId[] = [];
        const refs: LoadedImageReference[] = [];
        for (const sop of order) {
          const group = groups.get(sop);
          if (!group) {
            continue;
          }
          imageIds.push(...group.imageIds);
          refs.push(...group.refs);
        }
        const firstSop = order[0];
        cines.push({
          id: entry.seriesInstanceUid,
          studyInstanceUid: input.studyInstanceUid,
          seriesInstanceUid: entry.seriesInstanceUid,
          label: series.modality ?? "Series",
          modality: series.modality,
          frameCount: imageIds.length,
          instanceCount: order.length,
          imageIds,
          imageReferences: refs,
          recommendedFrameRate: series.recommendedFrameRate,
          thumbnailUrl: firstSop
            ? renderedFrameUrl(
                input.wadoRoot,
                input.studyInstanceUid,
                entry.seriesInstanceUid,
                firstSop
              )
            : ""
        });
      }
    }

    if (cines.length === 0) {
      return { ok: false, message: "No viewable cines in this study." };
    }

    return { ok: true, cines };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Failed to read study cines."
    };
  }
}

export function cineToLoadedSeries(cine: Cine, wadoRoot: string): LoadedSeries {
  return {
    imageIds: [...cine.imageIds],
    imageReferences: cine.imageReferences,
    instanceCount: cine.instanceCount,
    loadedAt: new Date().toISOString(),
    modality: cine.modality,
    recommendedFrameRate: cine.recommendedFrameRate,
    seriesInstanceUid: cine.seriesInstanceUid,
    source: "dicomweb",
    studyInstanceUid: cine.studyInstanceUid,
    wadoRoot
  };
}
