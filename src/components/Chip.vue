<script setup lang="ts">
import styles from "./Chip.module.css";

withDefaults(defineProps<{ variant?: "default" | "accent" | "outline" }>(), {
  variant: "default",
});
</script>

<template>
  <span :class="[styles.chip, styles[variant]]"><slot /></span>
</template>
