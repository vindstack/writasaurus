import { usePageEffects } from "../lib/use-page-effects.ts";

/** Renders nothing; applies the saved theme and the return-to-editor shortcut. */
export default function PageEffects() {
  usePageEffects();
  return null;
}
