# Changelog

All notable changes to Dictation are documented here.

## Unreleased

- Add **Transcribe an existing recording**: transcribe an audio file already
  in the vault from the command palette or the file-menu item, inserting the
  result at the cursor. The source file is never moved, renamed, or deleted.

## 1.0.1

- Preserve the selected SecretStorage API key when changing transcription
  language.
- Update the custom-language field in place instead of rebuilding the entire
  settings screen.

## 1.0.0

- Initial public release for desktop and mobile.
- Added guided OpenAI, Groq, Deepgram, and custom provider setup.
- Added toggle recording, desktop push-to-talk, and a keyboard-aware mobile
  recording button.
- Added language and model selection.
- Added explicit post-recording choices, safe 21-day audio retention, and
  transcript recovery.
- Added SecretStorage-backed credentials and English/Spanish localization.
