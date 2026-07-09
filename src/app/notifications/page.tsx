import { PageShell } from "@/components/layout/page-shell";
import { listNotifications } from "@/features/notifications/queries";
import { NotificationsList } from "@/features/notifications/components/notifications-list";

export default async function NotificationsPage() {
  const notifications = await listNotifications();
  return (
    <PageShell title="Notifications" description="Azure DevOps assignments & mentions">
      <NotificationsList notifications={notifications} />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
