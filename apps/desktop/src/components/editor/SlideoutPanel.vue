<script setup lang="ts">
defineProps<{
  open: boolean;
  side: "left" | "right";
  label: string;
}>();
</script>

<template>
  <aside
    :class="['slideoutPanel', `slideoutPanel--${side}`, !open && 'collapsed']"
    :aria-label="label"
    :data-collapsed="String(!open)"
  >
    <slot />
  </aside>
</template>

<style scoped>
.slideoutPanel {
  background: var(--surface);
  box-sizing: border-box;
  display: grid;
  flex: 0 0 19rem;
  min-width: 19rem;
  overflow-y: auto;
  padding: 0.5rem;
  transition:
    margin 0.2s,
    transform 0.2s;
  width: 19rem;
}

.slideoutPanel--left {
  border-right: 1px solid var(--border);
}

.slideoutPanel--right {
  border-left: 1px solid var(--border);
}

.collapsed.slideoutPanel--left {
  margin-left: -19rem;
}

.collapsed.slideoutPanel--right {
  margin-right: -19rem;
}

@media (max-width: 55rem) {
  .slideoutPanel {
    bottom: 0;
    min-width: 0;
    position: absolute;
    top: 0;
    width: min(19rem, 88vw);
    z-index: 10;
  }

  .slideoutPanel--left {
    left: 0;
    margin-left: 0;
  }

  .slideoutPanel--right {
    margin-right: 0;
    right: 0;
  }

  .collapsed.slideoutPanel--left {
    margin-left: 0;
    transform: translateX(-100%);
  }

  .collapsed.slideoutPanel--right {
    margin-right: 0;
    transform: translateX(100%);
  }
}
</style>
