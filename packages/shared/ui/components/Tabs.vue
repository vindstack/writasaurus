<script setup lang="ts">
import { nextTick } from "vue";

interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
}

const props = defineProps<{
  id: string;
  label: string;
  tabs: ReadonlyArray<Tab>;
  modelValue: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

function selectTab(index: number): void {
  const tab = props.tabs[index];
  if (!tab || tab.disabled) return;

  emit("update:modelValue", tab.id);
  void nextTick(() => document.getElementById(`${props.id}-tab-${index}`)?.focus());
}

function onKeydown(event: KeyboardEvent, currentIndex: number): void {
  const enabled = props.tabs
    .map((tab, index) => tab.disabled ? -1 : index)
    .filter((index) => index >= 0);
  if (!enabled.length) return;

  let nextIndex: number | undefined;
  if (event.key === "Home") nextIndex = enabled[0];
  else if (event.key === "End") nextIndex = enabled.at(-1);
  else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const position = enabled.indexOf(currentIndex);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    nextIndex = enabled[(position + direction + enabled.length) % enabled.length];
  }
  if (nextIndex === undefined) return;

  event.preventDefault();
  selectTab(nextIndex);
}
</script>

<template>
  <div class="tabs">
    <div class="tab-list" role="tablist" :aria-label="label">
      <button
        v-for="(tab, index) in tabs"
        :id="`${id}-tab-${index}`"
        :key="tab.id"
        type="button"
        class="tab"
        role="tab"
        :aria-selected="modelValue === tab.id"
        :aria-controls="`${id}-panel-${index}`"
        :aria-disabled="tab.disabled || undefined"
        :tabindex="modelValue === tab.id ? 0 : -1"
        @click="selectTab(index)"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      v-for="(tab, index) in tabs"
      v-show="modelValue === tab.id"
      :id="`${id}-panel-${index}`"
      :key="`${tab.id}-panel`"
      class="tab-panel"
      role="tabpanel"
      :aria-labelledby="`${id}-tab-${index}`"
      tabindex="0"
    >
      <slot :name="tab.id" />
    </div>
  </div>
</template>

<style scoped>
.tab-list {
  border-block-end: 1px solid var(--border);
  display: flex;
  gap: var(--space-2);
  overflow-x: auto;
}

.tab {
  background: transparent;
  border: 0;
  border-block-end: 2px solid transparent;
  border-radius: 0;
  color: var(--muted);
  flex: 0 0 auto;
  margin-block-end: -1px;
}

.tab:hover:not(:disabled, [aria-disabled="true"]) {
  background: transparent;
  border-block-end-color: var(--border);
  color: var(--text);
}

.tab[aria-selected="true"] {
  border-block-end-color: var(--accent);
  color: var(--accent-strong);
}

.tab-panel {
  padding-block: var(--space-4);
}
</style>
