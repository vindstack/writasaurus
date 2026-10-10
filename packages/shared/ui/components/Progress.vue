<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<{
  label: string;
  value?: number;
  max?: number;
}>(), { max: 100 });

const maximum = computed(() => Number.isFinite(props.max) && props.max > 0 ? props.max : 100);
const current = computed(() =>
  typeof props.value === "number" && Number.isFinite(props.value)
    ? Math.max(0, Math.min(props.value, maximum.value))
    : undefined
);
</script>

<template>
  <progress
    v-if="current !== undefined"
    class="progress"
    :aria-label="label"
    :value="current"
    :max="maximum"
  />
  <progress
    v-else
    class="progress"
    :aria-label="label"
    :max="maximum"
  />
</template>

<style scoped>
progress.progress {
  appearance: none;
  background: var(--surface-sunken);
  border: 0;
  border-radius: var(--radius-pill);
  height: 0.5rem;
  overflow: hidden;
  width: 100%;
}

progress.progress::-webkit-progress-bar {
  background: var(--surface-sunken);
  border-radius: var(--radius-pill);
}

progress.progress::-webkit-progress-value {
  background: var(--accent);
  border-radius: var(--radius-pill);
}

progress.progress::-moz-progress-bar {
  background: var(--accent);
  border-radius: var(--radius-pill);
}
</style>
