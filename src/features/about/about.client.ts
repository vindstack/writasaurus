import { registerReturnToEditorShortcut } from "../../../lib/shortcuts.ts";
import { applyThemePreference, getThemePreference } from "../../../lib/settings.ts";

import "./about-counter.ts";

applyThemePreference(getThemePreference());

registerReturnToEditorShortcut();
