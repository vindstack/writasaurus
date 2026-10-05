<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  applyThemePreference,
  getThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "../../lib/settings.ts";
import SegmentedControl from "../SegmentedControl.vue";
import styles from "./ThemeSwitcher.module.css";

const options = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "System" },
] as const;
const theme = ref<ThemePreference>("auto");

onMounted(() => {
  theme.value = getThemePreference();
  applyThemePreference(theme.value);
});

function changeTheme(next: string): void {
  const preference = next as ThemePreference;
  saveThemePreference(preference);
  applyThemePreference(preference);
  theme.value = preference;
}
</script>

<template>
  <div :class="styles.switcher">
    <SegmentedControl
      name="Color theme"
      :value="theme"
      :options="options"
      @change="changeTheme"
    />
  </div>
</template>
