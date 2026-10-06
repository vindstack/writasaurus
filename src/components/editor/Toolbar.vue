<script setup lang="ts">
import { runCommand } from "../../lib/editor/surface.ts";
import Button from "../Button.vue";
import Tooltip from "../Tooltip.vue";

const commands = [
  { command: "bold", tip: "Bold (Ctrl+B)", label: "B" },
  { command: "italic", tip: "Italic (Ctrl+I)", label: "I" },
  { command: "insertUnorderedList", tip: "Bullet List", label: "List" },
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
        variant="editor"
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
  </div>
</template>

<style scoped>
.toolbar {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  gap: 0.35rem;
}

@media (max-width: 36rem) {
  .toolbar {
    display: none;
  }
}

</style>
