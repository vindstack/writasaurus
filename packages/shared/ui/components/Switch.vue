<script setup lang="ts">
withDefaults(defineProps<{
  id?: string;
  name?: string;
  modelValue: boolean;
  disabled?: boolean;
}>(), { disabled: false });

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <label class="switch">
    <input
      :id="id"
      class="switch__control"
      type="checkbox"
      role="switch"
      :name="name"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.currentTarget as HTMLInputElement).checked)"
    />
    <span class="switch__label"><slot /></span>
  </label>
</template>

<style scoped>
.switch {
  align-items: center;
  display: inline-flex;
  gap: var(--space-2);
  margin: 0;
}

.switch__control {
  appearance: none;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  cursor: pointer;
  flex: 0 0 auto;
  height: 1.35rem;
  margin: 0;
  position: relative;
  transition:
    background-color 140ms ease,
    border-color 140ms ease;
  width: 2.4rem;
}

.switch__control::before {
  background: var(--surface);
  border-radius: 50%;
  content: "";
  height: 0.9rem;
  left: 0.15rem;
  position: absolute;
  top: 0.15rem;
  transition: transform 140ms ease;
  width: 0.9rem;
}

.switch__control:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.switch__control:checked::before {
  transform: translateX(1.05rem);
}

.switch__control:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
