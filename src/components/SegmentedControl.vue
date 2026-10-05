<script setup lang="ts">
import styles from "./SegmentedControl.module.css";

defineProps<{
  name: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}>();

const emit = defineEmits<{ change: [value: string] }>();
</script>

<template>
  <div :class="styles.control" role="group" :aria-label="name">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :value="option.value"
      :aria-pressed="value === option.value"
      :class="styles.option"
      @click="emit('change', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
