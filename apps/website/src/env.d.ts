/// <reference types="astro/client" />
/// <reference types="node" />

declare module "cloudflare:workers" {
  export const env: {
    DB: import("./lib/d1.ts").D1Database;
    R2_DOWNLOAD_DESKTOP_BUCKET: import("./lib/d1.ts").R2Bucket;
  };
}

declare namespace App {
  interface Locals {
    cspNonce: string;
  }
}
