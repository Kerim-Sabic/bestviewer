"use client";

import type {
  AnnotationUid,
  MeasurementToolName,
  StackFrameState,
  StackViewportController
} from "@horalix/dicom-engine";
import { BadgeInfo, Box, ChevronLeft, Film, Layers } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AiTrackingPanel } from "./ai-tracking-panel";
import { CardiacFunctionPanel } from "./cardiac-function-panel";
import { CineRail } from "./cine-rail";
import { DicomStackViewport } from "./dicom-stack-viewport";
import { MeasurementPanel } from "./measurement-panel";
import { MprViewport } from "./mpr-viewport";
import { ToolPalette } from "./tool-palette";
import { VlmReportPanel } from "./vlm-report-panel";
import { useAiSegmentation } from "../hooks/use-ai-segmentation";
import { useMeasurements } from "../hooks/use-measurements";
import { useStudyBrowser } from "../hooks/use-study-browser";
import { DEFAULT_WINDOW_LEVEL, WINDOW_LEVEL_OPTIONS } from "../lib/defaults";
import { getDefaultDicomWebRoot } from "../lib/load-dicomweb-series";
import { toolForHotkeyCode } from "../lib/measurement-tools";
import {
  cineToLoadedSeries,
  loadStudyCines,
  type Cine
} from "../lib/study-cines";
import type { LoadedSeries, LoadStatus, WindowLevelSelection } from "../types";

type ViewerLayout = "stack" | "mpr";
type CinesStatus =
  | { readonly status: "loading" }
  | { readonly status: "ready" }
  | { readonly status: "error"; readonly message: string };

interface ReadingRoomShellProps {
  readonly studyInstanceUid: string;
}

export function ReadingRoomShell({ studyInstanceUid }: ReadingRoomShellProps) {
  const browser = useStudyBrowser();
  const study =
    browser.state.status === "success"
      ? browser.state.response.studies.find(
          (entry) => entry.studyInstanceUid === studyInstanceUid
        ) ?? null
      : null;
  const seriesList = useMemo(() => study?.series ?? [], [study]);

  const [cines, setCines] = useState<readonly Cine[]>([]);
  const [cinesStatus, setCinesStatus] = useState<CinesStatus>({
    status: "loading"
  });
  const [activeCineId, setActiveCineId] = useState<string | null>(null);
  const [loadedSeries, setLoadedSeries] = useState<LoadedSeries | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>({ status: "idle" });
  const [windowLevel, setWindowLevel] =
    useState<WindowLevelSelection>(DEFAULT_WINDOW_LEVEL);
  const [controller, setController] = useState<StackViewportController | null>(null);
  const [activeTool, setActiveTool] = useState<MeasurementToolName | null>(null);
  const [layout, setLayout] = useState<ViewerLayout>("stack");
  const [frameState, setFrameState] = useState<StackFrameState>(
    createEmptyFrameState
  );
  const cinesLoadedRef = useRef(false);

  const measurements = useMeasurements(controller);
  const ai = useAiSegmentation({ controller, series: loadedSeries, frameState });

  const supportsMpr = loadedSeries !== null && loadedSeries.instanceCount > 1;

  const handleSelectCine = useCallback((cine: Cine) => {
    setActiveCineId(cine.id);
    setLayout("stack");
    setLoadedSeries(cineToLoadedSeries(cine, getDefaultDicomWebRoot()));
    setLoadStatus({ status: "success", imageCount: cine.imageIds.length });
  }, []);

  // Once the study's series are known, split it into cines and open the first.
  useEffect(() => {
    if (cinesLoadedRef.current || seriesList.length === 0) {
      return;
    }
    cinesLoadedRef.current = true;
    setCinesStatus({ status: "loading" });
    setLoadStatus({ status: "loading" });

    void loadStudyCines({
      studyInstanceUid,
      series: seriesList,
      wadoRoot: getDefaultDicomWebRoot()
    }).then((result) => {
      if (!result.ok) {
        setCinesStatus({ status: "error", message: result.message });
        setLoadStatus({ status: "error", message: result.message });
        return;
      }
      setCines(result.cines);
      setCinesStatus({ status: "ready" });
      const first = result.cines[0];
      if (first) {
        handleSelectCine(first);
      }
    });
  }, [seriesList, studyInstanceUid, handleSelectCine]);

  useEffect(() => {
    controller?.setActiveTool(activeTool);
  }, [controller, activeTool]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleControllerReady = useCallback(
    (next: StackViewportController | null) => setController(next),
    []
  );
  const handleFrameStateChange = useCallback(
    (next: StackFrameState) => setFrameState(next),
    []
  );

  function handleRemoveMeasurement(uid: AnnotationUid) {
    controller?.removeMeasurement(uid);
  }

  return (
    <main className="reading-room">
      <header className="top-bar">
        <div className="brand-lockup">
          <Link className="back-link" href="/" aria-label="Back to studies">
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <h1>{study?.patientName ?? "Loading study…"}</h1>
            <p>{study?.studyDescription ?? "Research use only"}</p>
          </div>
        </div>

        <div className="top-bar-controls">
          <div className="layout-switch" role="group" aria-label="Viewer layout">
            <button
              data-active={layout === "stack"}
              onClick={() => setLayout("stack")}
              type="button"
            >
              <Layers size={14} aria-hidden="true" />
              <span>Stack</span>
            </button>
            <button
              data-active={layout === "mpr"}
              disabled={!supportsMpr}
              onClick={() => setLayout("mpr")}
              title={supportsMpr ? undefined : "MPR needs a multi-slice volume"}
              type="button"
            >
              <Box size={14} aria-hidden="true" />
              <span>MPR</span>
            </button>
          </div>
        </div>
      </header>

      <div className="workbench">
        <aside className="left-rail">
          <section className="viewer-panel series-panel" aria-labelledby="cines-title">
            <div className="panel-heading">
              <span className="panel-icon" aria-hidden="true">
                <Film size={16} />
              </span>
              <h2 id="cines-title">Cines</h2>
              <span className="panel-count">{cines.length}</span>
            </div>
            <div className="series-rail">
              {cinesStatus.status === "loading" ? (
                <div className="skeleton-browser">
                  <div />
                  <div />
                  <div />
                </div>
              ) : cinesStatus.status === "error" ? (
                <p className="ai-inline-error" style={{ padding: "0 0.75rem" }}>
                  {cinesStatus.message}
                </p>
              ) : (
                <CineRail
                  activeCineId={activeCineId}
                  cines={cines}
                  onSelect={handleSelectCine}
                />
              )}
            </div>
          </section>
        </aside>

        {layout === "mpr" && loadedSeries ? (
          <MprViewport series={loadedSeries} windowLevel={windowLevel} />
        ) : (
          <DicomStackViewport
            aiPendingPrompts={ai.pendingPrompts}
            aiPromptMode={ai.promptMode}
            loadStatus={loadStatus}
            onAiAddBox={ai.addBoxPrompt}
            onAiAddPoint={ai.addPointPrompt}
            onControllerReady={handleControllerReady}
            onFrameStateChange={handleFrameStateChange}
            series={loadedSeries}
            windowLevel={windowLevel}
          />
        )}

        <aside className="right-rail">
          <ToolPalette
            activeTool={activeTool}
            disabled={loadedSeries === null || layout === "mpr"}
            onSelect={setActiveTool}
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

          <AiTrackingPanel ai={ai} />

          <CardiacFunctionPanel
            hasMask={ai.hasMask}
            lvFunction={ai.lvFunction}
            onCompute={ai.computeFunction}
            onJump={ai.jumpToFrame}
          />

          <VlmReportPanel
            hasMask={ai.hasMask}
            measurements={measurements}
            segments={ai.segments}
            series={loadedSeries}
          />
        </aside>
      </div>
    </main>
  );
}

function createEmptyFrameState(): StackFrameState {
  return { currentImageId: null, currentIndex: 0, total: 0 };
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
