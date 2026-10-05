import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import EditorApp from "../islands/EditorApp.tsx";

export default define.page(async function Editor(ctx) {
  const isDesktop = await ctx.state.platform.isDesktop();
  return (
    <>
      <Head>
        <title>Writasaurus</title>
      </Head>
      <EditorApp isDesktop={isDesktop} />
    </>
  );
});
