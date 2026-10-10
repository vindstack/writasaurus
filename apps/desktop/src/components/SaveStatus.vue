<script setup lang="ts">

defineProps<{ status: "saved" | "unsaved" | ""; message: string; id?: string }>();
</script>

<template>
  <span class="status" :id="id" role="status" aria-live="polite" :data-status="status">
    <span
      v-if="status"
      :class="['indicator', status]"
      data-indicator
      aria-hidden="true"
    />
    <span>{{ message }}</span>
  </span>
</template>

<style scoped>
.status {
  align-items: center;
  color: inherit;
  display: inline-flex;
  font-size: inherit;
  line-height: inherit;
  white-space: nowrap;
}

.indicator {
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
  height: 0.45rem;
  margin-right: 0.35rem;
  width: 0.45rem;
}

.saved {
  background-color: #86c9a3;
}

.unsaved {
  background-color: #e6a6c7;
}
</style>
