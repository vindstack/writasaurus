import { basename } from "../src/lib/path.ts";

Deno.test("path: basename handles POSIX and Windows separators", () => {
  if (basename("/home/user/manuscript.epub") !== "manuscript.epub") {
    throw new Error("Expected POSIX path basename");
  }
  if (basename("C:\\Users\\user\\manuscript.epub") !== "manuscript.epub") {
    throw new Error("Expected Windows path basename");
  }
});

Deno.test("path: basename handles trailing separators and plain filenames", () => {
  if (basename("/home/user/") !== "user") {
    throw new Error("Expected trailing separators to be ignored");
  }
  if (basename("manuscript.epub") !== "manuscript.epub") {
    throw new Error("Expected a plain filename to remain unchanged");
  }
});
