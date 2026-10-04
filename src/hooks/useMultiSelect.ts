import { useCallback, useRef } from "react";

export type SelectModifiers = { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean };

/**
 * Shared multi-select behaviour for task lists:
 * - click / Ctrl/Cmd+click: toggle one item and remember it as the anchor
 * - Shift+click: select every item between the anchor and the clicked one (in visible order)
 * - selectMany / deselectMany: group selection helpers
 */
export function useMultiSelect(
  orderedIds: string[],
  selected: Set<string>,
  setSelected: (next: Set<string>) => void,
) {
  const anchorRef = useRef<string | null>(null);

  const onItemSelect = useCallback(
    (id: string, mods?: SelectModifiers) => {
      const anchor = anchorRef.current;
      if (mods?.shiftKey && anchor && anchor !== id) {
        const a = orderedIds.indexOf(anchor);
        const b = orderedIds.indexOf(id);
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a];
          const next = new Set(selected);
          for (let i = from; i <= to; i++) next.add(orderedIds[i]);
          setSelected(next);
          return;
        }
      }
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      anchorRef.current = id;
      setSelected(next);
    },
    [orderedIds, selected, setSelected],
  );

  const selectMany = useCallback(
    (ids: string[]) => {
      const next = new Set(selected);
      ids.forEach((id) => next.add(id));
      setSelected(next);
    },
    [selected, setSelected],
  );

  const deselectMany = useCallback(
    (ids: string[]) => {
      const next = new Set(selected);
      ids.forEach((id) => next.delete(id));
      setSelected(next);
    },
    [selected, setSelected],
  );

  const groupState = useCallback(
    (ids: string[]): boolean | "indeterminate" => {
      if (ids.length === 0) return false;
      const n = ids.filter((id) => selected.has(id)).length;
      return n === 0 ? false : n === ids.length ? true : "indeterminate";
    },
    [selected],
  );

  const toggleGroup = useCallback(
    (ids: string[]) => {
      if (groupState(ids) === true) deselectMany(ids);
      else selectMany(ids);
    },
    [groupState, selectMany, deselectMany],
  );

  return { onItemSelect, selectMany, deselectMany, groupState, toggleGroup };
}
