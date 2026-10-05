import styles from "./SaveStatus.module.css";

interface SaveStatusProps {
  status: "saved" | "unsaved" | "";
  message: string;
  id?: string;
}

export function SaveStatus({ status, message, id }: SaveStatusProps) {
  return (
    <span class={styles.status} id={id} role="status" aria-live="polite" data-status={status}>
      {status && (
        <span
          class={`${styles.indicator} ${styles[status]}`}
          data-indicator
          aria-hidden="true"
        />
      )}
      <span>{message}</span>
    </span>
  );
}
