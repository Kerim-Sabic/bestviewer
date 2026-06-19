import { z } from "zod";

import type {
  StudyBrowserResponse,
  StudyBrowserSeries,
  StudyBrowserStudy
} from "../lib/study-browser-schema";

const OrthancIdListSchema = z.array(z.string().min(1));

const OrthancStudySchema = z
  .object({
    MainDicomTags: z
      .object({
        AccessionNumber: z.string().optional(),
        StudyDate: z.string().optional(),
        StudyDescription: z.string().optional(),
        StudyInstanceUID: z.string().optional()
      })
      .passthrough(),
    PatientMainDicomTags: z
      .object({
        PatientID: z.string().optional(),
        PatientName: z.string().optional()
      })
      .passthrough()
      .optional(),
    Series: z.array(z.string().min(1))
  })
  .passthrough();

const OrthancSeriesSchema = z
  .object({
    Instances: z.array(z.string()),
    MainDicomTags: z
      .object({
        Modality: z.string().optional(),
        SeriesDescription: z.string().optional(),
        SeriesInstanceUID: z.string().optional(),
        SeriesNumber: z.string().optional()
      })
      .passthrough()
  })
  .passthrough();

const NonImageModalities = new Set([
  "DOC",
  "KO",
  "PR",
  "REG",
  "RTDOSE",
  "RTPLAN",
  "RTSTRUCT",
  "SEG",
  "SR"
]);

type OrthancStudy = z.infer<typeof OrthancStudySchema>;
type OrthancSeries = z.infer<typeof OrthancSeriesSchema>;

type OrthancBrowserResult =
  | { ok: true; value: StudyBrowserResponse }
  | { ok: false; status: number; message: string };

type OrthancFetchResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; message: string };

export async function fetchOrthancStudyBrowser(): Promise<OrthancBrowserResult> {
  const studyIdsResult = await fetchOrthancJson(["studies"], OrthancIdListSchema);

  if (!studyIdsResult.ok) {
    return studyIdsResult;
  }

  const studies: StudyBrowserStudy[] = [];

  for (const studyId of studyIdsResult.value) {
    const studyResult = await fetchOrthancJson(["studies", studyId], OrthancStudySchema);

    if (!studyResult.ok) {
      return studyResult;
    }

    const seriesResult = await fetchStudySeries(studyResult.value.Series);

    if (!seriesResult.ok) {
      return seriesResult;
    }

    const study = toBrowserStudy(studyId, studyResult.value, seriesResult.value);

    if (study) {
      studies.push(study);
    }
  }

  return {
    ok: true,
    value: {
      refreshedAt: new Date().toISOString(),
      studies: sortStudies(studies)
    }
  };
}

async function fetchStudySeries(
  seriesIds: readonly string[]
): Promise<OrthancFetchResult<readonly StudyBrowserSeries[]>> {
  const series: StudyBrowserSeries[] = [];

  for (const seriesId of seriesIds) {
    const result = await fetchOrthancJson(["series", seriesId], OrthancSeriesSchema);

    if (!result.ok) {
      return result;
    }

    const browserSeries = toBrowserSeries(seriesId, result.value);

    if (browserSeries) {
      series.push(browserSeries);
    }
  }

  return { ok: true, value: sortSeries(series) };
}

async function fetchOrthancJson<T>(
  path: readonly string[],
  schema: z.ZodType<T>
): Promise<OrthancFetchResult<T>> {
  let response: Response;

  try {
    response = await fetch(buildOrthancUrl(path), {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
  } catch (error) {
    return { ok: false, status: 502, message: getErrorMessage(error) };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: `Orthanc returned ${response.status}`
    };
  }

  return parseOrthancResponse(response, schema);
}

async function parseOrthancResponse<T>(
  response: Response,
  schema: z.ZodType<T>
): Promise<OrthancFetchResult<T>> {
  try {
    const rawJson = await response.json();
    const parsed = schema.safeParse(rawJson);

    if (!parsed.success) {
      return { ok: false, status: 502, message: parsed.error.message };
    }

    return { ok: true, value: parsed.data };
  } catch (error) {
    return { ok: false, status: 502, message: getErrorMessage(error) };
  }
}

function toBrowserStudy(
  studyId: string,
  study: OrthancStudy,
  series: readonly StudyBrowserSeries[]
): StudyBrowserStudy | undefined {
  const studyInstanceUid = normalizeText(study.MainDicomTags.StudyInstanceUID);

  if (!studyInstanceUid) {
    return undefined;
  }

  return {
    accessionNumber: normalizeText(study.MainDicomTags.AccessionNumber),
    patientId: normalizeText(study.PatientMainDicomTags?.PatientID),
    patientName: normalizeText(study.PatientMainDicomTags?.PatientName),
    series: [...series],
    studyDate: normalizeDicomDate(study.MainDicomTags.StudyDate),
    studyDescription: normalizeText(study.MainDicomTags.StudyDescription),
    studyId,
    studyInstanceUid
  };
}

function toBrowserSeries(
  seriesId: string,
  series: OrthancSeries
): StudyBrowserSeries | undefined {
  const seriesInstanceUid = normalizeText(series.MainDicomTags.SeriesInstanceUID);

  if (!seriesInstanceUid) {
    return undefined;
  }

  const modality = normalizeText(series.MainDicomTags.Modality);

  return {
    description: normalizeText(series.MainDicomTags.SeriesDescription),
    instances: series.Instances.length,
    isLoadable: isLoadableImageSeries(modality, series.Instances.length),
    modality,
    seriesId,
    seriesInstanceUid,
    seriesNumber: normalizeText(series.MainDicomTags.SeriesNumber)
  };
}

function isLoadableImageSeries(modality: string | null, instances: number): boolean {
  if (instances < 1) {
    return false;
  }

  if (!modality) {
    return true;
  }

  return !NonImageModalities.has(modality.toUpperCase());
}

function sortStudies(studies: readonly StudyBrowserStudy[]): StudyBrowserStudy[] {
  const sorted = [...studies];

  sorted.sort((left, right) => {
    const dateComparison = compareNullableText(right.studyDate, left.studyDate);

    if (dateComparison !== 0) {
      return dateComparison;
    }

    return compareNullableText(left.patientName, right.patientName);
  });

  return sorted;
}

function sortSeries(series: readonly StudyBrowserSeries[]): StudyBrowserSeries[] {
  const sorted = [...series];

  sorted.sort((left, right) => {
    const leftNumber = readSortableSeriesNumber(left.seriesNumber);
    const rightNumber = readSortableSeriesNumber(right.seriesNumber);

    if (leftNumber !== rightNumber) {
      return leftNumber - rightNumber;
    }

    return compareNullableText(left.description, right.description);
  });

  return sorted;
}

function readSortableSeriesNumber(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return parsed;
}

function compareNullableText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function normalizeText(value: string | undefined): string | null {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function normalizeDicomDate(value: string | undefined): string | null {
  const trimmed = normalizeText(value);

  if (!trimmed || trimmed.length !== 8) {
    return trimmed;
  }

  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

function buildOrthancUrl(path: readonly string[]): string {
  return [
    getOrthancBaseUrl(),
    ...path.map((segment) => encodeURIComponent(segment))
  ].join("/");
}

function getOrthancBaseUrl(): string {
  return (process.env.ORTHANC_REST_URL ?? "http://localhost:8042").replace(/\/+$/, "");
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Orthanc request failed";
}
