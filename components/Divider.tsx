// @ts-types="../vite-env.d.ts"
import styles from "./Divider.module.css";

export function Divider() {
  return <div class={styles.divider} role="separator" aria-orientation="horizontal" />;
}
