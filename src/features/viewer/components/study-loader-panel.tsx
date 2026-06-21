"use client";

import { Database, RefreshCw, Server } from "lucide-react";

import { LocalUploadDropzone } from "./local-upload-dropzone";
import { ManualSeriesForm } from "./manual-series-form";
import { StudyBrowserList } from "./study-browser-list";
import { useStudyBrowser } from "../hooks/use-study-browser";
import {
  getDefaultDicomWebRoot,
  loadDicomWebSeries,
  type LoadDicomWebSeriesInput
} from "../lib/load-dicomweb-series";
import { loadLocalSeries } from "../lib/load-local-series";
import type { LoadedSeries, LoadStatus } from "../types";

interface StudyLoaderPanelProps {
  readonly activeSeriesInstanceUid: string | null;
  readonly activeStudyInstanceUid: string | null;
  readonly loadStatus: LoadStatus;
  readonly onLoadStatusChange: (status: LoadStatus) => void;
  readonly onSeriesLoaded: (series: LoadedSeries) => void;
}

export function StudyLoaderPanel({
  activeSeriesInstanceUid,
  activeStudyInstanceUid,
  loadStatus,
  onLoadStatusChange,
  onSeriesLoaded
}: StudyLoaderPanelProps) {
  const browser = useStudyBrowser();

  async function handleLoadSeries(input: LoadDicomWebSeriesInput) {
    onLoadStatusChange({ status: "loading" });

    const result = await loadDicomWebSeries(input);

    if (!result.ok) {
      onLoadStatusChange({ status: "error", message: result.message });
      return;
    }

    onSeriesLoaded(result.value);
    onLoadStatusChange({
      status: "success",
      imageCount: result.value.imageIds.length
    });
  }

  async function handleLocalFiles(files: File[]) {
    onLoadStatusChange({ status: "loading" });

    const result = await loadLocalSeries(files);

    if (!result.ok) {
      onLoadStatusChange({ status: "error", message: result.message });
      return;
    }

    onSeriesLoaded(result.value);
    onLoadStatusChange({
      status: "success",
      imageCount: result.value.imageIds.length
    });
  }

  return (
    <section className="viewer-panel study-loader" aria-labelledby="study-loader-title">
      <div className="panel-heading study-loader-heading">
        <span className="panel-icon" aria-hidden="true">
          <Database size={16} />
        </span>
        <h2 id="study-loader-title">Studies</h2>
        <button
          aria-label="Refresh studies"
          className="icon-command"
          disabled={browser.state.status === "loading"}
          onClick={() => void browser.refresh()}
          type="button"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <LocalUploadDropzone
        disabled={loadStatus.status === "loading"}
        onFiles={(files) => void handleLocalFiles(files)}
      />

      <StudyBrowserList
        activeSeriesInstanceUid={activeSeriesInstanceUid}
        activeStudyInstanceUid={activeStudyInstanceUid}
        loadStatus={loadStatus}
        onRefresh={() => void browser.refresh()}
        onSeriesSelected={(selection) =>
          void handleLoadSeries({
            seriesInstanceUid: selection.series.seriesInstanceUid,
            studyInstanceUid: selection.study.studyInstanceUid,
            wadoRoot: getDefaultDicomWebRoot()
          })
        }
        state={browser.state}
      />

      <ManualSeriesForm onLoadSeries={(input) => void handleLoadSeries(input)} />

      <div className="status-line" data-status={loadStatus.status}>
        <Server size={14} aria-hidden="true" />
        <span>{getLoadStatusText(loadStatus)}</span>
      </div>
    </section>
  );
}

function getLoadStatusText(status: LoadStatus): string {
  switch (status.status) {
    case "idle":
      return "No series loaded";
    case "loading":
      return "Loading metadata";
    case "success":
      return `${status.imageCount} image frames ready`;
    case "error":
      return status.message;
  }
}
