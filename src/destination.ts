import type { EditorAnchor } from "./types";

export function createEditorAnchor(
  path: string,
  content: string,
  offset: number,
  contextLength = 80,
): EditorAnchor | null {
  if (!path || offset < 0 || offset > content.length) return null;
  return {
    path,
    offset,
    before: content.slice(Math.max(0, offset - contextLength), offset),
    after: content.slice(offset, offset + contextLength),
  };
}

function allIndexes(content: string, needle: string): number[] {
  if (!needle) return [];
  const result: number[] = [];
  let from = 0;
  while (from <= content.length) {
    const index = content.indexOf(needle, from);
    if (index < 0) break;
    result.push(index);
    from = index + 1;
  }
  return result;
}

export function resolveAnchorOffset(content: string, anchor: EditorAnchor): number | null {
  const exactBefore = content.slice(
    Math.max(0, anchor.offset - anchor.before.length),
    anchor.offset,
  );
  const exactAfter = content.slice(anchor.offset, anchor.offset + anchor.after.length);
  if (exactBefore === anchor.before && exactAfter === anchor.after) return anchor.offset;

  if (anchor.before && anchor.after) {
    const direct = `${anchor.before}${anchor.after}`;
    const directMatches = allIndexes(content, direct);
    if (directMatches.length === 1) {
      return directMatches[0]! + anchor.before.length;
    }

    const beforeMatches = allIndexes(content, anchor.before);
    const candidates: number[] = [];
    for (const beforeStart of beforeMatches) {
      const insertionOffset = beforeStart + anchor.before.length;
      const afterStart = content.indexOf(anchor.after, insertionOffset);
      if (afterStart >= insertionOffset && afterStart - insertionOffset <= 1024) {
        candidates.push(insertionOffset);
      }
    }
    if (candidates.length === 1) return candidates[0]!;
    return null;
  }

  if (anchor.before) {
    const matches = allIndexes(content, anchor.before);
    return matches.length === 1 ? matches[0]! + anchor.before.length : null;
  }
  if (anchor.after) {
    const matches = allIndexes(content, anchor.after);
    return matches.length === 1 ? matches[0]! : null;
  }
  return content.length === 0 ? 0 : null;
}

export function insertAtAnchor(
  content: string,
  anchor: EditorAnchor,
  transcript: string,
): string | null {
  const offset = resolveAnchorOffset(content, anchor);
  if (offset === null) return null;
  return `${content.slice(0, offset)}${transcript}${content.slice(offset)}`;
}
