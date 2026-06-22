"use client";

import dynamic from "next/dynamic";

const ReadingRoomShell = dynamic(
  () =>
    import("@/features/viewer/components/reading-room-shell").then(
      (module) => module.ReadingRoomShell
    ),
  { ssr: false }
);

export function ViewerClient({
  studyInstanceUid
}: {
  readonly studyInstanceUid: string;
}) {
  return <ReadingRoomShell studyInstanceUid={studyInstanceUid} />;
}
