/// <reference types="astro/client" />
/// <reference types="node" />

declare module "cloudflare:workers" {
  export const env: {
    DB: import("./lib/d1.ts").D1Database;
  };
}

declare namespace App {
  interface Locals {
    cspNonce: string;
  }
}
