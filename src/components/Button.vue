<script setup lang="ts">
import styles from "./Button.module.css";

withDefaults(
  defineProps<{
    href?: string;
    variant?: "default" | "primary";
    block?: boolean;
    title?: string;
    id?: string;
    disabled?: boolean;
  }>(),
  { variant: "default", block: false },
);

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <a
    v-if="href !== undefined"
    :href="href"
    :class="[styles.button, variant === 'primary' && styles.primary, block && styles.block]"
    :title="title"
    :id="id"
  >
    <slot />
  </a>
  <button
    v-else
    type="button"
    :class="[styles.button, variant === 'primary' && styles.primary, block && styles.block]"
    :title="title"
    :id="id"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
