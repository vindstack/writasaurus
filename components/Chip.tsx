import type { ComponentChildren } from "preact";
import styles from "./Chip.module.css";

interface ChipProps {
  children: ComponentChildren;
  variant?: "default" | "accent" | "outline";
  class?: string;
}

export function Chip({ children, variant = "default", class: extra }: ChipProps) {
  const className = [styles.chip, styles[variant], extra].filter(Boolean).join(" ");
  return <span class={className}>{children}</span>;
}
