import { Button } from "../components/Button.tsx";
import { useComputed, useSignal } from "@preact/signals";

interface AboutCounterProps {
  name?: string;
  lastName?: string;
}

export default function AboutCounter({ name = "John", lastName = "Smith" }: AboutCounterProps) {
  const count = useSignal(0);
  const fullName = useComputed(() => `${name} ${lastName}`);

  return (
    <div>
      <p>Hello, {fullName}!</p>
      <p>Count: {count}</p>
      <Button variant="primary" onClick={() => count.value++}>Increment</Button>
      {count.value >= 10 && <p>You've reached 10!</p>}
      <p>Hello, world!</p>
    </div>
  );
}
