# Contributing

Bug reports and focused pull requests are welcome. Before opening an issue,
check for an existing report and test the latest release.

Never include API keys, private recordings, or real vault content. Use a
temporary vault and synthetic audio when reproducing a problem. Report
security issues privately as described in [SECURITY.md](SECURITY.md).

## Development

Use Node.js 18 or newer:

```bash
npm ci
npm test
npm run build
npm run check
```

Keep the plugin compatible with desktop and mobile. Avoid Node.js, Electron,
filesystem, or other desktop-only APIs in runtime code. Use Obsidian's public
Vault, FileManager, request, and SecretStorage APIs.

Before submitting a change, test at least:

- recording start and stop;
- keep, discard, successful transcription, and provider failure;
- cursor capture while changing notes or editing the original note;
- retention without deleting changed or additionally referenced audio;
- the settings screen in English and Spanish;
- mobile keyboard, cursor, and text-selection behavior when relevant.

By contributing, you agree that your contribution is licensed under
GPL-3.0-only.
