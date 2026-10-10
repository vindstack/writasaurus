// Open the dev server in a fixed-size window; auto-detection cannot set these window options.
const win = new Deno.BrowserWindow({
  title: "Writasaurus",
  width: 1000,
  height: 700,
  frameless: true,
});

const vite = new Deno.Command("deno", {
  args: ["task", "dev"],
  cwd: new URL("./", import.meta.url),
  stdout: "inherit",
  stderr: "inherit",
}).spawn();

// Deno Desktop exports the address its webview expects; the Vite child binds to it.
const port = Deno.env.get("DENO_SERVE_ADDRESS")?.split(":").pop() ?? "8000";
const url = `http://127.0.0.1:${port}/`;

const exit = () => {
  try {
    vite.kill();
  } catch { /* already stopped */ }
  Deno.exit(0);
};
win.addEventListener("close", exit);
Deno.addSignalListener("SIGINT", exit);

for (let i = 0; i < 100; i++) {
  try {
    await fetch(url);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}
win.navigate(url);
