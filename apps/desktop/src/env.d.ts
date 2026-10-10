/// <reference types="astro/client" />

// Astro's checker does not load Deno's built-in types; `deno check` validates runtime APIs.
declare const Deno: {
  build: { os: string };
  env: { get(name: string): string | undefined };
  permissions: {
    query(options: { name: "run"; command?: string }): Promise<{ state: string }>;
  };
  Command: new (
    command: string,
    options?: {
      args?: string[];
      stdout?: "inherit" | "null" | "piped";
      stderr?: "inherit" | "null" | "piped";
    },
  ) => {
    output(): Promise<{ success: boolean; stdout: Uint8Array }>;
  };
  readFile(path: string): Promise<Uint8Array>;
  readTextFile(path: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  writeTextFile(
    path: string,
    data: string,
    options?: { createNew?: boolean; append?: boolean },
  ): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string): Promise<void>;
  exit(code?: number): never;
  errors: {
    AlreadyExists: new (...args: never[]) => Error;
    NotCapable: new (...args: never[]) => Error;
    NotFound: new (...args: never[]) => Error;
  };
};

declare module "jsr:@std/http@^1.1.1/file-server" {
  export function serveFile(request: Request, filePath: string): Promise<Response>;
}

declare namespace App {
  interface Locals {
    cspNonce: string;
  }
}
