# Dictation design and safety model

## Product boundary

Dictation ends at inserted text:

```text
Obsidian Audio recorder → managed audio → transcription provider → Markdown text
```

It does not create a special vault hierarchy, organize notes, maintain recaps,
chat with the vault, index files, or use a second AI model.

## Interaction modes

Both modes use the same recording state machine:

- **Toggle:** start from the ribbon, status bar, command palette, or an Obsidian
  command hotkey; invoke again to stop. This is cross-platform.
- **Push-to-talk:** a separate, optional desktop-only global listener starts on
  the configured keydown and stops when the main key is released. Repeated
  keydown events and events from input controls are ignored.

Push-to-talk has no default shortcut to avoid colliding with Obsidian or OS
shortcuts. It does not change the post-recording policy: **Ask every time** is
still the default.

## State machine and concurrency

```text
idle → starting → recording → stopping → awaiting-audio
     → awaiting-decision → transcribing → inserting → completed → idle
     └────────────────────────── failure → failed-audio-kept
```

A single transition lock serializes start and stop. States outside idle,
completed, failed, or recording reject unrelated toggles. File creation is
observed only while a recording operation is active. The listener candidate is
confirmed by extension and non-zero size; a snapshot difference is the
fallback.

## Captured destination

At start, Dictation stores:

- the Markdown path;
- the cursor offset;
- up to 80 characters immediately before and after the cursor.

Insertion uses `Vault.process` against the latest file contents. The resolver
accepts an exact match, a single relocated context, or a bounded gap between
the two contexts (normally the embed inserted by Audio recorder). Ambiguous
matches fail closed. The transcript is then shown in a recovery modal and the
audio is retained.

## Provider adapters

- OpenAI and Groq use multipart requests with `model`, optional `language`, and
  `file`, authenticated with Bearer.
- Deepgram receives raw audio with its MIME type, query parameters for model
  and language/detection, and Token authentication.
- Custom uses OpenAI-compatible multipart and a configurable JSON response
  path, with Bearer, Token, or no authorization.

All requests use Obsidian `requestUrl` for desktop/mobile parity. Error strings
are length-limited and redact common authorization and key patterns.

## SecretStorage invariant

Only secret identifiers are serialized. Secret values are fetched from
device-local Obsidian SecretStorage immediately before a request and are never
placed in plugin data, Markdown, notices, or logs. Missing local secrets fail
before audio is uploaded.

## Audio lifecycle invariants

1. Failure before or during transcription keeps audio.
2. Failure or ambiguity during insertion keeps audio.
3. Retention runs only after successful insertion.
4. Deletion uses Vault trash, never filesystem unlink.
5. Scheduled cleanup acts only on explicit managed records whose path,
   size, and mtime still match.
6. A reference from a note other than the original target prevents deletion.
7. There is no generic orphan-audio sweep.

After successful insertion, the recorder embed is removed from the target note
and the audio is moved to the managed recordings folder through the
Vault/FileManager APIs. The default folder is `Dictation/Recordings`; the
default retention policy moves the file to Obsidian's trash after 21 days.

## Compatibility boundary

The manifest is cross-platform. Toggle recording, provider adapters,
SecretStorage, recovery, and retention contain no Electron dependency.
Push-to-talk is gated behind `Platform.isDesktopApp`. Compatibility depends on
Obsidian's core Audio recorder command IDs and device microphone permissions.

## Test strategy

Automated tests cover anchor resolution (including recorder embeds and
ambiguity), hotkey validation/matching, transcript normalization, secret
redaction, and embed removal. TypeScript strict checking and production
bundling run on every build.

Manual release checks remain necessary for:

- actual Audio recorder command availability and creation timing;
- microphone permissions on macOS, Windows, Linux, iOS, and Android;
- SecretStorage setup on each device;
- external file sync or rename races;
- Obsidian trash behavior and automatic link updates;
- every provider's current endpoint/model contract.
