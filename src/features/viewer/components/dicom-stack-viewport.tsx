"use client";

import type { StackFrameState, StackViewportController } from "@horalix/dicom-engine";
import { AlertTriangle, Layers, Monitor } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CineControlStrip } from "./cine-control-strip";
import type {
  CineMode,
  CinePlaybackState,
  LoadedSeries,
  LoadStatus,
  WindowLevelSelection
} from "../types";

interface DicomStackViewportProps {
  readonly loadStatus: LoadStatus;
  readonly onControllerReady?: (controller: StackViewportController | null) => void;
  readonly series: LoadedSeries | null;
  readonly windowLevel: WindowLevelSelection;
}

type ViewportStatus =
  | { status: "mounting" }
  | { status: "ready" }
  | { status: "rendering"; imageCount: number }
  | { status: "rendered"; imageCount: number }
  | { status: "error"; message: string };

type CineDirection = -1 | 1;
type FrameNavigationResult = Awaited<
  ReturnType<StackViewportController["setFrameIndex"]>
>;

export function DicomStackViewport({
  loadStatus,
  onControllerReady,
  series,
  windowLevel
}: DicomStackViewportProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<StackViewportController | null>(null);
  const frameStateRef = useRef<StackFrameState>(createEmptyFrameState());
  const navigationInFlightRef = useRef(false);
  const playbackDirectionRef = useRef<CineDirection>(1);
  const windowLevelRef = useRef(windowLevel);
  const onControllerReadyRef = useRef(onControllerReady);
  const [controllerVersion, setControllerVersion] = useState(0);
  const [frameState, setFrameState] = useState<StackFrameState>(
    createEmptyFrameState
  );
  const [playback, setPlayback] = useState<CinePlaybackState>({
    framesPerSecond: 24,
    mode: "loop",
    status: "paused"
  });
  const [viewportStatus, setViewportStatus] = useState<ViewportStatus>({
    status: "mounting"
  });

  useEffect(() => {
    frameStateRef.current = frameState;
  }, [frameState]);

  useEffect(() => {
    windowLevelRef.current = windowLevel;
    controllerRef.current?.setWindowLevel(windowLevel.preset);
  }, [windowLevel]);

  useEffect(() => {
    onControllerReadyRef.current = onControllerReady;
  }, [onControllerReady]);

  useEffect(() => {
    playbackDirectionRef.current = 1;
    setPlayback((current) => ({
      ...current,
      framesPerSecond: normalizeFramesPerSecond(series?.recommendedFrameRate ?? null),
      status: "paused"
    }));
  }, [series?.loadedAt, series?.recommendedFrameRate]);

  useEffect(() => {
    let disposed = false;
    let unsubscribeFrameChange: (() => void) | undefined;
    const element = elementRef.current;

    if (!element) {
      setViewportStatus({
        status: "error",
        message: "Viewport element was not mounted"
      });
      return;
    }

    const mountedElement = element;

    async function mountViewport() {
      const { createStackViewport, RenderingEngineId, ToolGroupId, ViewportId } =
        await import("@horalix/dicom-engine");

      if (disposed) {
        return;
      }

      const result = createStackViewport({
        element: mountedElement,
        renderingEngineId: RenderingEngineId("horalix-primary-rendering-engine"),
        toolGroupId: ToolGroupId("horalix-primary-stack-tools"),
        viewportId: ViewportId("primary-stack-viewport")
      });

      if (!result.ok) {
        setViewportStatus({
          status: "error",
          message: result.error.message
        });
        return;
      }

      controllerRef.current = result.value;
      unsubscribeFrameChange = result.value.subscribeToFrameChange(setFrameState);
      setFrameState(result.value.getFrameState());
      setControllerVersion((version) => version + 1);
      onControllerReadyRef.current?.(result.value);
      setViewportStatus({ status: "ready" });
    }

    void mountViewport();

    return () => {
      disposed = true;
      unsubscribeFrameChange?.();
      controllerRef.current?.destroy();
      controllerRef.current = null;
      onControllerReadyRef.current?.(null);
    };
  }, []);

  useEffect(() => {
    const controller = controllerRef.current;

    if (!series) {
      setFrameState(createEmptyFrameState());
      setPlayback((current) => ({ ...current, status: "paused" }));
      return;
    }

    if (!controller) {
      return;
    }

    let cancelled = false;
    navigationInFlightRef.current = false;
    playbackDirectionRef.current = 1;
    setPlayback((current) => ({ ...current, status: "paused" }));
    setViewportStatus({
      status: "rendering",
      imageCount: series.imageIds.length
    });

    void controller
      .loadStack(series.imageIds, {
        windowLevel: windowLevelRef.current.preset
      })
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok) {
          setViewportStatus({
            status: "error",
            message: result.error.message
          });
          return;
        }

        setFrameState(controller.getFrameState());
        setViewportStatus({
          status: "rendered",
          imageCount: series.imageIds.length
        });
      });

    return () => {
      cancelled = true;
    };
  }, [controllerVersion, series]);

  useEffect(() => {
    if (playback.status !== "playing" || frameState.total <= 1) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const controller = controllerRef.current;

      if (!controller || navigationInFlightRef.current) {
        return;
      }

      navigationInFlightRef.current = true;

      if (playback.mode === "loop") {
        void controller.stepFrame(1, { loop: true }).then((result) => {
          navigationInFlightRef.current = false;
          handleFrameNavigationResult(result);
        });
        return;
      }

      const nextFrame = getNextBounceFrame({
        currentIndex: frameStateRef.current.currentIndex,
        direction: playbackDirectionRef.current,
        total: frameStateRef.current.total
      });

      playbackDirectionRef.current = nextFrame.direction;
      void controller.setFrameIndex(nextFrame.index).then((result) => {
        navigationInFlightRef.current = false;
        handleFrameNavigationResult(result);
      });
    }, 1000 / playback.framesPerSecond);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [frameState.total, playback.framesPerSecond, playback.mode, playback.status]);

  async function showFrame(imageIdIndex: number) {
    const controller = controllerRef.current;

    if (!controller || navigationInFlightRef.current) {
      return;
    }

    navigationInFlightRef.current = true;
    const result = await controller.setFrameIndex(imageIdIndex);
    navigationInFlightRef.current = false;
    handleFrameNavigationResult(result);
  }

  async function stepFrame(delta: number, loop: boolean) {
    const controller = controllerRef.current;

    if (!controller || navigationInFlightRef.current) {
      return;
    }

    navigationInFlightRef.current = true;
    const result = await controller.stepFrame(delta, { loop });
    navigationInFlightRef.current = false;
    handleFrameNavigationResult(result);
  }

  function handleFrameNavigationResult(result: FrameNavigationResult) {
    if (!result.ok) {
      setPlayback((current) => ({ ...current, status: "paused" }));
      setViewportStatus({ status: "error", message: result.error.message });
      return;
    }

    setFrameState(result.value);
  }

  function handleFrameRateChange(framesPerSecond: number) {
    setPlayback((current) => ({
      ...current,
      framesPerSecond: normalizeFramesPerSecond(framesPerSecond)
    }));
  }

  function handleModeChange(mode: CineMode) {
    playbackDirectionRef.current = 1;
    setPlayback((current) => ({ ...current, mode }));
  }

  function handleScrub(imageIdIndex: number) {
    setPlayback((current) => ({ ...current, status: "paused" }));
    void showFrame(imageIdIndex);
  }

  function handleStep(delta: number) {
    setPlayback((current) => ({ ...current, status: "paused" }));
    void stepFrame(delta, false);
  }

  function handleTogglePlayback() {
    if (frameState.total <= 1) {
      return;
    }

    setPlayback((current) => ({
      ...current,
      status: current.status === "playing" ? "paused" : "playing"
    }));
  }

  return (
    <section className="viewport-stage" aria-label="Primary DICOM viewport">
      <div className="viewport-toolbar">
        <div className="viewport-title">
          <Monitor size={16} aria-hidden="true" />
          <span>Stack viewport</span>
        </div>
        <div className="viewport-badges">
          <span>{windowLevel.preset.label}</span>
          <span>{getViewportStatusText(viewportStatus, loadStatus)}</span>
        </div>
      </div>

      <div className="cornerstone-frame">
        <div ref={elementRef} className="cornerstone-element" />
        {!series ? (
          <div className="viewport-empty">
            <span className="viewport-empty-mark" aria-hidden="true">
              <Layers size={30} />
            </span>
            <strong>No study loaded</strong>
            <span>Select a series from the Studies panel, or load one by UID.</span>
          </div>
        ) : null}
        {viewportStatus.status === "error" ? (
          <div className="viewport-error">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{viewportStatus.message}</span>
          </div>
        ) : null}
      </div>

      <CineControlStrip
        disabled={!series || viewportStatus.status === "error"}
        frameCount={frameState.total}
        frameIndex={frameState.currentIndex}
        frameRate={playback.framesPerSecond}
        mode={playback.mode}
        onFrameIndexChange={handleScrub}
        onFrameRateChange={handleFrameRateChange}
        onModeChange={handleModeChange}
        onStep={handleStep}
        onTogglePlayback={handleTogglePlayback}
        playbackStatus={playback.status}
        recommendedFrameRate={series?.recommendedFrameRate ?? null}
      />
    </section>
  );
}

function getViewportStatusText(
  viewportStatus: ViewportStatus,
  loadStatus: LoadStatus
): string {
  if (loadStatus.status === "loading") {
    return "Metadata";
  }

  switch (viewportStatus.status) {
    case "mounting":
      return "Initializing";
    case "ready":
      return "Ready";
    case "rendering":
      return `${viewportStatus.imageCount} frames`;
    case "rendered":
      return `${viewportStatus.imageCount} frames`;
    case "error":
      return "Error";
  }
}

function createEmptyFrameState(): StackFrameState {
  return {
    currentImageId: null,
    currentIndex: 0,
    total: 0
  };
}

function normalizeFramesPerSecond(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 24;
  }

  return Math.min(Math.max(Math.round(value), 1), 60);
}

function getNextBounceFrame(input: {
  readonly currentIndex: number;
  readonly direction: CineDirection;
  readonly total: number;
}): { readonly direction: CineDirection; readonly index: number } {
  if (input.total <= 1) {
    return { direction: 1, index: 0 };
  }

  const nextIndex = input.currentIndex + input.direction;

  if (nextIndex >= input.total) {
    return { direction: -1, index: Math.max(input.total - 2, 0) };
  }

  if (nextIndex < 0) {
    return { direction: 1, index: Math.min(1, input.total - 1) };
  }

  return { direction: input.direction, index: nextIndex };
}
