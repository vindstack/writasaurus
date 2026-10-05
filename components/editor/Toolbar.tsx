import { Tooltip } from "../Tooltip.tsx";
import { runCommand } from "../../lib/editor/surface.ts";
// @ts-types="../../vite-env.d.ts"
import controls from "./controls.module.css";
// @ts-types="../../vite-env.d.ts"
import styles from "./Toolbar.module.css";

const COMMANDS = [
  { command: "bold", tip: "Bold (Ctrl+B)", label: <strong>B</strong> },
  { command: "italic", tip: "Italic (Ctrl+I)", label: <em>I</em> },
  { command: "insertUnorderedList", tip: "Bullet List", label: "List" },
] as const;

export function Toolbar() {
  return (
    <div class={styles.toolbar} role="toolbar" aria-label="Formatting">
      {COMMANDS.map(({ command, tip, label }) => (
        <Tooltip key={command} content={tip} position="bottom">
          <button
            type="button"
            class={`${controls.button} ${controls.small}`}
            data-command={command}
            // Keeps the editor selection while the toolbar is used.
            onMouseDown={(event) =>
              event.preventDefault()}
            onClick={() =>
              runCommand(command)}
          >
            {label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
