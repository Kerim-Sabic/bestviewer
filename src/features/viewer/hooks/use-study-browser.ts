"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchStudyBrowser } from "../lib/study-browser-client";
import type { StudyBrowserResponse } from "../lib/study-browser-schema";

export type StudyBrowserState =
  | { status: "loading" }
  | { status: "success"; response: StudyBrowserResponse }
  | { status: "error"; message: string };

export function useStudyBrowser() {
  const [state, setState] = useState<StudyBrowserState>({ status: "loading" });
  const activeRequestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    activeRequestRef.current?.abort();

    const controller = new AbortController();
    activeRequestRef.current = controller;
    setState({ status: "loading" });

    const result = await fetchStudyBrowser(controller.signal);

    if (controller.signal.aborted) {
      return;
    }

    activeRequestRef.current = null;

    if (!result.ok) {
      setState({ status: "error", message: result.message });
      return;
    }

    setState({ status: "success", response: result.value });
  }, []);

  useEffect(() => {
    void refresh();

    return () => {
      activeRequestRef.current?.abort();
    };
  }, [refresh]);

  return { refresh, state };
}
