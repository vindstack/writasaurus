<script setup lang="ts">

withDefaults(
  defineProps<{
    href?: string;
      variant?: "default" | "primary" | "editor";
      size?: "default" | "small";
      block?: boolean;
      title?: string;
      id?: string;
      disabled?: boolean;
    }>(),
    { variant: "default", size: "default", block: false },
);

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <a
    v-if="href !== undefined"
    :href="href"
    :class="[
      'button',
      variant === 'primary' && 'primary',
      variant === 'editor' && 'editor',
      size === 'small' && 'small',
      block && 'block',
    ]"
    :title="title"
    :id="id"
  >
    <slot />
  </a>
  <button
    v-else
    type="button"
    :class="[
      'button',
      variant === 'primary' && 'primary',
      variant === 'editor' && 'editor',
      size === 'small' && 'small',
      block && 'block',
    ]"
    :title="title"
    :id="id"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  color: var(--text);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  justify-content: center;
  padding: 0.6rem 1rem;
  text-decoration: none;
  transition:
    background-color 0.12s ease,
    transform 0.06s ease,
    filter 0.12s ease,
    opacity 0.12s ease,
    box-shadow 0.06s ease;
  user-select: none;
}

.primary {
  background: var(--accent);
  color: var(--accent-text);
}

.editor {
  background: transparent;
  border-radius: var(--radius-control);
  min-height: 2.25rem;
  padding: 0.35rem 0.6rem;
  white-space: nowrap;
}

.small {
  border-radius: var(--radius-control);
  font-size: 0.72rem;
  gap: 0.35rem;
  min-height: 1.6rem;
  padding: 0.2rem 0.5rem;
}

.block {
  font-size: 0.95rem;
  padding: 0.75rem 1rem;
  text-align: center;
  width: 100%;
}

.button:active:not(:disabled) {
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.18);
  transform: translateY(1px) scale(0.98);
}

.editor:active:not(:disabled) {
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15);
}

.button:active:not(.primary):not(:disabled) {
  background: var(--surface-sunken);
}

.primary:active:not(:disabled) {
  filter: brightness(0.85);
}

.button:disabled {
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
}
</style>
