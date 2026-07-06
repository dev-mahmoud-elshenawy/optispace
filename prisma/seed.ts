import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Package registry slugs below are best-guess. Correct any that don't match the
// real registry name via the Packages UI, then use "Refresh stats" to pull live data.
async function main() {
  // Idempotent re-seed: clear in relation-safe order
  await db.milestone.deleteMany();
  await db.task.deleteMany();
  await db.package.deleteMany();
  await db.project.deleteMany();
  await db.leave.deleteMany();
  await db.leaveAllowance.deleteMany();
  await db.profile.deleteMany();

  const year = new Date().getFullYear();

  await db.leaveAllowance.create({ data: { year, totalDays: 21 } });
  await db.leave.createMany({
    data: [
      { startDate: new Date(`${year}-02-10`), endDate: new Date(`${year}-02-12`), type: "annual", notes: "Long weekend" },
      { startDate: new Date(`${year}-04-01`), endDate: new Date(`${year}-04-01`), type: "sick", notes: "Flu" },
    ],
  });

  await db.profile.createMany({
    data: [
      { label: "GitHub", url: "https://github.com/dev-mahmoud-elshenawy", username: "dev-mahmoud-elshenawy", icon: "github", order: 0 },
      { label: "LinkedIn", url: "https://www.linkedin.com/in/dev-mahmoud-elshenawy", username: "dev-mahmoud-elshenawy", icon: "linkedin", order: 1 },
      { label: "Medium", url: "https://medium.com/@dev-mahmoud-elshenawy", username: "@dev-mahmoud-elshenawy", icon: "medium", order: 2 },
      { label: "pub.dev", url: "https://pub.dev/publishers/dev-mahmoud-elshenawy/packages", username: "dev-mahmoud-elshenawy", icon: "pubdev", order: 3 },
      { label: "npm", url: "https://www.npmjs.com/~dev-mahmoud-elshenawy", username: "dev-mahmoud-elshenawy", icon: "npm", order: 4 },
      { label: "Personal Site", url: "https://mahmoudelshenawy.dev", username: null, icon: "globe", order: 5 },
      { label: "X", url: "https://x.com/dev_m_elshenawy", username: "@dev_m_elshenawy", icon: "x", order: 6 },
    ],
  });

  const optispace = await db.project.create({
    data: {
      name: "OptiSpace",
      repoUrl: "https://github.com/dev-mahmoud-elshenawy/optispace",
      platform: "web",
      status: "active",
      progressPct: 60,
      notes: "Local-first personal workspace.",
      milestones: {
        create: [
          { title: "Scaffold + data layer", done: true, order: 0 },
          { title: "Core modules", done: false, order: 1 },
          { title: "Seed + README", done: false, order: 2 },
        ],
      },
    },
  });

  const optikit = await db.project.create({
    data: {
      name: "OptiKit",
      repoUrl: "https://github.com/dev-mahmoud-elshenawy/OptiKit",
      platform: "flutter",
      status: "active",
      progressPct: 80,
      notes: "Flutter CLI + build toolkit.",
      milestones: {
        create: [
          { title: "CLI commands", done: true, order: 0 },
          { title: "Build automation", done: true, order: 1 },
          { title: "Docs", done: false, order: 2 },
        ],
      },
    },
  });

  await db.task.createMany({
    data: [
      { title: "Write OptiSpace README", description: "macOS setup steps", status: "in_progress", priority: "high", dueDate: new Date(`${year}-07-10`), tags: JSON.stringify(["docs"]), order: 0, projectId: optispace.id },
      { title: "Refresh package stats", description: "Run refresh on all packages", status: "todo", priority: "medium", tags: JSON.stringify(["packages"]), order: 0, projectId: null },
      { title: "Review Kanban drag-and-drop", status: "todo", priority: "low", tags: JSON.stringify(["ui", "review"]), order: 1, projectId: optispace.id },
      { title: "Publish OptiKit docs", status: "done", priority: "medium", tags: JSON.stringify(["docs"]), order: 0, projectId: optikit.id },
    ],
  });

  await db.package.createMany({
    data: [
      { name: "opticore", description: "Flutter core framework & architecture toolkit.", registry: "pubdev", registryUrl: "https://pub.dev/packages/opticore", githubUrl: "https://github.com/dev-mahmoud-elshenawy/Opticore", language: "dart_flutter", tags: JSON.stringify(["flutter", "architecture"]), status: "active" },
      { name: "auto_validate", description: "Dart validation utilities.", registry: "pubdev", registryUrl: "https://pub.dev/packages/auto_validate", githubUrl: "https://github.com/dev-mahmoud-elshenawy/AutoValidate", language: "dart_flutter", tags: JSON.stringify(["validation"]), status: "active" },
      { name: "image_craft", description: "Flutter image handling package.", registry: "pubdev", registryUrl: "https://pub.dev/packages/image_craft", githubUrl: "https://github.com/dev-mahmoud-elshenawy/ImageCraft", language: "dart_flutter", tags: JSON.stringify(["images"]), status: "active" },
      { name: "optireact", description: "React utilities & toolkit.", registry: "npm", registryUrl: "https://www.npmjs.com/package/optireact", githubUrl: "https://github.com/dev-mahmoud-elshenawy/OptiReact", language: "js_react", tags: JSON.stringify(["react"]), status: "active" },
      { name: "optikit", description: "React Native / mobile toolkit CLI.", registry: "npm", registryUrl: "https://www.npmjs.com/package/optikit", githubUrl: "https://github.com/dev-mahmoud-elshenawy/OptiKit", language: "js_react_native", tags: JSON.stringify(["react-native", "cli"]), status: "active", projectId: optikit.id },
      { name: "optitest", description: "Testing utilities.", registry: "npm", registryUrl: "https://www.npmjs.com/package/optitest", githubUrl: "https://github.com/dev-mahmoud-elshenawy/OptiTest", language: "js_react", tags: JSON.stringify(["testing"]), status: "maintenance" },
    ],
  });

  const counts = {
    profiles: await db.profile.count(),
    projects: await db.project.count(),
    tasks: await db.task.count(),
    packages: await db.package.count(),
    leaves: await db.leave.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
