<script setup lang="ts">
import { ref } from "vue";
import { activateLicense } from "../../lib/license.ts";

const props = defineProps<{ publicKey: string; apiUrl: string }>();
const licenseKey = ref("");
const error = ref("");
const busy = ref(false);
const accountAvailable = Boolean(props.apiUrl);
const emit = defineEmits<{ activated: [] }>();

async function openAccount(): Promise<void> {
    error.value = "";
    try {
        const response = await fetch("/api/editor/open-account", { method: "POST" });
        if (!response.ok) {
            throw new Error(await response.text() || "Could not open the license website.");
        }
    } catch (reason) {
        error.value = reason instanceof Error
            ? reason.message
            : "Could not open the license website in your browser.";
    }
}

async function submit(): Promise<void> {
    error.value = "";
    busy.value = true;
    try {
        if (!await activateLicense(licenseKey.value, props.publicKey, props.apiUrl)) {
            error.value = "This license could not be activated. Check the key and try again.";
            return;
        }
        emit("activated");
    } catch (reason) {
        error.value = reason instanceof Error
            ? reason.message
            : "Could not activate Writasaurus. Check your connection and try again.";
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <main class="gate">
        <h1>Activate Writasaurus</h1>
        <p>Enter the license key from your purchase email. One license works on up to two devices.</p>
        <form @submit.prevent="void submit()">
            <label for="license-key">License key</label>
            <input
                id="license-key"
                v-model="licenseKey"
                autocomplete="off"
                autocapitalize="characters"
                required
                maxlength="80"
            />
            <button type="submit" :disabled="busy">
                {{ busy ? "Activating…" : "Activate" }}
            </button>
        </form>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="accountAvailable">
            <a href="/account" @click.prevent="void openAccount()">
                Manage your purchase or recover your key
            </a>
        </p>
        <p v-else>License activation is not configured for this build.</p>
    </main>
</template>

<style scoped>
.gate {
    display: grid;
    gap: 1rem;
    margin: 10vh auto;
    max-width: 32rem;
    padding: 2rem;
}

form {
    display: grid;
    gap: 0.75rem;
}

input,
button {
    font: inherit;
    padding: 0.75rem;
}
</style>
