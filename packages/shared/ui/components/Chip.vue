<script setup lang="ts">
withDefaults(defineProps<{ variant?: "default" | "accent" | "outline" }>(), {
  variant: "default",
});
</script>

<template>
  <span :class="['chip', variant]"><slot /></span>
</template>

<style scoped>
.chip {
  user-select: none;
}

.outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
}

.accent {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-text);
}
</style>
