import { useEffect, useRef } from "preact/hooks";
import {
  addToDictionary,
  assistanceActiveIndex,
  assistanceFocusRequest,
  assistanceOpen,
  assistanceStatus,
  assistanceWarnings,
  closeAssistance,
  ignoreWarning,
  replaceWarning,
  selectWarning,
  warningCategory,
} from "../../lib/editor/assistance-state.ts";
import styles from "./AssistancePanel.module.css";

const MAX_VISIBLE = 10;

function statusText(): string {
  const status = assistanceStatus.value;
  const count = assistanceWarnings.value.length;
  if (status === "loading") return "Writing assistance: loading...";
  if (status === "unavailable") return "Writing assistance is unavailable.";
  if (status !== "ready") return "Writing assistance: open to check this chapter";
  return count
    ? `Writing assistance: ${count} ${count === 1 ? "issue" : "issues"}`
    : "Writing assistance: no issues";
}

export function AssistancePanel() {
  const open = assistanceOpen.value;
  const warnings = assistanceWarnings.value;
  const active = assistanceActiveIndex.value;
  const list = useRef<HTMLOListElement>(null);
  const focusRequest = assistanceFocusRequest.value;

  useEffect(() => {
    if (focusRequest > 0) {
      list.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    }
  }, [focusRequest]);

  return (
    <aside
      class={`${styles.panel} ${open ? "" : styles.collapsed}`}
      aria-label="Writing assistance"
      data-collapsed={String(!open)}
      data-testid="assistance-panel"
    >
      <div class={styles.heading}>
        <h2>Writing Assistance</h2>
        <button type="button" class={styles.link} onClick={() => void closeAssistance()}>
          Close
        </button>
      </div>
      <p class={styles.status} role="status" aria-live="polite">{statusText()}</p>
      {open && warnings.length > 0 && (
        <ol class={styles.list} ref={list}>
          {warnings.slice(0, MAX_VISIBLE).map((warning, index) => {
            const category = warningCategory(warning);
            const suggestion = warning.suggestions[0];
            return (
              <li
                key={`${warning.start}:${warning.end}:${warning.kind}`}
                class={`${styles[category]} ${index === active ? styles.active : ""}`}
                data-category={category}
                data-active={String(index === active)}
              >
                <button
                  type="button"
                  class={styles.issue}
                  data-issue
                  aria-current={index === active ? "true" : undefined}
                  onClick={() => void selectWarning(index)}
                >
                  <span class={styles.kind} data-kind>
                    {category === "spelling" ? "Spelling" : warning.kind}
                  </span>
                  <span>{warning.problem}: {warning.message}</span>
                </button>
                <div class={styles.actions}>
                  {suggestion && (
                    <button type="button" onClick={() => void replaceWarning(warning)}>
                      Replace with “{suggestion}”
                    </button>
                  )}
                  {category === "spelling"
                    ? (
                      <button type="button" onClick={() => void addToDictionary(warning)}>
                        Add to dictionary
                      </button>
                    )
                    : (
                      <button type="button" onClick={() => void ignoreWarning(warning)}>
                        Ignore
                      </button>
                    )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
