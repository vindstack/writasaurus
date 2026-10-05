<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import {
  addToDictionary,
  assistanceActiveIndex,
  assistanceFocusRequest,
  assistanceOpen,
  assistanceStatus,
  assistanceWarnings,
  closeAssistance,
  ignoreWarning,
  replaceWarning,
  selectWarning,
  warningCategory,
} from "../../lib/editor/assistance-state.ts";
import { useSignalValue } from "../vue-signals.ts";
import styles from "./AssistancePanel.module.css";

const MAX_VISIBLE = 10;
const open = useSignalValue(assistanceOpen);
const status = useSignalValue(assistanceStatus);
const warnings = useSignalValue(assistanceWarnings);
const activeIndex = useSignalValue(assistanceActiveIndex);
const focusRequest = useSignalValue(assistanceFocusRequest);
const list = ref<HTMLOListElement | null>(null);
let stopFocusWatch: (() => void) | undefined;

function statusText(): string {
  const count = warnings.value.length;
  if (status.value === "loading") return "Writing assistance: loading...";
  if (status.value === "unavailable") return "Writing assistance is unavailable.";
  if (status.value !== "ready") return "Writing assistance: open to check this chapter";
  return count
    ? `Writing assistance: ${count} ${count === 1 ? "issue" : "issues"}`
    : "Writing assistance: no issues";
}

onMounted(() => {
  stopFocusWatch = watch(focusRequest, (request) => {
    if (request > 0) list.value?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  });
});
onUnmounted(() => stopFocusWatch?.());
</script>

<template>
  <aside
    :class="[styles.panel, !open && styles.collapsed]"
    aria-label="Writing assistance"
    :data-collapsed="String(!open)"
    data-testid="assistance-panel"
  >
    <div :class="styles.heading">
      <h2>Writing Assistance</h2>
      <button type="button" :class="styles.link" @click="closeAssistance()">Close</button>
    </div>
    <p
      :class="styles.status"
      role="status"
      aria-live="polite"
      :data-status="status"
    >
      <span v-if="status === 'loading'" :class="styles.spinner" aria-hidden="true" />
      {{ statusText() }}
    </p>
    <ol v-if="open && warnings.length > 0" :class="styles.list" ref="list">
      <li
        v-for="(warning, index) in warnings.slice(0, MAX_VISIBLE)"
        :key="`${warning.start}:${warning.end}:${warning.kind}`"
        :class="[styles[warningCategory(warning)], index === activeIndex && styles.active]"
        :data-category="warningCategory(warning)"
        :data-active="String(index === activeIndex)"
      >
        <button
          type="button"
          :class="styles.issue"
          data-issue
          :aria-current="index === activeIndex ? 'true' : undefined"
          @click="selectWarning(index)"
        >
          <span :class="styles.kind" data-kind>
            {{ warningCategory(warning) === "spelling" ? "Spelling" : warning.kind }}
          </span>
          <span>{{ warning.problem }}: {{ warning.message }}</span>
        </button>
        <div :class="styles.actions">
          <button
            v-if="warning.suggestions[0]"
            type="button"
            @click="replaceWarning(warning)"
          >
            Replace with “{{ warning.suggestions[0] }}”
          </button>
          <button
            v-if="warningCategory(warning) === 'spelling'"
            type="button"
            @click="addToDictionary(warning)"
          >
            Add to dictionary
          </button>
          <button v-else type="button" @click="ignoreWarning(warning)">Ignore</button>
        </div>
      </li>
    </ol>
  </aside>
</template>
