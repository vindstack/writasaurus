import { define } from "../../../utils.ts";
import { closeActiveFile } from "../../../lib/editor-session.ts";

export const handler = define.handlers({
  async POST() {
    await closeActiveFile();
    return Response.json({ ok: true });
  },
});
