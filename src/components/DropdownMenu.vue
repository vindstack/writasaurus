<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{
  id?: string;
  open: boolean;
  placement?: "bottom-start" | "bottom-end";
}>(), { placement: "bottom-start" });
const emit = defineEmits<{ "open-change": [open: boolean] }>();
const root = ref<HTMLDivElement | null>(null);

function onDocumentClick(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node | null)) emit("open-change", false);
}

function onMenuClick(event: MouseEvent): void {
  const item = (event.target as HTMLElement).closest('[role^="menuitem"]');
  if (
    item && !item.hasAttribute("data-keep-open") && item.getAttribute("aria-haspopup") !== "true"
  ) emit("open-change", false);
}

watch(() => props.open, (open) => {
  if (open) document.addEventListener("click", onDocumentClick);
  else document.removeEventListener("click", onDocumentClick);
});
onMounted(() => {
  if (props.open) document.addEventListener("click", onDocumentClick);
});
onUnmounted(() => document.removeEventListener("click", onDocumentClick));
</script>

<template>
  <div class="root" :id="id" ref="root" :data-open="String(open)">
    <div class="trigger" @click="emit('open-change', !open)">
      <slot name="trigger" />
    </div>
    <div
      :class="['popover', placement, open && 'open']"
      role="menu"
      @click="onMenuClick"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.root {
  display: inline-flex;
  position: relative;
}

.trigger {
  cursor: pointer;
  display: inline-flex;
}

.popover {
  display: none;
  margin-top: 4px;
  position: absolute;
  top: 100%;
  z-index: 1000;
}

.open {
  animation: dropdown-menu-enter 0.15s ease-out;
  display: block;
}

.bottom-start {
  left: 0;
}

.bottom-end {
  right: 0;
}

@keyframes dropdown-menu-enter {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
