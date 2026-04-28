# Weekly Meal Shopper

Weekly Meal Shopper standardizes recipe notes, parses ingredient metadata, and generates a categorized shopping checklist from a meal-plan canvas.

The plugin ships with its own private starter templates inside the plugin folder. You do not need to configure Obsidian's Templates core plugin to use the recipe note or meal-prep canvas commands.

## Modes

- Basic: recipe view, ingredient parsing/standardization, URL + image transcription into recipe templates.
- Meal Prep: weekly canvas workflows, shopping list generation, frozen portions inventory/projection, meal-prep canvas creation.

Each mode can be toggled in plugin settings, and presets are available for quick switching (`Balanced`, `Basic only`, `Meal Prep`).

## Commands

- Open recipe view in current tab
- Create recipe note from template
- Standardize current recipe format
- Standardize recipe formats in configured folder
- Populate ingredient metadata from recipe section
- Transcribe recipe from URL entry (website/YouTube)
- Transcribe recipes from image folder
- Add ingredient override from current shopping list line
- Set active canvas as weekly meal plan
- Create weekly meal-prep canvas
- Generate weekly shopping list from meal-plan canvas
- Apply frozen leftovers from meal-plan canvas
- Show frozen portions available

Plugin-owned template files:
- `.obsidian/plugins/weekly-meal-shopper/templates/recipe-template.md`
- `.obsidian/plugins/weekly-meal-shopper/templates/meal-prep-canvas-template.canvas`

On a fresh install, these files are already present in the plugin. The commands create normal vault files from those plugin-owned templates.

## 5-Minute Quick Start

1. Open plugin settings and enable both `Basic` and `Meal Prep` mode features.
2. Set `Recipe folder`, `Transcribe recipes from image folder`, `Transcription output recipe folder`, and `Weekly meal-plan canvas`.
3. Run `Create weekly meal-prep canvas` to create a new weekly canvas from the plugin's bundled canvas template and auto-set it.
4. Run `Create recipe note from template` whenever you want a new recipe note from the plugin's bundled recipe template.
5. Turn on `Delete transcribed source images` if you want the inbox images removed after successful conversion.
6. Run `Standardize recipe formats in configured folder`.
7. Open your canvas and place recipe file cards.
8. Run `Generate weekly shopping list from meal-plan canvas`.

Supported image inbox formats for folder transcription include `jpg/jpeg`, `png`, `webp`, `gif`, `bmp`, `heic/heif` (Apple Photos), `tif/tiff`, and `avif`.

## Recipe Parsing + Formatting

- Ingredients are parsed from the `### Ingredients` section.
- Parsed ingredient metadata is written to frontmatter field `IngredientsParsed` (configurable).
- Ingredient formatting is configurable via template placeholders:
  - `{{Amount}} {{Unit}} {{Ingredient}} {{Preparation}} {{PreparationSuffix}}`
- Measurement presets include Vault Standard, Australian, US Customary, and custom mL values.
- Preference toggle supports weight-first conversion (`g` where density rules are available).

## Recipe View

- Split-pane recipe mode in current tab.
- Left pane: ingredients with click-to-cross-off state.
- Right pane: directions with step focus box and Vim navigation (`j/k`, arrows).
- Subheading sync across `####` sections between ingredients and directions.

## Shopping List Explainability

Shopping list output supports:

- Category reason annotations (`why: ...`).
- One-click `Override` link per line (opens override command using current line).

## Config Files (Extensibility Hooks)

- Ingredient category rules:
  - `.obsidian/plugins/weekly-meal-shopper/ingredient-categories.json`
- Unit-density conversion rules:
  - `.obsidian/plugins/weekly-meal-shopper/unit-density-rules.json`
- Unit alias rules:
  - `.obsidian/plugins/weekly-meal-shopper/unit-aliases.json`

All files are editable and can be opened from plugin settings.

## Safety + Reliability

- Transcription API requests include retry/backoff for rate limits/server errors.
- URL transcription creates a fallback recipe template if transcription fails.
- Parsed ingredient metadata is cached by file mtime/size to avoid unnecessary re-parsing.

## Settings Import/Export

- Export full plugin settings JSON for backup/presets.
- Import the same JSON back into settings from a configurable path.

## Publish Assets (recommended)

- GIF 1: recipe split-view walkthrough
- GIF 2: shopping list generation from canvas
- GIF 3: URL transcription into template
- Sample vault + sample canvas files

Reference pack:
- `docs/demos/README.md`
- `samples/README.md`
- `samples/sample-weekly-meal-plan.canvas`

## Compatibility

- Plugin `minAppVersion`: `0.15.0`
- Desktop + mobile compatible (`isDesktopOnly: false`)

For release planning, see:

- `ROADMAP.md`
- `RELEASE_CHECKLIST.md`
- `CHANGELOG.md`
- `MIGRATION_NOTES.md`
- `TEST_PLAN.md`

## Tests

From `.obsidian/plugins/weekly-meal-shopper`:

```bash
npm test
```

Fixture-backed coverage currently includes:
- ingredient parsing + direction bolding regressions
- AU/US unit conversion behavior
- `####` section-sync grouping behavior
- shopping categorization regressions
