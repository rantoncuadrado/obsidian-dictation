import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RECORDINGS_FOLDER, DEFAULT_SETTINGS } from "../src/constants";
import { createEditorAnchor, insertAtAnchor, resolveAnchorOffset } from "../src/destination";
import { eventMatchesHotkey, hotkeyFromKeyboardEvent, isValidPushToTalkHotkey } from "../src/hotkey";
import { calculateMobileButtonPosition } from "../src/mobile-position";
import { normalizeTranscript, removeAudioReferences, safeErrorMessage } from "../src/utils";

test("new installations retain managed recordings for 21 days", () => {
  assert.equal(DEFAULT_SETTINGS.retentionPolicy, "scheduled");
  assert.equal(DEFAULT_SETTINGS.retentionDays, 21);
  assert.equal(DEFAULT_SETTINGS.recordingsFolder, DEFAULT_RECORDINGS_FOLDER);
});

test("the mobile button follows the visible viewport above the keyboard", () => {
  assert.deepEqual(
    calculateMobileButtonPosition(390, {
      height: 500,
      offsetLeft: 0,
      offsetTop: 0,
      width: 390,
    }),
    { top: 370, right: 16 },
  );
  assert.deepEqual(
    calculateMobileButtonPosition(390, {
      height: 844,
      offsetLeft: 0,
      offsetTop: 0,
      width: 390,
    }),
    { top: 714, right: 16 },
  );
  assert.deepEqual(
    calculateMobileButtonPosition(
      390,
      { height: 844, offsetLeft: 0, offsetTop: 0, width: 390 },
      54,
      76,
      16,
      12,
      466,
    ),
    { top: 400, right: 16 },
  );
});

test("an unchanged cursor anchor resolves exactly", () => {
  const content = "First paragraph.\n\nSecond paragraph.";
  const anchor = createEditorAnchor("Note.md", content, 16, 12);
  assert.ok(anchor);
  assert.equal(resolveAnchorOffset(content, anchor), 16);
  assert.equal(insertAtAnchor(content, anchor, " Dictated."), "First paragraph. Dictated.\n\nSecond paragraph.");
});

test("an anchor tolerates the recorder inserting an embed at the cursor", () => {
  const original = "BeforeAfter";
  const anchor = createEditorAnchor("Note.md", original, 6, 20);
  assert.ok(anchor);
  const changed = "Before![[Recording.webm]]After";
  assert.equal(resolveAnchorOffset(changed, anchor), 6);
});

test("an ambiguous anchor refuses unsafe insertion", () => {
  const anchor = createEditorAnchor("Note.md", "same SAME", 4, 20);
  assert.ok(anchor);
  assert.equal(resolveAnchorOffset("x same SAME y same SAME", anchor), null);
});

test("push-to-talk hotkeys require and match a modifier", () => {
  assert.equal(isValidPushToTalkHotkey("Space"), false);
  assert.equal(isValidPushToTalkHotkey("Mod+Shift+Space"), true);
  assert.equal(
    eventMatchesHotkey(
      { key: " ", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
      "Mod+Shift+Space",
      true,
    ),
    true,
  );
  assert.equal(
    hotkeyFromKeyboardEvent(
      { key: " ", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
      true,
    ),
    "Mod+Shift+Space",
  );
});

test("audio embeds are removed without touching other content", () => {
  const content = "A\n![[Audio/Recording.webm]]\nB\n![clip](Audio/Recording.webm)\nC";
  assert.equal(
    removeAudioReferences(content, { path: "Audio/Recording.webm", name: "Recording.webm" }),
    "A\n\nB\n\nC",
  );
});

test("transcripts normalize and errors redact common API keys", () => {
  assert.equal(normalizeTranscript(" hello\n  world "), "hello world");
  const message = safeErrorMessage(new Error("Bearer sk_example123456789 was rejected"));
  assert.equal(message.includes("sk_example"), false);
  assert.equal(message.includes("[redacted]"), true);
});
