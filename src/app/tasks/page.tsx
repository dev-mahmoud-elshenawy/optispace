import { PageShell } from "@/components/layout/page-shell";
import { listPullRequests } from "@/features/integrations/github/queries";
import { listProjectOptions, listTasks } from "@/features/tasks/queries";
import { TasksView } from "@/features/tasks/components/tasks-view";

export default async function TasksPage() {
  const [tasks, projectOptions, pullRequests] = await Promise.all([
    listTasks(),
    listProjectOptions(),
    listPullRequests(),
  ]);

  return (
    <PageShell title="Tasks" description="Track work across your board and list views">
      <TasksView initialTasks={tasks} projectOptions={projectOptions} pullRequests={pullRequests} />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
