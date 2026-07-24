import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "./service";

describe("sanitizeHtml", () => {
  it("keeps allowlisted formatting tags", () => {
    expect(sanitizeHtml("<p>Hello <b>world</b></p>")).toBe("<p>Hello <b>world</b></p>");
  });

  it("strips script tags entirely (XSS)", () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).not.toMatch(/onerror/);
    expect(sanitizeHtml("<script>alert(1)</script>")).not.toMatch(/<script/i);
  });

  it("drops disallowed attributes but keeps the element", () => {
    expect(sanitizeHtml('<a href="https://example.com" onclick="evil()">link</a>')).toBe(
      '<a href="https://example.com">link</a>',
    );
  });

  it("blocks non-http(s) URI schemes (javascript:)", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">link</a>')).not.toMatch(/javascript:/);
  });

  it("strips data-vss-mention (documented cosmetic trade-off — see AGENTS.md)", () => {
    const out = sanitizeHtml('<a data-vss-mention="version:2.0,abc" href="https://dev.azure.com/x">@user</a>');
    expect(out).not.toMatch(/data-vss-mention/);
  });
});

// Gap: mapPriority, categoryToStatus, and nameHeuristic are NOT exported from this
// module, so they can't be unit tested directly — only indirectly through
// fetchAssignedWorkItems (which needs a live/mocked ADO client). Export them (or move
// to a small pure-mapping module) to make this status/priority-collapsing logic
// directly testable; it's exactly the kind of branchy mapping most likely to regress
// silently when ADO adds a new state/process template.
