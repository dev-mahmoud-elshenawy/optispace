import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Seeds the author's real profiles, packages, and a few tasks so anyone who
// installs the project can discover the packages. Projects and annual leave are
// intentionally NOT seeded — add your own from the UI.
async function main() {
  // Idempotent re-seed: clear in relation-safe order.
  await db.milestone.deleteMany();
  await db.task.deleteMany();
  await db.package.deleteMany();
  await db.project.deleteMany();
  await db.leave.deleteMany();
  await db.leaveAllowance.deleteMany();
  await db.profile.deleteMany();

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

  await db.package.createMany({
    data: [
      { name: "opticore", description: "Flutter core framework & architecture toolkit.", registry: "pubdev", registryUrl: "https://pub.dev/packages/opticore", githubUrl: "https://github.com/dev-mahmoud-elshenawy/Opticore", language: "dart_flutter", tags: JSON.stringify(["flutter", "architecture"]), status: "active" },
      { name: "auto_validate", description: "Dart validation utilities.", registry: "pubdev", registryUrl: "https://pub.dev/packages/auto_validate", githubUrl: "https://github.com/dev-mahmoud-elshenawy/AutoValidate", language: "dart_flutter", tags: JSON.stringify(["validation"]), status: "active" },
      { name: "image_craft", description: "Flutter image handling package.", registry: "pubdev", registryUrl: "https://pub.dev/packages/image_craft", githubUrl: "https://github.com/dev-mahmoud-elshenawy/ImageCraft", language: "dart_flutter", tags: JSON.stringify(["images"]), status: "active" },
      { name: "optireact", description: "Reactive utilities for Flutter.", registry: "pubdev", registryUrl: "https://pub.dev/packages/optireact", githubUrl: "https://github.com/dev-mahmoud-elshenawy/optireact", language: "dart_flutter", tags: JSON.stringify(["flutter"]), status: "active" },
      { name: "optikit", description: "React Native / mobile toolkit CLI.", registry: "npm", registryUrl: "https://www.npmjs.com/package/optikit", githubUrl: "https://github.com/dev-mahmoud-elshenawy/OptiKit", language: "js_react_native", tags: JSON.stringify(["react-native", "cli"]), status: "active" },
      { name: "optitest", description: "Testing utilities for Flutter.", registry: "pubdev", registryUrl: "https://pub.dev/packages/optitest", githubUrl: "https://github.com/dev-mahmoud-elshenawy/optitest", language: "dart_flutter", tags: JSON.stringify(["testing"]), status: "active" },
    ],
  });

  await db.task.createMany({
    data: [
      { title: "Write OptiSpace README", description: "macOS setup steps", status: "in_progress", priority: "high", dueDate: new Date(`${new Date().getFullYear()}-07-10`), order: 0, projectId: null },
      { title: "Refresh package stats", description: "Run refresh on all packages", status: "todo", priority: "medium", order: 0, projectId: null },
      { title: "Review Kanban drag-and-drop", status: "todo", priority: "low", order: 1, projectId: null },
      { title: "Publish OptiKit docs", status: "done", priority: "medium", order: 0, projectId: null },
    ],
  });

  const counts = {
    profiles: await db.profile.count(),
    packages: await db.package.count(),
    tasks: await db.task.count(),
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
