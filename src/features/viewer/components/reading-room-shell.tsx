"use client";

import type {
  AnnotationUid,
  MeasurementToolName,
  StackFrameState,
  StackViewportController
} from "@horalix/dicom-engine";
import { Activity, BadgeInfo, Brain, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AiTrackingPanel } from "./ai-tracking-panel";
import { DicomStackViewport } from "./dicom-stack-viewport";
import { MeasurementPanel } from "./measurement-panel";
import { StudyLoaderPanel } from "./study-loader-panel";
import { ToolPalette } from "./tool-palette";
import { useMeasurements } from "../hooks/use-measurements";
import { DEFAULT_WINDOW_LEVEL, WINDOW_LEVEL_OPTIONS } from "../lib/defaults";
import { toolForHotkeyCode } from "../lib/measurement-tools";
import type { LoadedSeries, LoadStatus, WindowLevelSelection } from "../types";

export function ReadingRoomShell() {
  const [loadedSeries, setLoadedSeries] = useState<LoadedSeries | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ status: "idle" });
  const [windowLevel, setWindowLevel] =
    useState<WindowLevelSelection>(DEFAULT_WINDOW_LEVEL);
  const [controller, setController] = useState<StackViewportController | null>(null);
  const [activeTool, setActiveTool] = useState<MeasurementToolName | null>(null);
  const [frameState, setFrameState] = useState<StackFrameState>(
    createEmptyFrameState
  );

  const measurements = useMeasurements(controller);

  // Synchronize the UI's active-tool selection into the imperative Cornerstone
  // tool group. Re-runs when the controller (re)mounts so the binding is
  // re-applied to a fresh viewport.
  useEffect(() => {
    controller?.setActiveTool(activeTool);
  }, [controller, activeTool]);

  // Radiologists live on the keyboard: letters pick tools, Escape drops back
  // to window/level. Codes (not keys) keep bindings stable across layouts.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // NB: do not bail on event.defaultPrevented — Cornerstone calls
      // preventDefault() on keydowns while its viewport is focused, which is
      // exactly the common case (click the image, then press a tool key).
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isTypingElement(event.target)) {
        return;
      }

      if (event.code === "Escape") {
        setActiveTool(null);
        return;
      }

      const tool = toolForHotkeyCode(event.code);

      if (tool === undefined) {
        return;
      }

      event.preventDefault();
      setActiveTool((current) => (current === tool ? null : tool));
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleControllerReady = useCallback(
    (next: StackViewportController | null) => {
      setController(next);
    },
    []
  );

  const handleFrameStateChange = useCallback((next: StackFrameState) => {
    setFrameState(next);
  }, []);

  function handleSelectTool(tool: MeasurementToolName | null) {
    setActiveTool(tool);
  }

  function handleRemoveMeasurement(uid: AnnotationUid) {
    controller?.removeMeasurement(uid);
  }

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
            Phase 2
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
          onControllerReady={handleControllerReady}
          onFrameStateChange={handleFrameStateChange}
          series={loadedSeries}
          windowLevel={windowLevel}
        />

        <aside className="right-rail">
          <ToolPalette
            activeTool={activeTool}
            disabled={loadedSeries === null}
            onSelect={handleSelectTool}
          />

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

          <MeasurementPanel
            measurements={measurements}
            onRemove={handleRemoveMeasurement}
          />

          <AiTrackingPanel frameState={frameState} series={loadedSeries} />

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

function createEmptyFrameState(): StackFrameState {
  return {
    currentImageId: null,
    currentIndex: 0,
    total: 0
  };
}

function formatFrameRate(frameRate: number | null): string {
  if (frameRate === null) {
    return "Default";
  }

  return `${frameRate} fps`;
}

function isTypingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}
