import { describe, expect, it } from "vitest";
import { registryLabel, registryProvider } from "./service";

describe("registryLabel", () => {
  it("maps legacy 'pubdev' key to the pretty 'pub.dev' label", () => {
    expect(registryLabel("pubdev")).toBe("pub.dev");
  });

  it("passes through free-text registries verbatim", () => {
    expect(registryLabel("crates.io")).toBe("crates.io");
  });
});

describe("registryProvider", () => {
  it("resolves npm case-insensitively", () => {
    expect(registryProvider("npm")).toBe("npm");
    expect(registryProvider("NPM")).toBe("npm");
  });

  it("resolves pub.dev regardless of punctuation", () => {
    expect(registryProvider("pub.dev")).toBe("pubdev");
    expect(registryProvider("pubdev")).toBe("pubdev");
  });

  it("returns null for any other registry (manually tracked, no live stats)", () => {
    expect(registryProvider("PyPI")).toBeNull();
    expect(registryProvider("crates.io")).toBeNull();
  });

  it("returns null for an empty registry string", () => {
    expect(registryProvider("")).toBeNull();
  });
});
