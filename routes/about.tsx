import { Head } from "fresh/runtime";
import { define } from "../utils.ts";
import { Button } from "../components/Button.tsx";
import { CardPage } from "../components/CardPage.tsx";
import AboutCounter from "../islands/AboutCounter.tsx";
import PageEffects from "../islands/PageEffects.tsx";

export default define.page(function About() {
  return (
    <>
      <Head>
        <title>About — Writasaurus</title>
      </Head>
      <PageEffects />
      <CardPage size="medium" prose>
        <h2>About Writasaurus</h2>
        <AboutCounter />
        <p>
          Writasaurus is a local-first manuscript editor designed for focused long-form writing.
          Organize your chapters, track word counts in real time, and save directly to your device
          using plain markdown files.
        </p>
        <p>
          Built with Deno, Writasaurus works seamlessly in your browser and as a lightweight desktop
          application. Your writing stays entirely in your control—stored locally with automatic
          saving and flexible export options.
        </p>
        <div>
          <Button href="/" variant="primary" title="Return to Editor (Ctrl+Shift+E)">
            ← Return to Editor
          </Button>
        </div>
      </CardPage>
    </>
  );
});
