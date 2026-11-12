import { describe, expect, it } from "vitest";
import { joinPath, normalizePath, parentAndName, splitPath } from "../paths.ts";

describe("paths", () => {
  it("normalizes separators and dot segments", () => {
    expect(normalizePath("a//b/./c/")).toBe("a/b/c");
    expect(joinPath("a", "", "b/c")).toBe("a/b/c");
  });

  it("rejects traversal, absolute, and backslash paths", () => {
    expect(() => splitPath("../a")).toThrow(TypeError);
    expect(() => splitPath("/a")).toThrow(TypeError);
    expect(() => splitPath("a\\b")).toThrow(TypeError);
  });

  it("splits parent and name", () => {
    expect(parentAndName("a/b/c.txt")).toEqual({ parent: ["a", "b"], name: "c.txt" });
    expect(() => parentAndName("")).toThrow(TypeError);
  });
});
