<script setup lang="ts">
import { runCommand } from "../../lib/editor/surface.ts";
import controls from "./controls.module.css";
import styles from "./Toolbar.module.css";
import Tooltip from "../Tooltip.vue";

const commands = [
  { command: "bold", tip: "Bold (Ctrl+B)", label: "B" },
  { command: "italic", tip: "Italic (Ctrl+I)", label: "I" },
  { command: "insertUnorderedList", tip: "Bullet List", label: "List" },
] as const;
</script>

<template>
  <div :class="styles.toolbar" role="toolbar" aria-label="Formatting">
    <Tooltip
      v-for="{ command, tip, label } in commands"
      :key="command"
      :content="tip"
      position="bottom"
    >
      <button
        type="button"
        :class="[controls.button, controls.small]"
        :data-command="command"
        @mousedown.prevent
        @click="runCommand(command)"
      >
        <strong v-if="command === 'bold'">{{ label }}</strong>
        <em v-else-if="command === 'italic'">{{ label }}</em>
        <template v-else>{{ label }}</template>
      </button>
    </Tooltip>
  </div>
</template>
