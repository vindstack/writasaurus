<script setup lang="ts">
import { onUnmounted, watch } from "vue";

const props = withDefaults(defineProps<{
  open: boolean;
  message: string;
  variant?: "info" | "success" | "warning" | "danger";
  duration?: number;
}>(), { variant: "info", duration: 4000 });

const emit = defineEmits<{ close: [] }>();
let timer: ReturnType<typeof setTimeout> | undefined;

watch(() => props.open, (open) => {
  clearTimeout(timer);
  timer = undefined;
  if (open && props.duration > 0) {
    timer = setTimeout(() => {
      timer = undefined;
      emit("close");
    }, props.duration);
  }
}, { immediate: true });

onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <div
    v-if="open"
    :class="['alert', 'toast', variant !== 'info' && `alert--${variant}`]"
    :role="variant === 'danger' ? 'alert' : 'status'"
    :aria-live="variant === 'danger' ? 'assertive' : 'polite'"
  >
    <span class="toast__message">{{ message }}</span>
    <button
      type="button"
      class="button--quiet button--small"
      aria-label="Dismiss notification"
      @click="emit('close')"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
.toast {
  align-items: center;
  bottom: var(--space-4);
  box-shadow: var(--shadow-md);
  display: flex;
  gap: var(--space-3);
  inset-inline-end: var(--space-4);
  justify-content: space-between;
  max-width: min(28rem, calc(100vw - 2rem));
  position: fixed;
  z-index: 1100;
}

.toast__message {
  flex: 1;
}
</style>
