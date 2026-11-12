/** Splits a relative `/`-separated path into segments, rejecting traversal and absolute paths. */
export function splitPath(path: string): string[] {
  if (path.startsWith("/")) throw new TypeError(`Path must be relative: ${path}`);
  const segments = path.split("/").filter((segment) => segment !== "" && segment !== ".");
  for (const segment of segments) {
    if (segment === ".." || segment.includes("\\")) {
      throw new TypeError(`Invalid path segment "${segment}" in ${path}`);
    }
  }
  return segments;
}

export function normalizePath(path: string): string {
  return splitPath(path).join("/");
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join("/"));
}

/** Returns the parent segments and final name of a non-empty path. */
export function parentAndName(path: string): { parent: string[]; name: string } {
  const segments = splitPath(path);
  const name = segments.pop();
  if (!name) throw new TypeError("Path must name a file or folder");
  return { parent: segments, name };
}
