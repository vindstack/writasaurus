import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { CardPage } from "../components/CardPage.tsx";
import WelcomeActions from "../islands/WelcomeActions.tsx";

export default define.page(async function Welcome(ctx) {
  const isDesktop = await ctx.state.platform.isDesktop();
  return (
    <>
      <Head>
        <title>Open Manuscript — Writasaurus</title>
      </Head>
      <CardPage size="narrow" brandHref="/about" roomy>
        <h2>Open Manuscript</h2>
        <p>Open an EPUB manuscript or begin with a blank document.</p>
        <WelcomeActions isDesktop={isDesktop} />
      </CardPage>
    </>
  );
});
