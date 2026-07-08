import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Generic sample data so anyone can run the app and see every module populated.
// Replace the profiles/projects/packages with your own (or clear them) — the
// package registry slugs are placeholders; set real ones in the Packages UI and
// hit "Refresh stats" to pull live data.
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
      { startDate: new Date(`${year}-08-01`), endDate: new Date(`${year}-08-05`), type: "annual", notes: "Summer break" },
    ],
  });

  await db.profile.createMany({
    data: [
      { label: "GitHub", url: "https://github.com/your-username", username: "your-username", icon: "github", order: 0 },
      { label: "LinkedIn", url: "https://www.linkedin.com/in/your-username", username: "your-username", icon: "linkedin", order: 1 },
      { label: "Medium", url: "https://medium.com/@your-username", username: "@your-username", icon: "medium", order: 2 },
      { label: "pub.dev", url: "https://pub.dev/publishers/example.com/packages", username: "example.com", icon: "pubdev", order: 3 },
      { label: "npm", url: "https://www.npmjs.com/~your-username", username: "your-username", icon: "npm", order: 4 },
      { label: "Personal Site", url: "https://example.com", username: null, icon: "globe", order: 5 },
      { label: "X", url: "https://x.com/your-username", username: "@your-username", icon: "x", order: 6 },
    ],
  });

  const webApp = await db.project.create({
    data: {
      name: "Demo Web App",
      repoUrl: "https://github.com/your-username/demo-web-app",
      platform: "web",
      status: "active",
      progressPct: 60,
      notes: "Sample web project — replace with your own.",
      milestones: {
        create: [
          { title: "Scaffold + data layer", done: true, order: 0 },
          { title: "Core features", done: false, order: 1 },
          { title: "Polish + ship", done: false, order: 2 },
        ],
      },
    },
  });

  const mobileApp = await db.project.create({
    data: {
      name: "Demo Mobile App",
      repoUrl: "https://github.com/your-username/demo-mobile-app",
      platform: "flutter",
      status: "active",
      progressPct: 80,
      notes: "Sample mobile project — replace with your own.",
      milestones: {
        create: [
          { title: "Set up navigation", done: true, order: 0 },
          { title: "Build main screens", done: true, order: 1 },
          { title: "Docs", done: false, order: 2 },
        ],
      },
    },
  });

  await db.task.createMany({
    data: [
      { title: "Write project README", description: "Setup steps and overview", status: "in_progress", priority: "high", dueDate: new Date(`${year}-07-10`), tags: JSON.stringify(["docs"]), order: 0, projectId: webApp.id },
      { title: "Refresh package stats", description: "Run refresh on all packages", status: "todo", priority: "medium", tags: JSON.stringify(["packages"]), order: 0, projectId: null },
      { title: "Review drag-and-drop board", status: "todo", priority: "low", tags: JSON.stringify(["ui", "review"]), order: 1, projectId: webApp.id },
      { title: "Publish mobile app docs", status: "done", priority: "medium", tags: JSON.stringify(["docs"]), order: 0, projectId: mobileApp.id },
    ],
  });

  await db.package.createMany({
    data: [
      { name: "example-ui", description: "Sample UI component library.", registry: "npm", registryUrl: "https://www.npmjs.com/package/example-ui", githubUrl: "https://github.com/your-username/example-ui", language: "js_react", tags: JSON.stringify(["ui", "react"]), status: "active", projectId: webApp.id },
      { name: "example-utils", description: "Sample utility helpers.", registry: "npm", registryUrl: "https://www.npmjs.com/package/example-utils", githubUrl: "https://github.com/your-username/example-utils", language: "js_react", tags: JSON.stringify(["utils"]), status: "active" },
      { name: "example_flutter_kit", description: "Sample Flutter widget kit.", registry: "pubdev", registryUrl: "https://pub.dev/packages/example_flutter_kit", githubUrl: "https://github.com/your-username/example_flutter_kit", language: "dart_flutter", tags: JSON.stringify(["flutter", "widgets"]), status: "active", projectId: mobileApp.id },
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
