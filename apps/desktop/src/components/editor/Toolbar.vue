<script setup lang="ts">
import { ref } from "vue";
import { editorMode, replaceOutline } from "../../lib/editor/state.ts";
import { runCommand, mountContent } from "../../lib/editor/surface.ts";
import { markdownToHtml } from "../../lib/utilties/markdown-utilities.ts";
import { OUTLINE_TEMPLATES } from "../../lib/editor/outline-templates.ts";
import { editorHistory } from "../../lib/editor/history.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Tooltip from "../../../../../packages/shared/ui/components/Tooltip.vue";
import DropdownMenu from "../../../../../packages/shared/ui/components/DropdownMenu.vue";
import Dialog from "../../../../../packages/shared/ui/components/Dialog.vue";
import { useSignalValue } from "../vue-signals.ts";

const commands = [
  { command: "bold", tip: "Bold (Ctrl+B)", label: "B" },
  { command: "italic", tip: "Italic (Ctrl+I)", label: "I" },
  { command: "insertUnorderedList", tip: "Bullet List", label: "List" },
] as const;
const headingMenuOpen = ref(false);
const templateMenuOpen = ref(false);
const templateConfirmationOpen = ref(false);
const selectedTemplate = ref<(typeof OUTLINE_TEMPLATES)[number] | null>(null);
const modeState = useSignalValue(editorMode);
const textStyles = [
  { label: "Normal text", value: "<p>" },
  { label: "Heading 1", value: "<h1>" },
  { label: "Heading 2", value: "<h2>" },
  { label: "Heading 3", value: "<h3>" },
] as const;

function confirmTemplate(template: (typeof OUTLINE_TEMPLATES)[number]): void {
  selectedTemplate.value = template;
  templateConfirmationOpen.value = true;
}

function cancelTemplate(): void {
  templateConfirmationOpen.value = false;
  selectedTemplate.value = null;
}

function applyTemplate(): void {
  const template = selectedTemplate.value;
  if (!template) return;
  replaceOutline(template.content, true);
  mountContent(markdownToHtml(template.content));
  editorHistory.clear();
  cancelTemplate();
}
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Formatting">
    <div class="toolbarContent">
      <Tooltip v-for="{ command, tip, label } in commands" :key="command" :content="tip" position="bottom">
        <Button variant="quiet" size="small" :data-command="command" @mousedown.prevent @click="runCommand(command)">
          <strong v-if="command === 'bold'">{{ label }}</strong>
          <em v-else-if="command === 'italic'">{{ label }}</em>
          <template v-else>{{ label }}</template>
        </Button>
      </Tooltip>
      <DropdownMenu placement="bottom-start" :open="headingMenuOpen" @open-change="headingMenuOpen = $event">
        <template #trigger>
          <Button variant="quiet" size="small" aria-haspopup="true" :aria-expanded="headingMenuOpen" title="Text style"
            @mousedown.prevent>
            Heading
          </Button>
        </template>
        <div class="styleMenu">
          <button v-for="{ label, value } in textStyles" :key="value" type="button" role="menuitem" class="styleItem"
            @mousedown.prevent @click="runCommand('formatBlock', value)">
            {{ label }}
          </button>
        </div>
      </DropdownMenu>
      <DropdownMenu v-if="modeState === 'outline'" id="outline-template-menu" class="templateSelector"
        placement="bottom-end" :open="templateMenuOpen" @open-change="templateMenuOpen = $event">
        <template #trigger>
          <Button variant="quiet" size="small" aria-haspopup="menu" :aria-expanded="templateMenuOpen"
            data-outline-template-trigger>
            Change Template
          </Button>
        </template>
        <div class="styleMenu">
          <button v-for="template in OUTLINE_TEMPLATES" :key="template.id" type="button" role="menuitem" class="styleItem"
            :data-outline-template="template.id" @click="confirmTemplate(template)">
            {{ template.label }}
          </button>
        </div>
      </DropdownMenu>
      <Dialog id="outline-template-confirmation" title="Replace outline content?" :open="templateConfirmationOpen"
        @close="cancelTemplate">
        <p>
          Apply {{ selectedTemplate?.label }}? This will replace all current outline content.
        </p>
        <template #footer>
          <Button variant="quiet" size="small" @click="cancelTemplate">Cancel</Button>
          <Button variant="primary" data-confirm-template @click="applyTemplate">
            Replace outline
          </Button>
        </template>
      </Dialog>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  background: color-mix(in srgb, var(--surface-sunken) 35%, var(--surface));
  border-bottom: 1px solid var(--border);
  box-sizing: border-box;
  flex: 0 0 auto;
  height: 2.4rem;
  min-width: 0;
  position: relative;
  z-index: 40;
  width: 100%;
}

.toolbarContent {
  align-items: center;
  box-sizing: border-box;
  display: flex;
  font-size: 0.75rem;
  gap: 0.35rem;
  height: 100%;
  margin-inline: auto;
  max-width: 33rem;
  min-width: 0;
  padding: 0.25rem 0;
  width: calc(100% - 3rem);
}

.templateSelector {
  margin-left: auto;
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

@media (max-width: 55rem) {
  .toolbarContent {
    max-width: none;
    width: calc(100% - 2rem);
  }
}

@media (max-width: 36rem) {
  .toolbarContent {
    width: calc(100% - 1.5rem);
  }
}
</style>
