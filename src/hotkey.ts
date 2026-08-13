export interface HotkeyEventLike {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

const MODIFIERS = new Set(["Mod", "Alt", "Shift", "Ctrl", "Meta"]);

function normalizeKey(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function parseHotkey(value: string): string[] {
  return value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isValidPushToTalkHotkey(value: string): boolean {
  const tokens = parseHotkey(value);
  return tokens.length >= 2 && tokens.some((token) => !MODIFIERS.has(token));
}

export function eventMatchesHotkey(
  event: HotkeyEventLike,
  hotkey: string,
  isMacOS: boolean,
): boolean {
  const tokens = parseHotkey(hotkey);
  if (!isValidPushToTalkHotkey(hotkey)) return false;
  const needsMod = tokens.includes("Mod");
  const needsMeta = tokens.includes("Meta") || (needsMod && isMacOS);
  const needsCtrl = tokens.includes("Ctrl") || (needsMod && !isMacOS);
  const needsAlt = tokens.includes("Alt");
  const needsShift = tokens.includes("Shift");
  if (
    event.metaKey !== needsMeta ||
    event.ctrlKey !== needsCtrl ||
    event.altKey !== needsAlt ||
    event.shiftKey !== needsShift
  ) {
    return false;
  }
  const mainKey = tokens.find((token) => !MODIFIERS.has(token));
  return normalizeKey(event.key) === normalizeKey(mainKey ?? "");
}

export function hotkeyFromKeyboardEvent(
  event: HotkeyEventLike,
  isMacOS: boolean,
): string | null {
  const mainKey = normalizeKey(event.key);
  if (["Meta", "Control", "Alt", "Shift"].includes(mainKey)) return null;
  const tokens: string[] = [];
  if ((isMacOS && event.metaKey) || (!isMacOS && event.ctrlKey)) tokens.push("Mod");
  if ((isMacOS && event.ctrlKey) || (!isMacOS && event.metaKey)) {
    tokens.push(isMacOS ? "Ctrl" : "Meta");
  }
  if (event.altKey) tokens.push("Alt");
  if (event.shiftKey) tokens.push("Shift");
  tokens.push(mainKey);
  const value = tokens.join("+");
  return isValidPushToTalkHotkey(value) ? value : null;
}

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
