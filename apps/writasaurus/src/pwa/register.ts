// The integration defines this flag only in builds that actually emit the worker.
declare const __WRITASAURUS_EDITOR_PWA__: boolean;

if (
  typeof __WRITASAURUS_EDITOR_PWA__ !== "undefined" &&
  __WRITASAURUS_EDITOR_PWA__ &&
  "serviceWorker" in navigator
) {
  const register = () => {
    void navigator.serviceWorker
      .register("/writasaurus-editor-sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error: unknown) => console.error("Offline editor registration failed.", error));
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
