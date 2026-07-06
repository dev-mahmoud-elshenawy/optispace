import { PageShell } from "@/components/layout/page-shell";
import { listPackages, listProjectOptions } from "@/features/packages/queries";
import { PackagesView } from "@/features/packages/components/packages-view";

export default async function PackagesPage() {
  const [packages, projectOptions] = await Promise.all([listPackages(), listProjectOptions()]);

  return (
    <PageShell title="Packages" description="Track the npm and pub.dev packages you maintain.">
      <PackagesView packages={packages} projectOptions={projectOptions} />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
