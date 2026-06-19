import { fetchOrthancStudyBrowser } from "@/features/viewer/server/orthanc-study-browser";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const result = await fetchOrthancStudyBrowser();

  if (!result.ok) {
    return Response.json(
      { message: result.message },
      { status: result.status }
    );
  }

  return Response.json(result.value);
}
