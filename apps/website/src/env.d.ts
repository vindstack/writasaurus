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
  writeTextFile(path: string, data: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string): Promise<void>;
  exit(code?: number): never;
  errors: {
    NotCapable: new (...args: never[]) => Error;
    NotFound: new (...args: never[]) => Error;
  };
};

declare module "jsr:@std/http@^1.1.1/file-server" {
  export function serveFile(request: Request, filePath: string): Promise<Response>;
}

declare module "@db/postgres" {
  export interface QueryResult<Row> {
    rows: Row[];
  }

  export class PoolClient {
    queryArray(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    queryArray(query: { text: string; args: unknown[] }): Promise<unknown>;
    queryObject<Row extends Record<string, unknown> = Record<string, unknown>>(
      query: TemplateStringsArray,
      ...values: unknown[]
    ): Promise<QueryResult<Row>>;
    queryObject<Row extends Record<string, unknown> = Record<string, unknown>>(
      query: { text: string; args: unknown[] },
    ): Promise<QueryResult<Row>>;
    release(): void;
  }

  export class Pool {
    constructor(connectionString: string, max: number, lazy: boolean);
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
  }
}

declare namespace App {
  interface Locals {
    cspNonce: string;
  }
}
