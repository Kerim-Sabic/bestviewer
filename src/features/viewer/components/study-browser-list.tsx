"use client";

import {
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Layers,
  RotateCw
} from "lucide-react";

import type { StudyBrowserState } from "../hooks/use-study-browser";
import type { StudyBrowserSeries, StudyBrowserStudy } from "../lib/study-browser-schema";
import type { LoadStatus } from "../types";

interface StudyBrowserListProps {
  readonly activeSeriesInstanceUid: string | null;
  readonly activeStudyInstanceUid: string | null;
  readonly loadStatus: LoadStatus;
  readonly onRefresh: () => void;
  readonly onSeriesSelected: (selection: StudyBrowserSelection) => void;
  readonly state: StudyBrowserState;
}

export interface StudyBrowserSelection {
  readonly series: StudyBrowserSeries;
  readonly study: StudyBrowserStudy;
}

export function StudyBrowserList({
  activeSeriesInstanceUid,
  activeStudyInstanceUid,
  loadStatus,
  onRefresh,
  onSeriesSelected,
  state
}: StudyBrowserListProps) {
  if (state.status === "loading") {
    return <StudyBrowserLoading />;
  }

  if (state.status === "error") {
    return <StudyBrowserError message={state.message} onRefresh={onRefresh} />;
  }

  if (state.response.studies.length === 0) {
    return <StudyBrowserEmpty onRefresh={onRefresh} />;
  }

  return (
    <div className="study-browser" aria-label="Available Orthanc studies">
      <ol className="study-list">
        {state.response.studies.map((study) => (
          <StudyRow
            activeSeriesInstanceUid={activeSeriesInstanceUid}
            activeStudyInstanceUid={activeStudyInstanceUid}
            isSeriesLoading={loadStatus.status === "loading"}
            key={study.studyId}
            onSeriesSelected={onSeriesSelected}
            study={study}
          />
        ))}
      </ol>
    </div>
  );
}

function StudyRow({
  activeSeriesInstanceUid,
  activeStudyInstanceUid,
  isSeriesLoading,
  onSeriesSelected,
  study
}: {
  readonly activeSeriesInstanceUid: string | null;
  readonly activeStudyInstanceUid: string | null;
  readonly isSeriesLoading: boolean;
  readonly onSeriesSelected: (selection: StudyBrowserSelection) => void;
  readonly study: StudyBrowserStudy;
}) {
  const isActiveStudy = study.studyInstanceUid === activeStudyInstanceUid;

  return (
    <li className="study-row" data-active={isActiveStudy}>
      <div className="study-row-header">
        <div>
          <strong>{study.patientName ?? "Unknown patient"}</strong>
          <span>{getStudySubtitle(study)}</span>
        </div>
        <span className="series-count">{study.series.length} series</span>
      </div>

      <div className="series-list">
        {study.series.map((series) => (
          <button
            className="series-row"
            data-active={
              isActiveStudy && series.seriesInstanceUid === activeSeriesInstanceUid
            }
            disabled={!series.isLoadable || isSeriesLoading}
            key={series.seriesId}
            onClick={() => onSeriesSelected({ series, study })}
            title={series.isLoadable ? series.seriesInstanceUid : "Non-image series"}
            type="button"
          >
            {series.isLoadable ? (
              <ImageIcon size={14} aria-hidden="true" />
            ) : (
              <FileText size={14} aria-hidden="true" />
            )}
            <span>
              <strong>{getSeriesTitle(series)}</strong>
              <small>{getSeriesSubtitle(series)}</small>
            </span>
          </button>
        ))}
      </div>
    </li>
  );
}

function StudyBrowserLoading() {
  return (
    <div className="study-browser skeleton-browser" aria-label="Loading studies">
      <div />
      <div />
      <div />
    </div>
  );
}

function StudyBrowserError({
  message,
  onRefresh
}: {
  readonly message: string;
  readonly onRefresh: () => void;
}) {
  return (
    <div className="study-browser-state" data-state="error">
      <AlertTriangle size={18} aria-hidden="true" />
      <strong>Studies unavailable</strong>
      <span>{message}</span>
      <button className="secondary-command" onClick={onRefresh} type="button">
        <RotateCw size={14} />
        <span>Retry</span>
      </button>
    </div>
  );
}

function StudyBrowserEmpty({ onRefresh }: { readonly onRefresh: () => void }) {
  return (
    <div className="study-browser-state">
      <Layers size={20} aria-hidden="true" />
      <strong>No studies</strong>
      <button className="secondary-command" onClick={onRefresh} type="button">
        <RotateCw size={14} />
        <span>Refresh</span>
      </button>
    </div>
  );
}

function getStudySubtitle(study: StudyBrowserStudy): string {
  const date = study.studyDate ?? "No date";
  const description = study.studyDescription ?? "No description";

  return `${date} / ${description}`;
}

function getSeriesTitle(series: StudyBrowserSeries): string {
  const number = series.seriesNumber ? `#${series.seriesNumber}` : "Series";
  const modality = series.modality ?? "OT";

  return `${number} ${modality}`;
}

function getSeriesSubtitle(series: StudyBrowserSeries): string {
  const description = series.description ?? "No description";

  return `${series.instances} instances / ${description}`;
}
