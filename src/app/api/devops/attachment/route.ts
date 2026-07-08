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

  // Never trust the upstream Content-Type (could be text/html or image/svg+xml →
  // stored XSS on our origin). Serve only known-safe image/pdf types inline;
  // everything else is a forced download as octet-stream. SVG is intentionally
  // excluded (it can execute script).
  const SAFE_INLINE: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    pdf: "application/pdf",
  };
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const safeType = SAFE_INLINE[ext];
  const contentType = safeType ?? "application/octet-stream";
  const disposition = safeType ? "inline" : "attachment";

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export const dynamic = "force-dynamic";
