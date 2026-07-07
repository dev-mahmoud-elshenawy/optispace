import { getProjectFileForDownload } from "@/features/projects/queries";

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const file = await getProjectFileForDownload(id);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  // Copy into a fresh ArrayBuffer-backed view so the body type is a concrete BufferSource.
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.name)}"`,
    },
  });
}

export const dynamic = "force-dynamic";
