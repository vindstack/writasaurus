<script setup lang="ts">
import { onMounted, ref } from "vue";
import { isReleaseManifest, type ReleaseManifest } from "../../lib/releases.ts";
import styles from "./DownloadConsent.module.css";

const accepted = ref(false);
const loading = ref(true);
const errorMessage = ref("");
const release = ref<ReleaseManifest | null>(null);
const platforms = [
  { id: "linux", label: "Linux" },
  { id: "macos", label: "macOS" },
  { id: "windows", label: "Windows" },
] as const;

onMounted(async () => {
  try {
    const response = await fetch("/api/releases/latest");
    const payload: unknown = await response.json();
    if (!response.ok) {
      const message = typeof payload === "object" && payload !== null &&
          "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Release downloads are temporarily unavailable.";
      throw new Error(message);
    }
    if (!isReleaseManifest(payload)) {
      throw new Error("Release information is temporarily invalid.");
    }
    release.value = payload;
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "Release downloads are temporarily unavailable.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div :class="styles.group">
    <div :class="styles.acceptance">
      <label>
        <input v-model="accepted" type="checkbox" data-testid="agreement-acceptance" />
        <span>I agree to the</span>
      </label>
      <a href="/agreement">Writasaurus License Agreement</a>.
    </div>
    <p v-if="loading" :class="styles.notice" role="status" data-testid="download-loading">
      Checking for the latest release…
    </p>
    <p v-else-if="errorMessage" :class="styles.error" role="alert" data-testid="download-error">
      {{ errorMessage }}
    </p>
    <template v-else-if="release && accepted">
      <p :class="styles.version" data-testid="release-version">
        Writasaurus {{ release.version }}
      </p>
      <div :class="styles.downloads" data-testid="platform-downloads">
        <a
          v-for="platform in platforms"
          :key="platform.id"
          :class="styles.download"
          :href="release.artifacts[platform.id].url"
          :download="release.artifacts[platform.id].fileName"
          :data-testid="`download-${platform.id}`"
        >
          Download for {{ platform.label }}
        </a>
      </div>
    </template>
    <p v-else-if="!loading && release" :class="styles.notice" role="status">
      Agree to the license to see the available downloads.
    </p>
  </div>
</template>
