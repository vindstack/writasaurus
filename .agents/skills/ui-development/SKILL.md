---
name: ui-development
description: "Use when building or refactoring Writasaurus pages, forms, controls, dialogs, or other UI. Prefer Astro-rendered HTML and shared UI primitives; hydrate Vue only when client interaction requires it."
---

# Writasaurus UI Development

Build accessible, consistent interfaces while keeping client-side JavaScript to a minimum.

## Workflow

1. Inspect the target page, its layout, and the current components under `packages/shared/ui`. Reuse
   existing patterns and APIs instead of creating parallel app-local primitives.
2. Prefer semantic HTML in `.astro` files and native browser behavior. Use shared CSS classes and
   tokens from `packages/shared/ui/css/main.css` for common UI styling.
3. If a shared Vue component fits, it may be imported into an Astro component without a `client:*`
   directive. Astro renders it to HTML without hydrating it. This works for static presentation; Vue
   event handlers and client-side state do not run until it is hydrated.
4. Add Vue hydration only when the feature needs client-side behavior. Hydrate the smallest
   interactive island that can own that behavior, and use the least eager `client:*` directive that
   meets the UX requirement.
5. Before adding a primitive, check whether semantic HTML, a native element, a shared component, or
   a `main.css` class already solves the need. If the primitive is broadly reusable, add it to
   `packages/shared/ui/components` and keep its styles based on `main.css`.
6. Validate the affected app with its existing Deno check/build/test tasks.

## Rendering and interaction

- Avoid Vue hydration by default. Do not add `client:load` just to use a Vue component or style a
  page.
- Prefer native links, buttons, forms, inputs, `<details>`, and `<dialog>` when their built-in
  semantics and behavior satisfy the requirement. Use JavaScript only for behavior the platform does
  not provide.
- A Vue component imported in an Astro template without a client directive is server-rendered, not
  interactive. Do not rely on its `@click`, watchers, lifecycle hooks, or client state in that mode.
- When interactivity is needed, isolate it in a small Vue island. Keep surrounding content in
  Astro/HTML rather than turning an entire page into a client application.
- Preserve keyboard access, accessible names and relationships, visible focus, and native form
  behavior. Prefer semantic elements over ARIA roles when possible.

Static shared component in an Astro page (rendered without Vue hydration):

```astro
---
import Button from "../../../../packages/shared/ui/components/Button.vue";
---

<Button href="/account" variant="primary">Account</Button>
```

Interactive behavior belongs in a small island:

```astro
---
import SearchIsland from "../components/islands/SearchIsland.vue";
---

<SearchIsland client:visible />
```

Use the correct relative import for the file being edited. Choose `client:visible` for interaction
that can wait until it enters the viewport; use `client:load` only when it must work immediately.

## Shared UI and styling

- Shared components live in `packages/shared/ui/components`; shared styles live in
  `packages/shared/ui/css`.
- The app should load `packages/shared/ui/css/main.css` globally through its app/layout stylesheet.
  Do not import it again from individual components.
- Available shared Vue components include `Button`, `Chip`, `Dialog`, `Divider`, `DropdownMenu`,
  `FormField`, `Checkbox`, `Switch`, `SegmentedControl`, `Tabs`, `Toast`, `Progress`, and `Tooltip`.
  Inspect their current props and behavior before use.
- Vue SFCs can provide component structure and client interaction, but should not duplicate reset,
  token, typography, button, form-control, card, dialog, grid, or other rules already provided by
  `main.css`.
- Component-scoped styles are appropriate only for layout or behavior unique to that component. Keep
  those selectors narrowly scoped; move a reusable pattern to shared CSS or a shared component
  instead of copying it between apps.
- Use the existing shared tokens (for example `--surface`, `--text`, `--muted`, `--border`,
  `--accent`, and spacing/radius tokens). Light and dark colors follow the system preference; do not
  add a manual theme switch unless requirements explicitly change.
- Follow project styling conventions: component styles stay local, avoid inline `style` attributes,
  and prefer `data-*` attributes for test hooks.

## Adding a shared primitive

Add a component under `packages/shared/ui/components` only when it is useful beyond one page and
cannot be expressed clearly with existing components, CSS classes, or native HTML. Give it a focused
API, semantic markup, accessible behavior, and styles that assume `main.css` is loaded. Keep
app-specific state and product workflows in the app, not in the shared UI package.
