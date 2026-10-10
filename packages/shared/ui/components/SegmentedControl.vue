<script setup lang="ts">
defineProps<{
  name: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}>();

const emit = defineEmits<{ change: [value: string] }>();
</script>

<template>
  <div class="control" role="group" :aria-label="name">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :value="option.value"
      :aria-pressed="value === option.value"
      class="option"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.control {
  align-items: stretch;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  display: flex;
  flex: 1;
  gap: 1px;
  overflow: hidden;
  padding: 0.15rem;
  width: 100%;
}

.option {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: calc(var(--radius-control) - 0.15rem);
  color: var(--text);
  display: flex;
  flex: 1;
  font: inherit;
  font-size: 0.85rem;
  gap: 0.35rem;
  justify-content: center;
  min-height: 1.6rem;
  padding: 0.25rem 0.5rem;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  white-space: nowrap;
}

.option:hover:not(:disabled):not([aria-pressed="true"]) {
  background: var(--surface);
}

.option[aria-pressed="true"] {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--accent-strong);
  font-weight: 600;
}

.option:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
</style>
