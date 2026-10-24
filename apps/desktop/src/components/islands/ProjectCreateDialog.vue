<script setup lang="ts">
import { ref, watch } from "vue";
import type { Manuscript } from "../../lib/editor/types.ts";
import Button from "../../../../../packages/shared/ui/components/Button.vue";
import Dialog from "../../../../../packages/shared/ui/components/Dialog.vue";
import FormField from "../../../../../packages/shared/ui/components/FormField.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  created: [manuscript: Manuscript];
}>();

const projectName = ref("");
const parentPath = ref("");
const choosingLocation = ref(false);
const creating = ref(false);
const errorMessage = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) {
      projectName.value = "Untitled Project";
      parentPath.value = "";
      errorMessage.value = "";
      return;
    }

    if (parentPath.value) void cancelPendingLocation();
    parentPath.value = "";
  },
);

async function cancelPendingLocation(): Promise<void> {
  try {
    const response = await fetch("/api/editor/project/cancel", { method: "POST" });
    if (!response.ok) throw new Error(`Could not clear the selected location: ${response.status}`);
  } catch (error) {
    console.warn("Could not clear the pending project location.", error);
  }
}

async function chooseLocation(): Promise<void> {
  choosingLocation.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch("/api/editor/project/location", { method: "POST" });
    if (response.status === 204) return;
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    if (typeof result.parentPath !== "string") {
      throw new Error("The selected parent folder could not be read.");
    }
    parentPath.value = result.parentPath;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : "Could not choose a parent folder.";
  } finally {
    choosingLocation.value = false;
  }
}

async function createProject(): Promise<void> {
  const name = projectName.value.trim();
  if (!name || !parentPath.value) return;

  creating.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch("/api/editor/project/new", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectName: name }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json();
    emit("created", result.manuscript);
    emit("close");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Could not create the project.";
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <Dialog id="create-project-dialog" title="Create New Project" :open="open" @close="emit('close')">
    <form class="projectForm" @submit.prevent="createProject">
      <p>
        Choose where to create your project. Writasaurus will make a new folder there and put the
        EPUB manuscript inside it.
      </p>
      <FormField
        id="project-name"
        label="Project folder name"
        hint="This name will be used for the new folder and manuscript."
      >
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            v-model="projectName"
            :aria-describedby="describedBy"
            autocomplete="off"
            required
            maxlength="120"
            autofocus
            :disabled="creating"
          />
        </template>
      </FormField>
      <section class="location" aria-labelledby="project-location-label">
        <h3 id="project-location-label">Parent folder</h3>
        <p v-if="parentPath" class="selectedPath" data-testid="project-parent-path">
          A folder named <strong>{{ projectName.trim() || "your project" }}</strong> will be created
          inside:
          <br />
          <code>{{ parentPath }}</code>
        </p>
        <p v-else class="muted">Choose the directory where the new project folder should go.</p>
        <Button
          id="choose-project-location"
          :disabled="choosingLocation || creating"
          @click="chooseLocation"
        >
          {{
            choosingLocation
              ? "Choosing..."
              : parentPath
                ? "Change Parent Folder"
                : "Choose Parent Folder..."
          }}
        </Button>
      </section>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <footer class="actions">
        <Button @click="emit('close')">Cancel</Button>
        <button
          class="button button--primary"
          type="submit"
          :disabled="creating || !projectName.trim() || !parentPath"
          id="create-project-submit"
        >
          {{ creating ? "Creating..." : "Create Project" }}
        </button>
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.projectForm {
  display: grid;
  gap: var(--space-4);
}

.projectForm > p:first-child {
  margin: 0;
}

.location {
  display: grid;
  gap: var(--space-2);
}

.location h3,
.location p {
  margin: 0;
}

.selectedPath {
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

.error {
  color: var(--danger);
  margin: 0;
}
</style>
