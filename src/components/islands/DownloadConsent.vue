<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
type PlatformId = typeof platforms[number]["id"];

const selectedPlatform = ref<PlatformId>("linux");
const selectedPlatformLabel = computed(() =>
  platforms.find((platform) => platform.id === selectedPlatform.value)?.label ?? "Linux"
);
const selectedArtifact = computed(() =>
  release.value?.artifacts[selectedPlatform.value]
);

function detectPlatform(): PlatformId {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes("win") || userAgent.includes("windows")) return "windows";
  if (platform.includes("mac") || userAgent.includes("macintosh")) return "macos";
  return "linux";
}

onMounted(async () => {
  selectedPlatform.value = detectPlatform();
  try {
    const response = await fetch("/latest.json");
    if (response.status === 404) {
      throw new Error("No Desktop release is published yet.");
    }
    if (!response.ok) {
      throw new Error("Release downloads are temporarily unavailable.");
    }
    const payload: unknown = await response.json();
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
    <template v-else-if="release">
      <p :class="styles.version" data-testid="release-version">
        Writasaurus {{ release.version }}
      </p>
      <div :class="styles.downloads" data-testid="platform-downloads">
        <div
          :class="styles.downloadControl"
          :data-disabled="!accepted"
          data-testid="download-control"
        >
          <a
            v-if="accepted && selectedArtifact"
            :class="styles.download"
            :href="selectedArtifact.url"
            :download="selectedArtifact.fileName"
            :data-testid="`download-${selectedPlatform}`"
          >
            Download for {{ selectedPlatformLabel }}
          </a>
          <button
            v-else
            :class="[styles.download, styles.disabled]"
            type="button"
            disabled
            :data-testid="`download-${selectedPlatform}`"
          >
            Download for {{ selectedPlatformLabel }}
          </button>
          <label :class="styles.platform">
            <select
              v-model="selectedPlatform"
              :class="styles.platformSelect"
              aria-label="Select operating system"
              data-testid="operating-system-select"
            >
              <option v-for="platform in platforms" :key="platform.id" :value="platform.id">
                {{ platform.label }}
              </option>
            </select>
            <span :class="styles.platformArrow" aria-hidden="true" />
          </label>
        </div>
      </div>
      <p v-if="!accepted" :class="styles.notice" role="status">
        Agree to the license to enable this download.
      </p>
    </template>
  </div>
</template>
