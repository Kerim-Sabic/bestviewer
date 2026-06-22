"use client";

import {
  Activity,
  Brain,
  ChevronRight,
  Layers,
  Loader2,
  RotateCw,
  ShieldCheck
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { LocalUploadDropzone } from "./local-upload-dropzone";
import { useStudyBrowser } from "../hooks/use-study-browser";
import { pushFilesToOrthancStow } from "../lib/stow-rs-client";
import type { StudyBrowserStudy } from "../lib/study-browser-schema";
import type { StowUploadState } from "../types";

export function HomeView() {
  const browser = useStudyBrowser();
  const [stow, setStow] = useState<StowUploadState>({ status: "idle" });
  const activeRequestRef = useRef<AbortController | null>(null);

  const uploading = stow.status === "preparing" || stow.status === "uploading";

  async function handleFiles(files: File[]) {
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setStow({ fileCount: files.length, status: "uploading" });

    const result = await pushFilesToOrthancStow(files, controller.signal);

    if (activeRequestRef.current !== controller) {
      return;
    }
    activeRequestRef.current = null;

    if (!result.ok) {
      setStow(result.error);
      return;
    }

    setStow({
      accepted: result.value.accepted,
      fileCount: result.value.fileCount,
      rejected: result.value.rejected,
      status: result.value.status,
      studyRetrieveUrl: result.value.studyRetrieveUrl
    });
    await browser.refresh();
  }

  return (
    <main className="home">
      <header className="home-top">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Brain size={20} />
          </div>
          <div>
            <h1>Horalix Viewer</h1>
            <p>AI-assisted DICOM reading · research use only</p>
          </div>
        </div>
        <div className="build-badges" aria-label="Build status">
          <span>
            <ShieldCheck size={14} aria-hidden="true" />
            SaMD controlled
          </span>
        </div>
      </header>

      <div className="home-body">
        <section className="home-upload" aria-labelledby="home-upload-title">
          <h2 id="home-upload-title">Add a study</h2>
          <p className="home-section-hint">
            Drop a DICOM loop or a folder of slices. Files are pushed to your local
            archive so you can reopen them anytime.
          </p>
          <LocalUploadDropzone disabled={uploading} onFiles={(files) => void handleFiles(files)} />
          {uploading ? (
            <p className="home-upload-status">
              <Loader2 size={14} className="spin" aria-hidden="true" /> Uploading…
            </p>
          ) : null}
          {stow.status === "failed" ? (
            <p className="ai-inline-error">{stow.message}</p>
          ) : null}
          {stow.status === "succeeded" || stow.status === "partially_succeeded" ? (
            <p className="ai-inline-ok">
              Uploaded {stow.accepted.length} instance(s). Open it below.
            </p>
          ) : null}
        </section>

        <section className="home-studies" aria-labelledby="home-studies-title">
          <div className="home-studies-head">
            <h2 id="home-studies-title">Your studies</h2>
            <button
              aria-label="Refresh studies"
              className="icon-command"
              disabled={browser.state.status === "loading"}
              onClick={() => void browser.refresh()}
              type="button"
            >
              <RotateCw size={15} />
            </button>
          </div>

          {browser.state.status === "loading" ? (
            <div className="home-grid skeleton-browser">
              <div />
              <div />
              <div />
              <div />
            </div>
          ) : null}

          {browser.state.status === "error" ? (
            <div className="study-browser-state" data-state="error">
              <Layers size={20} aria-hidden="true" />
              <strong>Studies unavailable</strong>
              <span>{browser.state.message}</span>
            </div>
          ) : null}

          {browser.state.status === "success" &&
          browser.state.response.studies.length === 0 ? (
            <div className="study-browser-state">
              <Layers size={20} aria-hidden="true" />
              <strong>No studies yet</strong>
              <span>Upload a DICOM above to get started.</span>
            </div>
          ) : null}

          {browser.state.status === "success" ? (
            <ul className="home-grid">
              {browser.state.response.studies.map((study) => (
                <StudyCard key={study.studyId} study={study} />
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function StudyCard({ study }: { readonly study: StudyBrowserStudy }) {
  const loadable = study.series.filter((series) => series.isLoadable);
  const modalities = [
    ...new Set(study.series.map((series) => series.modality ?? "OT"))
  ];

  return (
    <li>
      <Link
        className="study-card"
        href={`/viewer/${encodeURIComponent(study.studyInstanceUid)}`}
      >
        <div className="study-card-top">
          <span className="study-card-modalities">
            {modalities.map((modality) => (
              <span key={modality} className="modality-chip">
                {modality}
              </span>
            ))}
          </span>
          <ChevronRight size={16} aria-hidden="true" className="study-card-go" />
        </div>
        <strong className="study-card-name">
          {study.patientName ?? "Unknown patient"}
        </strong>
        <span className="study-card-desc">
          {study.studyDescription ?? "No description"}
        </span>
        <div className="study-card-meta">
          <span>
            <Activity size={13} aria-hidden="true" />
            {loadable.length} cine{loadable.length === 1 ? "" : "s"}
          </span>
          <span>{formatStudyDate(study.studyDate)}</span>
        </div>
      </Link>
    </li>
  );
}

function formatStudyDate(date: string | null): string {
  if (!date || date.length < 8) {
    return "No date";
  }
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}
