import { PageShell } from "@/components/layout/page-shell";
import { ProfilesView } from "@/features/profiles/components/profiles-view";
import { listProfiles } from "@/features/profiles/queries";

export default async function ProfilesPage() {
  const profiles = await listProfiles();

  return (
    <PageShell title="Profiles" description="Your linked profiles">
      <ProfilesView profiles={profiles} />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
