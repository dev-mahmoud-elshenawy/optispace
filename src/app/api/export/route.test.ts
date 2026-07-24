import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    task: {
      findMany: vi.fn(async () => [
        { id: "t1", title: "Ship it", description: null, status: "todo", priority: "high", dueDate: null, order: 0, projectId: null, createdAt: new Date("2026-01-01T00:00:00Z") },
      ]),
    },
    package: { findMany: vi.fn(async () => []) },
    profile: { findMany: vi.fn(async () => []) },
    leave: { findMany: vi.fn(async () => []) },
    project: { findMany: vi.fn(async () => []) },
  },
}));

import { GET } from "./route";

describe("GET /api/export", () => {
  it("returns 400 for an unknown module", async () => {
    const res = await GET(new Request("http://localhost/api/export?module=bogus"));
    expect(res.status).toBe(400);
  });

  it("returns JSON by default", async () => {
    const res = await GET(new Request("http://localhost/api/export?module=tasks"));
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = JSON.parse(await res.text());
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Ship it");
  });

  it("returns CSV with a header row matching the selected columns", async () => {
    const res = await GET(new Request("http://localhost/api/export?module=tasks&format=csv"));
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const [header, row] = (await res.text()).split("\n");
    expect(header).toBe("id,title,description,status,priority,dueDate,order,projectId,createdAt");
    expect(row).toContain("Ship it");
  });

  it("quotes CSV cells containing a comma or embedded quote", async () => {
    vi.mocked((await import("@/lib/db")).db.task.findMany).mockResolvedValueOnce([
      { id: "t2", title: 'Say "hi", now', description: null, status: "todo", priority: "low", dueDate: null, order: 0, projectId: null, createdAt: new Date() },
    ] as never);
    const res = await GET(new Request("http://localhost/api/export?module=tasks&format=csv"));
    const [, row] = (await res.text()).split("\n");
    expect(row).toContain('"Say ""hi"", now"');
  });

  it("sets Content-Disposition with the module name and format extension", async () => {
    const res = await GET(new Request("http://localhost/api/export?module=packages&format=csv"));
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="optispace-packages.csv"');
  });
});

// Gap: csvCell/toCsv are private to route.ts, so their escaping edge cases (null,
// Date, nested object → JSON.stringify) are only reachable through the full GET
// handler above. Consider exporting them from a small csv.ts util for direct,
// faster unit tests of the escaping rules themselves.
