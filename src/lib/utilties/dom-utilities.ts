/**
 * Escapes HTML special characters in a string to prevent XSS attacks.
 */
export function escapeHtml(value: string): string {
  if (typeof document === "undefined") {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  const node = document.createElement("div");
  node.textContent = value;
  return node.innerHTML;
}

/**
 * Converts HTML content to plain text by stripping out all HTML tags.
 */
export function textFromHtml(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, "");
  }
  const node = document.createElement("div");
  node.innerHTML = html;
  return node.textContent ?? "";
}

/**
 * Retrieves a DOM element based on a CSS selector.
 * Throws an error if the element is not found.
 */
export function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const match = document.querySelector(selector);
  if (!(match instanceof HTMLElement)) throw new Error(`Missing element: ${selector}`);
  return match as T;
}
