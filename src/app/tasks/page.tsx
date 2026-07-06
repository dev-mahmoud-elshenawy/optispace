import { PageShell } from "@/components/layout/page-shell";
import { listProjectOptions, listTasks } from "@/features/tasks/queries";
import { TasksView } from "@/features/tasks/components/tasks-view";

export default async function TasksPage() {
  const [tasks, projectOptions] = await Promise.all([listTasks(), listProjectOptions()]);

  return (
    <PageShell title="Tasks" description="Track work across your board and list views">
      <TasksView initialTasks={tasks} projectOptions={projectOptions} />
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
