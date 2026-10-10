<script setup lang="ts">
import { ref } from "vue";
import { runCommand } from "../../lib/editor/surface.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Tooltip from "../../../../../packages/shared/ui/components/Tooltip.vue";
import DropdownMenu from "../../../../../packages/shared/ui/components/DropdownMenu.vue";

const commands = [
  { command: "bold", tip: "Bold (Ctrl+B)", label: "B" },
  { command: "italic", tip: "Italic (Ctrl+I)", label: "I" },
  { command: "insertUnorderedList", tip: "Bullet List", label: "List" },
] as const;
const headingMenuOpen = ref(false);
const textStyles = [
  { label: "Normal text", value: "<p>" },
  { label: "Heading 1", value: "<h1>" },
  { label: "Heading 2", value: "<h2>" },
  { label: "Heading 3", value: "<h3>" },
] as const;
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Formatting">
    <Tooltip
      v-for="{ command, tip, label } in commands"
      :key="command"
      :content="tip"
      position="bottom"
    >
      <Button
        variant="quiet"
        size="small"
        :data-command="command"
        @mousedown.prevent
        @click="runCommand(command)"
      >
        <strong v-if="command === 'bold'">{{ label }}</strong>
        <em v-else-if="command === 'italic'">{{ label }}</em>
        <template v-else>{{ label }}</template>
      </Button>
    </Tooltip>
    <DropdownMenu
      placement="bottom-start"
      :open="headingMenuOpen"
      @open-change="headingMenuOpen = $event"
    >
      <template #trigger>
        <Button
          variant="quiet"
          size="small"
          aria-haspopup="true"
          :aria-expanded="headingMenuOpen"
          title="Text style"
          @mousedown.prevent
        >
          Heading
        </Button>
      </template>
      <div class="styleMenu">
        <button
          v-for="{ label, value } in textStyles"
          :key="value"
          type="button"
          role="menuitem"
          class="styleItem"
          @mousedown.prevent
          @click="runCommand('formatBlock', value)"
        >
          {{ label }}
        </button>
      </div>
    </DropdownMenu>
  </div>
</template>

<style scoped>
.toolbar {
  align-items: center;
  background: color-mix(in srgb, var(--surface-sunken) 35%, var(--surface));
  border-bottom: 1px solid var(--border);
  box-sizing: border-box;
  display: flex;
  flex: 0 0 auto;
  font-size: 0.75rem;
  gap: 0.35rem;
  height: 2.4rem;
  min-width: 0;
  padding: 0.25rem 1rem;
  position: relative;
  z-index: 40;
}

.styleMenu {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  box-shadow:
    0 10px 25px -5px rgba(0, 0, 0, 0.2),
    0 8px 10px -6px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  min-width: 13rem;
  padding: 0.35rem;
}

.styleItem {
  background: transparent;
  border: 0;
  border-radius: 0.35rem;
  box-sizing: border-box;
  color: var(--text);
  cursor: pointer;
  display: flex;
  font: inherit;
  font-size: 0.9rem;
  justify-content: flex-start;
  min-height: 2.2rem;
  padding: 0.45rem 0.85rem;
  text-align: left;
  white-space: nowrap;
  width: 100%;
}

.styleItem:hover,
.styleItem:focus-visible {
  background: var(--surface-sunken);
  color: var(--text);
  outline: none;
}
</style>
