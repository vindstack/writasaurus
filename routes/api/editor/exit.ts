import { define } from "../../../utils.ts";

export const handler = define.handlers({
  async POST(ctx) {
    const { isDesktop, exit } = ctx.state.platform;
    if (await isDesktop()) setTimeout(exit, 50);
    return Response.json({ ok: true });
  },
});
