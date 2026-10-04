import { html, webComponent } from "../../src/framework/web-components/index.ts";

export const appAvatar = webComponent("app-avatar")
  .defineObservedAttributes({
    src: "",
    alt: "",
    name: "",
    size: "medium" as "small" | "medium" | "large",
  })
  .defineStyles(/* css */ `
    :host {
      display: inline-flex;
      font-family: inherit;
    }

    .avatar {
      align-items: center;
      background: var(--surface-sunken, #e2edf5);
      border: 1px solid var(--border, #d5e2ec);
      border-radius: 50%;
      box-sizing: border-box;
      color: var(--accent, #2a6f97);
      display: inline-flex;
      font-weight: 600;
      justify-content: center;
      overflow: hidden;
      user-select: none;
    }

    .avatar.size-small {
      font-size: 0.75rem;
      height: 2rem;
      width: 2rem;
    }

    .avatar.size-medium {
      font-size: 0.95rem;
      height: 2.5rem;
      width: 2.5rem;
    }

    .avatar.size-large {
      font-size: 1.25rem;
      height: 3.25rem;
      width: 3.25rem;
    }

    img {
      height: 100%;
      object-fit: cover;
      width: 100%;
    }
  `)
  .defineRender((element) => {
    const { src, alt, name, size } = element.observedAttribute;

    const getInitials = (text: string) => {
      const parts = text.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return text.slice(0, 2).toUpperCase();
    };

    return html`
      <div class=${`avatar size-${size}`}>
        ${src
          ? html`<img src=${src} alt=${alt || name || "Avatar"} />`
          : html`<span>${name ? getInitials(name) : html`<slot></slot>`}</span>`}
      </div>
    `;
  })
  .create();
