# Weekly Meal Shopper

Weekly Meal Shopper standardizes recipe notes, parses ingredient metadata, and generates a categorized shopping checklist from a meal-plan canvas.

The plugin ships with its own private starter templates inside the plugin folder. You do not need to configure Obsidian's Templates core plugin to use the recipe note or meal-prep canvas commands.

## First Start

On a fresh install, start here:

1. Open `Settings -> Weekly Meal Shopper`.
2. Go to `First-Time Setup` at the bottom of the settings page.
3. Click `Run First-Time Setup`.
4. Choose where the editable canvas template and editable recipe template should live in your vault.
5. The plugin will automatically populate both files from its bundled base templates.
6. Use `Open Canvas Template` and `Open Recipe Template` if you want to customize those editable vault copies before creating anything.

After that, the normal workflow is:

1. Run `Create weekly meal-prep canvas` to create a new weekly canvas from your editable canvas template.
2. Run `Create recipe note from template` whenever you want a new recipe note from your editable recipe template.
3. Add recipe file cards to the weekly canvas.
4. Run `Generate weekly shopping list from meal-plan canvas`.

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

On a fresh install, these files are already present in the plugin. `Run First-Time Setup` copies them into the editable vault paths you choose, and the creation commands use those editable vault copies.

## 5-Minute Quick Start

1. Open plugin settings and run `Run First-Time Setup`.
2. Choose where the editable recipe template and editable meal-prep canvas template should live in your vault.
3. Enable the `Basic` and `Meal Prep` features you want to use.
4. Set `Recipe folder`, `Transcribe recipes from image folder`, `Transcription output recipe folder`, and `Weekly meal-plan canvas`.
5. Run `Create weekly meal-prep canvas`.
6. Run `Create recipe note from template` whenever you want a new recipe note.
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

## Safety + Reliability

- Transcription API requests include retry/backoff for rate limits/server errors.
- URL transcription creates a fallback recipe template if transcription fails.
- Parsed ingredient metadata is cached by file mtime/size to avoid unnecessary re-parsing.

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
