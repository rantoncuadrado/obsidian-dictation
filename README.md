# Dictation

Dictation is a focused voice-to-text plugin for Obsidian. It records through
Obsidian's core **Audio recorder**, transcribes with the provider you choose,
and inserts the result at the cursor captured when recording began.

It works on desktop and mobile. It does not index your vault, send note
content, include telemetry, or bundle access to a transcription service.

## Features

- Record from the ribbon, status bar, command palette, hotkey, or mobile
  microphone button.
- Keep the mobile button visible above the software keyboard and Obsidian's
  editing toolbar, including while selecting text.
- Use toggle recording everywhere or optional desktop-only push-to-talk.
- Configure OpenAI, Groq, Deepgram, or a custom OpenAI-compatible endpoint.
- Choose automatic language detection, a common language, or a custom code.
- Decide after every recording whether to **Transcribe**, **Keep audio**, or
  **Discard**, or opt into an automatic policy.
- Recover the full transcript in a copyable dialog if safe insertion fails.
- Retain audio conservatively in a managed folder. The default is 21 days.
- Use the interface in English or Spanish, following Obsidian's language.

## Requirements

- Obsidian 1.11.4 or newer.
- Obsidian's core **Audio recorder** plugin enabled.
- Microphone permission on each device.
- An account and API key for the selected transcription provider. Provider
  pricing, free tiers, rate limits, and terms apply; Dictation includes no API
  credit or service account.

## Setup

After installing and enabling Dictation:

1. Open **Settings → Core plugins** and enable **Audio recorder**.
2. Open **Settings → Dictation**.
3. Choose OpenAI, Groq, Deepgram, or Custom. Known provider endpoints and
   suggested model IDs are filled in for you.
4. In **API key**, create or select an Obsidian SecretStorage entry. Only its
   name is stored in plugin settings; its value remains in SecretStorage.
5. Choose a model and language. **Automatic detection** is the default.
6. Review the post-recording choice and audio retention settings. The safe
   defaults are **Ask every time** and deletion after **21 days**.

SecretStorage is device-local. Repeat step 4 on every computer or phone, even
when the vault itself is synchronized.

## Usage

### Desktop 

On desktop, click the ribbon microphone, click **Dictation** in the status bar,
or run **Start or stop recording** from the command palette. You can assign an
Obsidian hotkey to that command. Optional push-to-talk is a separate setting:
hold your chosen shortcut to record and release it to stop.

<img width="50%" alt="Desktop" src="https://github.com/user-attachments/assets/0794c85d-7e19-4d78-930d-3e6db10bf635" />


### Mobile

On mobile, open a Markdown note and tap the floating microphone. It remains
above the keyboard and editing toolbar when a cursor or text selection is
active. Tap the red stop button when finished. Push-to-talk is desktop-only
because mobile operating systems do not provide a dependable held-key cycle.

https://github.com/user-attachments/assets/cec224d9-49a8-409a-8b22-e1a0965206d1

When recording stops, the default dialog offers:

- **Transcribe:** upload the recording to the configured provider.
- **Keep audio:** preserve the recording without contacting that provider.
- **Discard:** move the recording to Obsidian's trash.

Closing the dialog means **Keep audio**.

## Providers

| Provider | Managed endpoint | Suggested models |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/audio/transcriptions` | `gpt-4o-mini-transcribe`, `whisper-1` |
| Groq | `https://api.groq.com/openai/v1/audio/transcriptions` | `whisper-large-v3-turbo`, `whisper-large-v3` |
| Deepgram | `https://api.deepgram.com/v1/listen` | `nova-3`, `nova-2` |
| Custom | You provide an HTTPS endpoint | You provide an OpenAI-compatible model ID |

Endpoints and model suggestions are conveniences, not bundled service access.
Verify current models, availability, limits, and prices with your provider.
The Custom option supports Bearer, Token, or no authorization; never place a
credential in the endpoint URL.

## Privacy and network disclosure

Dictation makes no network request while idle, recording, keeping, or
discarding audio. A transcription request sends the following to the endpoint
shown in settings:

- the complete selected audio recording;
- the selected model ID;
- the optional language hint.

It does **not** send note text, filenames, vault contents, diagnostics,
analytics, or advertising identifiers. An automatic transcription policy is
opt-in because stopping a recording then starts the upload immediately.

| Topic | Behavior |
| --- | --- |
| Accounts and payment | Your chosen provider may require an account, billing, or a paid plan. |
| Credentials | Stored through Obsidian SecretStorage; `data.json` contains only the selected secret name. |
| Network use | Only transcription requests to the endpoint visible in settings. |
| External files | None. Audio and notes are accessed through Obsidian's Vault API. |
| Telemetry and ads | None. |
| Source and license | Public source under GPL-3.0-only. |

## Destination and transcript recovery

The target note path, cursor offset, and surrounding text are captured when
recording starts. Switching notes while speaking does not redirect the result.
Before insertion, Dictation relocates that anchor in the latest note content
and tolerates the Audio recorder embed appearing at the cursor.

If the target is missing or ambiguous, Dictation never guesses. It displays
the complete transcript in a copyable recovery dialog and keeps the audio.

## Safe audio retention

After successful insertion, Dictation removes the audio embed from the note
and moves the recording to `Dictation/Recordings` by default. A failed request,
empty response, missing configuration, missing destination, or failed
insertion never deletes the audio or removes its embed.

Retention choices are:

- keep indefinitely;
- move to trash immediately after successful insertion;
- move to trash after a delay (21 days by default).

For delayed deletion, Dictation remembers the exact managed file and its
size/modified-time fingerprint. When due, it deletes only if the file is
unchanged and no note other than its original target references it. Otherwise
it keeps the file. File moves and deletions use Obsidian's public APIs and
Obsidian trash.

## Concurrency and failure safety

Recording uses a serialized state machine. It ignores double clicks, key
repeat, duplicate stop requests, and attempts to start another recording while
a decision, upload, or insertion is in progress. If one recording cannot be
associated safely with the operation, the plugin stops and deletes nothing.

## Install manually

Download `main.js`, `manifest.json`, and `styles.css` from the same GitHub
release and place them in:

```text
<vault>/.obsidian/plugins/dictation/
```

Reload community plugins, then enable **Dictation**. Do not copy `data.json`
between devices; it contains device-specific settings and secret references.

## Development

Requires Node.js 18 or newer.

```bash
npm ci
npm test
npm run build
npm run check
```

`main.js` is generated and intentionally excluded from source control. Each
GitHub release attaches the minified `main.js`, `manifest.json`, and
`styles.css` required by Obsidian.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and
[DESIGN.md](DESIGN.md). Dictation is licensed under [GPL-3.0](LICENSE).
