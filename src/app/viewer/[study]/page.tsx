import { ViewerClient } from "../../viewer-client";

export default async function ViewerPage({
  params
}: {
  params: Promise<{ study: string }>;
}) {
  const { study } = await params;
  return <ViewerClient studyInstanceUid={decodeURIComponent(study)} />;
}
