<script setup lang="ts">
import { ref } from "vue";
import styles from "./DownloadConsent.module.css";

const accepted = ref(false);
const showNotice = ref(false);
</script>

<template>
  <div :class="styles.group">
    <label :class="styles.acceptance">
      <input v-model="accepted" type="checkbox" data-testid="agreement-acceptance" />
      <span>
        I agree to the
        <a href="/agreement">Writasaurus License Agreement</a>.
      </span>
    </label>
    <button
      :class="styles.download"
      type="button"
      data-testid="download-button"
      :disabled="!accepted"
      @click="showNotice = true"
    >
      Download now
    </button>
    <p v-if="showNotice" :class="styles.notice" role="status" data-testid="download-notice">
      Downloads are coming soon.
    </p>
  </div>
</template>
