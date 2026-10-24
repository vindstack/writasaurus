import { createServer } from "./app.ts";

const port = Number(process.env.PORT ?? 8000);

createServer().listen(port, "127.0.0.1", () => {
  console.log(`Writasaurus is listening on http://127.0.0.1:${port}`);
});
