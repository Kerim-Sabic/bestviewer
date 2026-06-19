"use client";

import { Activity, BadgeInfo, Brain, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { DicomStackViewport } from "./dicom-stack-viewport";
import { StudyLoaderPanel } from "./study-loader-panel";
import { DEFAULT_WINDOW_LEVEL, WINDOW_LEVEL_OPTIONS } from "../lib/defaults";
import type { LoadedSeries, LoadStatus, WindowLevelSelection } from "../types";

export function ReadingRoomShell() {
  const [loadedSeries, setLoadedSeries] = useState<LoadedSeries | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ status: "idle" });
  const [windowLevel, setWindowLevel] =
    useState<WindowLevelSelection>(DEFAULT_WINDOW_LEVEL);

  return (
    <main className="reading-room">
      <header className="top-bar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Brain size={18} />
          </div>
          <div>
            <h1>Horalix Viewer</h1>
            <p>Research use only</p>
          </div>
        </div>
        <div className="build-badges" aria-label="Build status">
          <span>
            <ShieldCheck size={14} aria-hidden="true" />
            SaMD controlled
          </span>
          <span>
            <Activity size={14} aria-hidden="true" />
            Phase 1
          </span>
        </div>
      </header>

      <div className="workbench">
        <aside className="left-rail">
          <StudyLoaderPanel
            activeSeriesInstanceUid={loadedSeries?.seriesInstanceUid ?? null}
            activeStudyInstanceUid={loadedSeries?.studyInstanceUid ?? null}
            loadStatus={loadStatus}
            onLoadStatusChange={setLoadStatus}
            onSeriesLoaded={setLoadedSeries}
          />
        </aside>

        <DicomStackViewport
          loadStatus={loadStatus}
          series={loadedSeries}
          windowLevel={windowLevel}
        />

        <aside className="right-rail">
          <section className="viewer-panel" aria-labelledby="window-level-title">
            <div className="panel-heading">
              <span className="panel-icon" aria-hidden="true">
                <BadgeInfo size={16} />
              </span>
              <h2 id="window-level-title">Window</h2>
            </div>

            <div className="preset-grid">
              {WINDOW_LEVEL_OPTIONS.map((option, index) => (
                <button
                  key={option.key}
                  className="preset-button"
                  data-active={option.key === windowLevel.key}
                  onClick={() => setWindowLevel(option)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <strong>{option.preset.label}</strong>
                  <small>
                    {option.preset.width}/{option.preset.center}
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className="viewer-panel study-summary" aria-labelledby="summary-title">
            <div className="panel-heading">
              <span className="panel-icon" aria-hidden="true">
                <Activity size={16} />
              </span>
              <h2 id="summary-title">Series</h2>
            </div>
            {loadedSeries ? (
              <dl className="metadata-list">
                <div>
                  <dt>Instances</dt>
                  <dd>{loadedSeries.instanceCount}</dd>
                </div>
                <div>
                  <dt>Frames</dt>
                  <dd>{loadedSeries.imageIds.length}</dd>
                </div>
                <div>
                  <dt>Cine rate</dt>
                  <dd>{formatFrameRate(loadedSeries.recommendedFrameRate)}</dd>
                </div>
                <div>
                  <dt>Study</dt>
                  <dd>{loadedSeries.studyInstanceUid}</dd>
                </div>
                <div>
                  <dt>Series</dt>
                  <dd>{loadedSeries.seriesInstanceUid}</dd>
                </div>
                <div>
                  <dt>Loaded</dt>
                  <dd>{new Date(loadedSeries.loadedAt).toLocaleTimeString()}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted-line">No metadata</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function formatFrameRate(frameRate: number | null): string {
  if (frameRate === null) {
    return "Default";
  }

  return `${frameRate} fps`;
}
