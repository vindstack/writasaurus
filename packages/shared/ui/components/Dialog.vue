<script setup lang="ts">
import { onMounted, ref, watch } from "vue";

const props = defineProps<{ id: string; open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);

function syncOpenState(open: boolean): void {
  if (!dialog.value) return;
  if (open && !dialog.value.open) dialog.value.showModal();
  else if (!open && dialog.value.open) dialog.value.close();
}

watch(() => props.open, syncOpenState);
onMounted(() => syncOpenState(props.open));
</script>

<template>
  <dialog
    ref="dialog"
    :id="id"
    :aria-labelledby="`${id}-title`"
    @close="emit('close')"
  >
    <header class="dialog__header">
      <h2 :id="`${id}-title`">{{ title }}</h2>
      <button
        type="button"
        class="button--quiet button--small"
        aria-label="Close dialog"
        @click="dialog?.close()"
      >
        ×
      </button>
    </header>
    <div class="dialog__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="dialog__footer">
      <slot name="footer" />
    </footer>
  </dialog>
</template>

<style scoped>
.dialog__header,
.dialog__footer {
  align-items: center;
  display: flex;
  gap: var(--space-3);
  justify-content: space-between;
}

.dialog__header h2 {
  font-size: 1.35rem;
}

.dialog__body {
  margin-block: var(--space-4);
}

.dialog__footer {
  justify-content: flex-end;
}
</style>
