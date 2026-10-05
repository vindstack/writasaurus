import styles from "./SegmentedControl.module.css";

interface SegmentedControlProps<T extends string> {
  name: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>(
  { name, value, options, onChange }: SegmentedControlProps<T>,
) {
  return (
    <div class={styles.control} role="group" aria-label={name}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          value={option.value}
          aria-pressed={value === option.value}
          class={styles.option}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
