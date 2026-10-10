<script setup lang="ts">
withDefaults(defineProps<{
  id?: string;
  name?: string;
  modelValue: boolean;
  disabled?: boolean;
  required?: boolean;
}>(), { disabled: false, required: false });

const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <label class="checkbox">
    <input
      :id="id"
      type="checkbox"
      :name="name"
      :checked="modelValue"
      :disabled="disabled"
      :required="required"
      @change="emit('update:modelValue', ($event.currentTarget as HTMLInputElement).checked)"
    />
    <span><slot /></span>
  </label>
</template>

<style scoped>
.checkbox {
  align-items: center;
  display: inline-flex;
  gap: var(--space-2);
  margin: 0;
}
</style>
