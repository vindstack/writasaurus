<script setup lang="ts">
import styles from "./Tooltip.module.css";

withDefaults(defineProps<{ content: string; position?: "top" | "bottom" }>(), {
  position: "top",
});
</script>

<template>
  <span :class="styles.tooltip">
    <slot />
    <span :class="[styles.bubble, styles[position]]" role="tooltip" aria-hidden="true">
      {{ content }}
    </span>
  </span>
</template>
