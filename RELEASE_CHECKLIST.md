# Release Checklist

## Pre-Release

- [ ] Bump `manifest.json` version using semver.
- [ ] Validate `minAppVersion` compatibility.
- [ ] Confirm command IDs unchanged (or document migrations).
- [ ] Verify settings import/export path and behavior.
- [ ] Run `npm test` inside `.obsidian/plugins/weekly-meal-shopper`.

## Functional QA

- [ ] Parse command updates both metadata and direction bolding.
- [ ] Recipe view step highlighting matches ingredient mentions.
- [ ] Shopping list generation includes category reasons and override links (if enabled).
- [ ] Frozen portions command creates/opens `.base` file.

## API QA

- [ ] URL transcription succeeds on at least 3 real recipe pages.
- [ ] 429 simulation triggers retry/backoff and clear notice.
- [ ] Failed transcription creates fallback template note.
- [ ] Image folder transcription reports success/failure counts.

## Docs + Assets

- [ ] README command list is accurate.
- [ ] Quick start steps verified in clean vault.
- [ ] GIF demos updated.

## Distribution

- [ ] Commit/tag release branch.
- [ ] Publish release notes.
- [ ] Store post-release issues in milestone board.
