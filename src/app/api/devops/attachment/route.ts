import { fetchAttachment } from "@/features/integrations/azure-devops/service";

// Streams an Azure DevOps work-item attachment through the server so the PAT
// never reaches the browser. The id is an ADO attachment GUID; the upstream URL
// is rebuilt from the configured org (no arbitrary URLs → no SSRF).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const name = url.searchParams.get("name") ?? "attachment";
  if (!id) {
    return new Response("Missing id", { status: 400 });
  }

  const file = await fetchAttachment(id, name);
  if (!file) {
    return new Response("Not found or Azure DevOps not configured", { status: 404 });
  }

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(name)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
