# Weekly Meal Shopper

Weekly Meal Shopper standardizes recipe notes, parses ingredient metadata, creates weekly meal-prep canvases, and generates categorized shopping lists from those canvases.

The plugin ships with its own private starter templates inside the plugin folder. You do not need to configure Obsidian's Templates core plugin to use the recipe note or meal-prep canvas commands.

Support the project: [Buy Me a Coffee](https://buymeacoffee.com/tonyhad)

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

## Recipe Creation Workflow

1. Set `Recipe folder` and `Transcribe recipes from image folder`.
2. Use `Create recipe note from template` whenever you want a blank recipe note from your editable recipe template.
3. Use `Transcribe recipe from URL entry (website/YouTube)` when you want the plugin to turn a recipe page or video link into a recipe note.
4. Use `Transcribe recipes from image folder` when you want to batch-convert recipe screenshots or photos from your configured inbox folder.
5. URL and image transcription both save into the same `Recipe folder`.
6. Open the created recipe note and run `Standardize current recipe format` or `Populate ingredient metadata from recipe section` if you want to refresh formatting or parsed ingredient data manually.

Supported image inbox formats for folder transcription include `jpg/jpeg`, `png`, `webp`, `gif`, `bmp`, `heic/heif` (Apple Photos), `tif/tiff`, and `avif`.

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

## Template Files

Plugin-owned bundled template files:

- `.obsidian/plugins/weekly-meal-shopper/templates/recipe-template.md`
- `.obsidian/plugins/weekly-meal-shopper/templates/meal-prep-canvas-template.canvas`

On a fresh install, these files are already present in the plugin. `Run First-Time Setup` copies them into the editable vault paths you choose, and the creation commands use those editable vault copies.

## 5-Minute Quick Start

1. Open plugin settings and run `Run First-Time Setup`.
2. Choose where the editable recipe template and editable meal-prep canvas template should live in your vault.
3. Set `Recipe folder`, `Transcribe recipes from image folder`, and `Weekly meal-plan canvas`.
4. Run `Create weekly meal-prep canvas`.
5. Run `Create recipe note from template` whenever you want a new recipe note.
6. Open your canvas and place recipe file cards.
7. Run `Generate weekly shopping list from meal-plan canvas`.

Supported image inbox formats for folder transcription include `jpg/jpeg`, `png`, `webp`, `gif`, `bmp`, `heic/heif` (Apple Photos), `tif/tiff`, and `avif`.

### Expanded Walkthrough

1. Open plugin settings and run `Run First-Time Setup`.
2. Choose where the editable recipe template and editable meal-prep canvas template should live in your vault.
3. Set `Recipe folder`, `Transcribe recipes from image folder`, and `Weekly meal-plan canvas`. URL/image transcription saves into the same `Recipe folder`.
4. Run `Create weekly meal-prep canvas`.
5. Run `Create recipe note from template` whenever you want a new recipe note.
6. Open your canvas and place recipe file cards.
7. Run `Generate weekly shopping list from meal-plan canvas`.

Supported image inbox formats for folder transcription include `jpg/jpeg`, `png`, `webp`, `gif`, `bmp`, `heic/heif` (Apple Photos), `tif/tiff`, and `avif`.

## Recipe Parsing + Formatting

- Ingredients are parsed from the `### Ingredients` section.
- Parsed ingredient metadata is written to the frontmatter field `IngredientsParsed` by default.
- Ingredient formatting is configurable via template placeholders such as `{{Amount}}`, `{{Unit}}`, `{{Ingredient}}`, `{{Preparation}}`, and `{{PreparationSuffix}}`.
- Measurement presets include Vault Standard, Australian, US Customary, and custom mL values.
- Preference toggle supports weight-first conversion (`g` where density rules are available).
- Standardization keeps `type: Recipe`, fills in the expected recipe frontmatter fields, and normalizes the main recipe sections.

## Recipe View

- Split-pane recipe mode opens in the current tab.
- Left pane: ingredients with click-to-cross-off state.
- Right pane: directions with step focus box and Vim navigation (`j/k`, arrows).
- Subheading sync works across matching `####` sections between ingredients and directions.
- Ingredient highlighting can bold ingredients mentioned in the active step and visually sync matching ingredient groups.

## Shopping Lists + Meal Prep

- Weekly shopping lists are generated from recipe cards on your active or configured meal-plan canvas.
- Ingredient totals are aggregated across the canvas and grouped into shopping categories.
- Excluded ingredients and ingredient overrides can change what appears on the final shopping list.
- Frozen portions can be projected, inspected, and applied back to recipes through the meal-prep commands.
- Optional shopping-list annotations can show category reasons and one-click override links.
