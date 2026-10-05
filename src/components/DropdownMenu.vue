<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import styles from "./DropdownMenu.module.css";

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
  <div :class="styles.root" :id="id" ref="root" :data-open="String(open)">
    <div :class="styles.trigger" @click="emit('open-change', !open)">
      <slot name="trigger" />
    </div>
    <div
      :class="[styles.popover, styles[placement], open && styles.open]"
      role="menu"
      @click="onMenuClick"
    >
      <slot />
    </div>
  </div>
</template>
