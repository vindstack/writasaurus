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
import SlideoutPanel from "./SlideoutPanel.vue";

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
  <SlideoutPanel
    :open="open"
    side="right"
    label="Writing assistance"
    class="assistancePanel"
    data-testid="assistance-panel"
  >
    <div class="heading">
      <h2>Writing Assistance</h2>
      <button type="button" class="link" @click="closeAssistance()">Close</button>
    </div>
    <p
      class="status"
      role="status"
      aria-live="polite"
      :data-status="status"
    >
      <span v-if="status === 'loading'" class="spinner" aria-hidden="true" />
      {{ statusText() }}
    </p>
    <ol v-if="open && warnings.length > 0" class="list" ref="list">
      <li
        v-for="(warning, index) in warnings.slice(0, MAX_VISIBLE)"
        :key="`${warning.start}:${warning.end}:${warning.kind}`"
        :class="[warningCategory(warning), index === activeIndex && 'active']"
        :data-category="warningCategory(warning)"
        :data-active="String(index === activeIndex)"
      >
        <button
          type="button"
          class="issue"
          data-issue
          :aria-current="index === activeIndex ? 'true' : undefined"
          @click="selectWarning(index)"
        >
          <span class="kind" data-kind>
            {{ warningCategory(warning) === "spelling" ? "Spelling" : warning.kind }}
          </span>
          <span>{{ warning.problem }}: {{ warning.message }}</span>
        </button>
        <div class="actions">
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
  </SlideoutPanel>
</template>

<style scoped>
.assistancePanel {
  align-content: start;
  color: var(--muted);
  font-size: 0.75rem;
  gap: 0.5rem;
  grid-auto-rows: max-content;
}

.heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.heading h2 {
  font:
    700 0.8rem ui-sans-serif,
    system-ui;
  letter-spacing: 0.08em;
  margin: 0;
  text-transform: uppercase;
}

.link {
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-decoration: underline;
}

.status {
  margin: 0;
}

.spinner {
  animation: spin 0.8s linear infinite;
  border: 2px solid var(--border);
  border-radius: 50%;
  border-top-color: currentColor;
  display: inline-block;
  height: 0.8em;
  margin-inline-end: 0.5em;
  vertical-align: -0.1em;
  width: 0.8em;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 3s;
  }
}

.list {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  color: var(--text);
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0.75rem 0.75rem 0.75rem 2rem;
}

.list li {
  border-left: 3px solid var(--border);
  display: grid;
  gap: 0.35rem;
  padding-left: 0.5rem;
}

.list li.spelling {
  border-left-color: var(--danger);
}

.list li.grammar {
  border-left-color: var(--accent);
}

.list li.active {
  background: var(--surface-sunken);
  border-radius: 0 0.3rem 0.3rem 0;
}

.issue {
  background: transparent;
  border: 0;
  border-radius: 0.25rem;
  color: inherit;
  cursor: pointer;
  display: grid;
  font: inherit;
  gap: 0.15rem;
  justify-items: start;
  padding: 0.1rem 0.2rem;
  text-align: left;
  width: 100%;
}

.issue:hover,
.issue:focus-visible {
  background: var(--surface-sunken);
  outline: none;
}

.kind {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.spelling .kind {
  color: var(--danger);
}

.grammar .kind {
  color: var(--accent);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.actions button {
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 0.25rem;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 0.7rem;
  padding: 0.2rem 0.4rem;
}

</style>
