import { define } from "../../../utils.ts";
import { editorStatus } from "../../../lib/editor-session.ts";

export const handler = define.handlers({
  async GET(ctx) {
    return Response.json(await editorStatus(await ctx.state.platform.isDesktop()));
  },
});
