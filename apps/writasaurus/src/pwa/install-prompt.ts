import { isSupported } from "@writasaurus/fs";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstalledRelatedApp {
  platform: string;
  id?: string;
  url?: string;
}

type InstalledAppsNavigator = Navigator & {
  getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
};

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return (
    "prompt" in event &&
    typeof event.prompt === "function" &&
    "userChoice" in event &&
    event.userChoice instanceof Promise
  );
}

export function setupInstallPrompt(): void {
  const setup = () => {
    const installButton = document.querySelector<HTMLAnchorElement>("[data-install-button]");
    if (!installButton) {
      console.warn("[PWA] Install button not found");
      return;
    }

    if (!isSupported()) {
      const warning = document.querySelector<HTMLElement>("[data-install-warning]");
      if (!warning) throw new Error("The unsupported-browser warning is missing.");
      installButton.removeAttribute("href");
      installButton.setAttribute("role", "link");
      installButton.setAttribute("aria-disabled", "true");
      installButton.setAttribute("aria-describedby", warning.id);
      installButton.tabIndex = 0;
      warning.hidden = false;
      installButton.addEventListener("click", (event) => event.preventDefault());
      window.addEventListener("beforeinstallprompt", (event) => event.preventDefault());
      return;
    }

    console.log("[PWA] Install button found, setting up listeners");

    let deferredPrompt: InstallPromptEvent | undefined;
    let installed = false;
    const showOpenApp = () => {
      installed = true;
      deferredPrompt = undefined;
      installButton.textContent = "Open App";
      installButton.href = "web+writasaurus://open";
    };

    const installedAppsNavigator: InstalledAppsNavigator = navigator;
    if (installedAppsNavigator.getInstalledRelatedApps) {
      void installedAppsNavigator
        .getInstalledRelatedApps()
        .then((apps) => {
          const manifestUrl = new URL("/writasaurus-editor.webmanifest", location.origin).href;
          const appId = new URL("/editor", location.origin).href;
          if (
            apps.some(
              (app) => app.platform === "webapp" && (app.id === appId || app.url === manifestUrl),
            )
          ) {
            showOpenApp();
          }
        })
        .catch((error: unknown) => {
          console.error("[PWA] Installed app detection failed:", error);
        });
    }
    window.addEventListener("beforeinstallprompt", (event) => {
      console.log("[PWA] beforeinstallprompt event fired");
      if (!isInstallPromptEvent(event)) {
        console.warn("[PWA] Event is not an InstallPromptEvent");
        return;
      }
      event.preventDefault();
      if (installed) return;
      deferredPrompt = event;
      installButton.textContent = "Install app";
      console.log("[PWA] Deferred prompt stored, button text changed to 'Install app'");
    });

    installButton.addEventListener("click", (event) => {
      console.log(
        "[PWA] Install button clicked, deferredPrompt:",
        deferredPrompt ? "exists" : "missing",
      );
      if (!deferredPrompt) return;
      event.preventDefault();
      const prompt = deferredPrompt;
      deferredPrompt = undefined;
      void prompt
        .prompt()
        .then(() => {
          console.log("[PWA] Prompt shown to user");
          return prompt.userChoice;
        })
        .then((choice) => {
          console.log("[PWA] User choice:", choice.outcome);
          if (installed) return;
          if (choice.outcome === "accepted") {
            installButton.textContent = "App installing...";
          } else {
            installButton.textContent = "Try now";
          }
        })
        .catch((error: unknown) => {
          installButton.textContent = "Try now";
          console.error("[PWA] Installation prompt failed:", error);
        });
    });

    window.addEventListener("appinstalled", () => {
      console.log("[PWA] App installed!");
      showOpenApp();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
}
