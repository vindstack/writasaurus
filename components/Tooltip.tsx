import type { ComponentChildren } from "preact";
import styles from "./Tooltip.module.css";

interface TooltipProps {
  content: string;
  position?: "top" | "bottom";
  children: ComponentChildren;
}

export function Tooltip({ content, position = "top", children }: TooltipProps) {
  return (
    <span class={styles.tooltip}>
      {children}
      <span class={`${styles.bubble} ${styles[position]}`} role="tooltip" aria-hidden="true">
        {content}
      </span>
    </span>
  );
}
