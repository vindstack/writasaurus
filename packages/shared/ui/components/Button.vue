<script setup lang="ts">
withDefaults(
  defineProps<{
    href?: string;
    variant?: "default" | "primary" | "quiet";
    size?: "default" | "small";
    block?: boolean;
    title?: string;
    id?: string;
    disabled?: boolean;
  }>(),
  { variant: "default", size: "default", block: false },
);

defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <a
    v-if="href !== undefined"
    :href="href"
    :class="[
      'button',
      variant === 'primary' && 'button--primary',
      variant === 'quiet' && 'button--quiet',
      size === 'small' && 'button--small',
      block && 'button--block',
    ]"
    :title="title"
    :id="id"
  >
    <slot />
  </a>
  <button
    v-else
    type="button"
    :class="[
      'button',
      variant === 'primary' && 'button--primary',
      variant === 'quiet' && 'button--quiet',
      size === 'small' && 'button--small',
      block && 'button--block',
    ]"
    :title="title"
    :id="id"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>
