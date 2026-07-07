import { PageShell } from "@/components/layout/page-shell";
import { ArchiveList } from "@/features/archive/components/archive-list";
import { listArchived } from "@/features/archive/queries";

export default async function ArchivePage() {
  const items = await listArchived();

  return (
    <PageShell
      title="Archive"
      description={`Deleted items are kept here — restore anything you need${items.length ? ` (${items.length})` : ""}.`}
    >
      <ArchiveList items={items} />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
