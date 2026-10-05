import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
// @ts-types="../vite-env.d.ts"
import styles from "./DropdownMenu.module.css";

interface DropdownMenuProps {
  id?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: "bottom-start" | "bottom-end";
  trigger: ComponentChildren;
  children: ComponentChildren;
}

/** A menu popover. Items close it on click unless they carry `data-keep-open`. */
export function DropdownMenu(
  { id, open, onOpenChange, placement = "bottom-start", trigger, children }: DropdownMenuProps,
) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node | null)) onOpenChange(false);
    };
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, [open, onOpenChange]);

  function onMenuClick(event: MouseEvent): void {
    const item = (event.target as HTMLElement).closest('[role^="menuitem"]');
    if (
      item && !item.hasAttribute("data-keep-open") && item.getAttribute("aria-haspopup") !== "true"
    ) {
      onOpenChange(false);
    }
  }

  return (
    <div class={styles.root} id={id} ref={root} data-open={String(open)}>
      <div class={styles.trigger} onClick={() => onOpenChange(!open)}>{trigger}</div>
      <div
        class={`${styles.popover} ${styles[placement]} ${open ? styles.open : ""}`}
        role="menu"
        onClick={onMenuClick}
      >
        {children}
      </div>
    </div>
  );
}
