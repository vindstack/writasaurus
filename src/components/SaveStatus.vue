<script setup lang="ts">
import styles from "./SaveStatus.module.css";

defineProps<{ status: "saved" | "unsaved" | ""; message: string; id?: string }>();
</script>

<template>
  <span :class="styles.status" :id="id" role="status" aria-live="polite" :data-status="status">
    <span
      v-if="status"
      :class="[styles.indicator, styles[status]]"
      data-indicator
      aria-hidden="true"
    />
    <span>{{ message }}</span>
  </span>
</template>
