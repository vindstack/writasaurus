import type { ComponentChildren } from "preact";
import styles from "./Button.module.css";

interface ButtonProps {
  children: ComponentChildren;
  /** Renders a link styled as a button. */
  href?: string;
  variant?: "default" | "primary";
  block?: boolean;
  class?: string;
  title?: string;
  id?: string;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
}

export function Button(props: ButtonProps) {
  const { children, href, variant = "default", block, class: extra, ...rest } = props;
  const className = [
    styles.button,
    variant === "primary" && styles.primary,
    block && styles.block,
    extra,
  ].filter(Boolean).join(" ");

  if (href !== undefined) {
    return (
      <a href={href} class={className} title={rest.title} id={rest.id}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" class={className} {...rest}>
      {children}
    </button>
  );
}
