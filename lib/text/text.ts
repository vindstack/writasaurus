/**
 * text.ts
 *
 * Small text/DOM helpers shared across browser client modules.
 */

/**
 * Keeps a native browser tooltip in sync with whether an element's text is
 * actually truncated (e.g. via `text-overflow: ellipsis`).
 *
 * Sets the `title` attribute to the element's current text/value when its
 * content overflows its box, and removes it otherwise, so the tooltip only
 * shows up when it's needed.
 *
 * Works for both plain elements (using `textContent`) and form controls like
 * `<input>` (using `value`), and is safe to call repeatedly (e.g. on input or
 * resize events).
 */
export function syncTruncationTooltip(
  element: HTMLElement | HTMLInputElement,
): void {
  const text = "value" in element ? element.value : element.textContent ?? "";
  const isTruncated = element.scrollWidth > element.clientWidth;

  if (isTruncated && text) {
    element.title = text;
  } else {
    element.removeAttribute("title");
  }
}
