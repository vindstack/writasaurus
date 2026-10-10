<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  id: string;
  label: string;
  hint?: string;
  error?: string;
}>();

const describedBy = computed(() =>
  [
    props.hint ? `${props.id}-hint` : undefined,
    props.error ? `${props.id}-error` : undefined,
  ].filter(Boolean).join(" ") || undefined
);
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <slot :id="id" :described-by="describedBy" />
    <small v-if="hint" :id="`${id}-hint`" class="muted">{{ hint }}</small>
    <small v-if="error" :id="`${id}-error`" class="error" role="alert">{{ error }}</small>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: var(--space-1);
}

.error {
  color: var(--danger);
}
</style>
