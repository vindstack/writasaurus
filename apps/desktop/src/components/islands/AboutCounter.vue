<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "../../../../../packages/shared/ui/components/Button.vue";

const props = withDefaults(defineProps<{ name?: string; lastName?: string }>(), {
  name: "John",
  lastName: "Smith",
});
const count = ref(0);
const fullName = computed(() => `${props.name} ${props.lastName}`);
</script>

<template>
  <div>
    <p>Hello, {{ fullName }}!</p>
    <p>Count: {{ count }}</p>
    <Button variant="primary" @click="count++">Increment</Button>
    <p v-if="count >= 10">You've reached 10!</p>
    <p>Hello, world!</p>
  </div>
</template>
