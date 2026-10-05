import type { ComponentChildren } from "preact";
// @ts-types="../vite-env.d.ts"
import styles from "./CardPage.module.css";

interface CardPageProps {
  children: ComponentChildren;
  size: "narrow" | "medium" | "wide";
  /** Where the brand links to; omitted for a plain, non-interactive brand. */
  brandHref?: string;
  /** Uses larger spacing between the card's sections. */
  roomy?: boolean;
  /** Applies comfortable paragraph spacing for reading copy. */
  prose?: boolean;
}

/** Centered card layout shared by the about, welcome, and settings pages. */
export function CardPage({ children, size, brandHref, roomy, prose }: CardPageProps) {
  return (
    <div class={styles.page}>
      <div class={`${styles.container} ${styles[size]}`}>
        <header class={styles.header}>
          {brandHref
            ? <a class={styles.brand} href={brandHref}>Writasaurus</a>
            : <span class={styles.brand}>Writasaurus</span>}
        </header>
        <main>
          <section
            class={[styles.card, roomy && styles.roomy, prose && styles.prose]
              .filter(Boolean).join(" ")}
          >
            {children}
          </section>
        </main>
      </div>
    </div>
  );
}
