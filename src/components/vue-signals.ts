import { customRef, onScopeDispose, type Ref } from "vue";

interface SignalLike<T> {
  value: T;
  subscribe(callback: () => void): () => void;
}

export function useSignalValue<T>(source: SignalLike<T>): Ref<T> {
  return customRef<T>((track, trigger) => {
    const unsubscribe = source.subscribe(trigger);
    onScopeDispose(unsubscribe);
    return {
      get() {
        track();
        return source.value;
      },
      set(value) {
        source.value = value;
      },
    };
  });
}
