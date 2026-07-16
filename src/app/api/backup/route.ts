import { buildBackupPayload } from "@/features/backup/queries";

// Full data export — every table, including soft-deleted rows, so a backup is
// complete and restorable. ProjectFile bytes are base64-encoded for JSON.
export async function GET(): Promise<Response> {
  const payload = await buildBackupPayload();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="optispace-backup-${stamp}.json"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
