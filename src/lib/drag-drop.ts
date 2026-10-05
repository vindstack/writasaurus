/**
 * Pointer-based sortable-list behavior. The event listeners are delegated
 * from a stable container, so list items may be re-rendered while it is mounted.
 */
export interface DragDropOptions {
  /** Called after an item is moved from one list index to another. */
  onReorder(fromIndex: number, toIndex: number): void;
  /** Selector used to find sortable items within the container. */
  itemSelector?: string;
  /** Selector for the part of each item that begins a drag. */
  handleSelector?: string;
  /** CSS class applied to the item being dragged. */
  draggedClass?: string;
  /** CSS class applied to the current drop target. */
  dropTargetClass?: string;
  /** CSS class applied to the container during a drag. */
  draggingClass?: string;
  /** Enables Arrow Up and Arrow Down reordering from a focused handle. */
  keyboardEnabled?: boolean;
}

export interface DragDropController {
  destroy(): void;
}

interface DragState {
  pointerId: number | null;
  item: HTMLElement | null;
  index: number | null;
}

export function createDragDrop(
  container: HTMLElement,
  options: DragDropOptions,
): DragDropController {
  const itemSelector = options.itemSelector ?? "[data-drag-item]";
  const handleSelector = options.handleSelector ?? "[data-drag-handle]";
  const draggedClass = options.draggedClass ?? "dragging";
  const dropTargetClass = options.dropTargetClass ?? "drag-over";
  const draggingClass = options.draggingClass ?? "drag-active";
  const state: DragState = { pointerId: null, item: null, index: null };

  function items(): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
  }

  function itemFor(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const item = target.closest<HTMLElement>(itemSelector);
    return item && container.contains(item) ? item : null;
  }

  function clearDropTargets(): void {
    for (const item of items()) item.classList.remove(dropTargetClass);
  }

  function targetIndexAt(x: number, y: number): number | null {
    const sortableItems = items();
    for (let index = 0; index < sortableItems.length; index++) {
      const rect = sortableItems[index].getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return index;
      }
    }
    return null;
  }

  function updateDropTarget(x: number, y: number): void {
    const targetIndex = targetIndexAt(x, y);
    for (const [index, item] of items().entries()) {
      item.classList.toggle(
        dropTargetClass,
        targetIndex === index && index !== state.index,
      );
    }
  }

  function finishDrag(x: number, y: number): void {
    const fromIndex = state.index;
    const draggedItem = state.item;
    const toIndex = targetIndexAt(x, y);

    clearDropTargets();
    container.classList.remove(draggingClass);
    draggedItem?.classList.remove(draggedClass);
    draggedItem?.setAttribute("aria-grabbed", "false");
    state.pointerId = null;
    state.item = null;
    state.index = null;

    if (fromIndex !== null && toIndex !== null && fromIndex !== toIndex) {
      options.onReorder(fromIndex, toIndex);
    }
  }

  function cancelDrag(): void {
    clearDropTargets();
    container.classList.remove(draggingClass);
    state.item?.classList.remove(draggedClass);
    state.item?.setAttribute("aria-grabbed", "false");
    state.pointerId = null;
    state.item = null;
    state.index = null;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest(handleSelector)) return;

    const item = itemFor(event.target);
    const index = item ? items().indexOf(item) : -1;
    if (index < 0 || !item) return;

    event.preventDefault();
    state.pointerId = event.pointerId;
    state.item = item;
    state.index = index;
    item.classList.add(draggedClass);
    item.setAttribute("aria-grabbed", "true");
    container.classList.add(draggingClass);
    container.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId === state.pointerId) updateDropTarget(event.clientX, event.clientY);
  }

  function onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== state.pointerId) return;
    finishDrag(event.clientX, event.clientY);
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (event.pointerId === state.pointerId) cancelDrag();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!options.keyboardEnabled || !(event.target instanceof Element)) return;
    if (!event.target.closest(handleSelector)) return;

    const item = itemFor(event.target);
    const fromIndex = item ? items().indexOf(item) : -1;
    const toIndex = event.key === "ArrowUp"
      ? fromIndex - 1
      : event.key === "ArrowDown"
      ? fromIndex + 1
      : fromIndex;

    if (fromIndex < 0 || toIndex < 0 || toIndex >= items().length) return;
    event.preventDefault();
    options.onReorder(fromIndex, toIndex);
  }

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerCancel);
  container.addEventListener("keydown", onKeyDown);

  return {
    destroy(): void {
      cancelDrag();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerCancel);
      container.removeEventListener("keydown", onKeyDown);
    },
  };
}
