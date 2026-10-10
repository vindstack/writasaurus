async function run(args: string[], description: string): Promise<void> {
  console.log(`\n${description}`);
  const child = new Deno.Command("deno", {
    args,
    cwd: new URL("../", import.meta.url),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();
  const status = await child.status;
  if (!status.success) Deno.exit(status.code);
}

Deno.env.set("PUBLIC_LICENSE_TEST_BYPASS", "true");
await run(["task", "build"], "Building desktop app with the test license bypass");
await run(
  ["test", "--allow-read", "--allow-env", "tests/*_test.ts"],
  "Running desktop unit tests",
);
await run(
  [
    "test",
    "--allow-read",
    "--allow-write",
    "--allow-env",
    "--allow-net",
    "--allow-run",
    "--allow-sys=homedir,osRelease",
    "tests/browser",
  ],
  "Running desktop browser tests",
);
