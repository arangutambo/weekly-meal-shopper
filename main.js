const {
  Plugin,
  Notice,
  Modal,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
  MarkdownView,
  MarkdownRenderer,
  requestUrl,
  normalizePath,
  Platform,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  weeklyCanvasPath: "Utility/⛑️ Weekly Meal Plan.canvas",
  weeklyCanvasPath2: "",
  splitShoppingListByCanvas: false,
  // "canned" (default) leaves legumes as-is; "dried" converts canned/cooked
  // legumes to a dried-weight + ml shopping line for cooking from scratch.
  legumeShoppingMode: "canned",
  legumeGramsDriedPerCan: 85, // dried grams equivalent to one ~400 g can
  legumeCookedToDriedFactor: 0.4, // multiply a cooked/canned weight to get dried
  driedLegumeDensityGPerMl: 0.8, // dried-legume bulk density for the storage ml readout
  // Frozen portions older than this many days are flagged in the inventory
  // manager. 0 disables the warning.
  frozenStaleWarningDays: 90,
  mealPrepCanvasFolder: "Utility",
  mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas",
  shoppingListOutputPath: "Utility/🛒 Weekly Shopping List.md",
  recipeFolder: "pages/Food and Drink/Recipes",
  measurementPreset: "vault_standard",
  measurementPreference: "weight",
  convertLiquidVolumeMeasuresToWeight: true,
  cupMl: 250,
  tbspMl: 15,
  tspMl: 5,
  ingredientStorageSeparator: ";",
  recipeViewIngredientDisplayTemplate: "{{Amount}} {{Unit}} {{Ingredient}}{{PreparationSuffix}}",
  transcriptionMetricOutput: true,
  useStoredTranscriptionApiKey: false,
  parsedIngredientsField: "IngredientsParsed",
  excludedIngredientsExact: [
    "black pepper",
    "salt",
    "water",
  ],
  ingredientOverrides: [],
  transcriptionImageFolder: "Utility/Recipe Image Inbox",
  deleteTranscribedImages: true,
  transcriptionApiKey: "",
  transcriptionModel: "gpt-4.1-mini",
  recipeTemplateVaultPath: "Templates/Weekly Meal Shopper/Recipe Template.md",
  mealPrepCanvasTemplateVaultPath: "Templates/Weekly Meal Shopper/Meal Prep Canvas Template.canvas",
  showRecipeUsageInShoppingList: true,
  includeOverrideLinksInShoppingList: false,
  // Recipe card view (modal layout for planning)
  recipeCardSideColumnRegex: "Ingredients|Nutrition",
  recipeCardTreatH1AsFilename: false,
  recipeCardRenderUnicodeFractions: true,
  recipeCardSingleColumnMaxWidth: 760,
  // Macronutrient tracking (opt-in globally, then per-recipe via TrackMacros).
  macrosEnabled: false,
  energyUnit: "kcal", // "kcal" | "kJ" — independent of measurementPreference/measurementPreset
  // When on, an ingredient not found locally is looked up from an online
  // provider and the result cached to nutrition-live-cache.json so it never
  // needs a second network call.
  nutritionLiveLookupEnabled: false,
  nutritionLiveLookupProvider: "usda", // "usda" | "openfoodfacts"
  usdaApiKey: "", // free key from fdc.nal.usda.gov/api-key-signup, only used for live lookup
  // How many portions a single planned instance of a recipe needs to feed,
  // by default. Drives both weekly batch-scaling and the Meal Coverage
  // canvas overlay. Overridable per-recipe via frontmatter PortionsPerMeal.
  householdSize: 1,
  // Live coverage overlay + card coloring on the meal-plan canvas.
  mealCoverageEnabled: true,
  // Live per-day macro-totals overlay on the meal-plan canvas — a separate
  // panel from Meal Coverage. Off by default (depends on macrosEnabled +
  // per-recipe TrackMacros already being calculated, so it's low-value until
  // that's set up).
  macroDetailsEnabled: false,
  // Which weekday sits at the left edge of a newly created meal-plan canvas,
  // and the chronological reference point for coverage sorting / "cook again
  // before <day>" callouts.
  weekStartDay: "saturday",
  // Per-canvas set of recipe paths the user has clicked to acknowledge as
  // "needs cooking again, but that's fine" (red -> yellow). Auto-cleared once
  // a recipe's coverage naturally becomes fully covered again.
  coverageAcknowledgedShort: {},
  settingsSectionState: {
    firstTimeSetupCollapsed: false,
    mealPrepSetupCollapsed: false,
    recipeSetupCollapsed: false,
    recipeCardCollapsed: false,
    ingredientFormatCollapsed: false,
    recipeTranscriptionCollapsed: false,
    shoppingCategoriesCollapsed: false,
    excludeIngredientsCollapsed: false,
    ingredientOverridesCollapsed: false,
    nutritionSectionCollapsed: false,
  },
};

const RECIPE_TEMPLATE_PATH = ".obsidian/plugins/weekly-meal-shopper/templates/recipe-template.md";
const MEAL_PREP_CANVAS_TEMPLATE_PATH = ".obsidian/plugins/weekly-meal-shopper/templates/meal-prep-canvas-template.canvas";

// Community installs ship only main.js/manifest.json/styles.css, so the
// templates/ folder is absent on a fresh install. These embedded copies are
// written back to RECIPE_TEMPLATE_PATH / MEAL_PREP_CANVAS_TEMPLATE_PATH the
// first time a template is needed and the file is missing.
const BUNDLED_RECIPE_TEMPLATE_DEFAULT = `---
tags:
  - 🧠/🍽️/📄
CookTime:
PrepTime:
Portions:
IngredientRecipes: []
IngredientsParsed: []
Cost:
RecipeRating: 3
MealPrep: false
WeekDay: false
FrozenPortionsAvailable: 0
UseFrozenFirst: true
TrackMacros: false
type: Recipe
FoodType: Meal Item
Collection: []
Cover:
Link:
Day:
Time:
---
### Ingredients
-
---
### Directions
1.
---
### Notes

---
### Nutrition

---
### Log
\`\`\`dataview
TASK
WHERE icontains(text, this.file.name)
GROUP BY file.name
SORT file.link DESC
\`\`\`
---
### Tags
`;

const BUNDLED_MEAL_PREP_CANVAS_TEMPLATE_DEFAULT = `{
\t"nodes":[
\t\t{"id":"f90910c7a21fac32","type":"group","x":-640,"y":1800,"width":1830,"height":1960,"color":"5","label":"Projects"},
\t\t{"id":"9a70bf7a29cb915b","type":"group","x":1440,"y":1800,"width":1830,"height":1960,"color":"5","label":"Hosting"},
\t\t{"id":"0e4747ead5e72efb","type":"group","x":-960,"y":332,"width":4080,"height":308,"color":"4","label":"Dinner"},
\t\t{"id":"4edb456dd460d215","type":"group","x":-960,"y":720,"width":4080,"height":308,"color":"4","label":"Snack"},
\t\t{"id":"706a87e8d39193fd","type":"group","x":-960,"y":1180,"width":4080,"height":308,"color":"4","label":"Sweet"},
\t\t{"id":"8d9837dc8c89db79","type":"group","x":-960,"y":-480,"width":4080,"height":308,"color":"4","label":"Breakfast"},
\t\t{"id":"d0106717ed13c72d","type":"group","x":-960,"y":-74,"width":4080,"height":308,"color":"4","label":"Lunch"},
\t\t{"id":"1fe6a5460b2c2d9c","type":"group","x":940,"y":-508,"width":500,"height":2068,"color":"5","label":"Tuesday"},
\t\t{"id":"740e4f0faf2d822d","type":"group","x":1520,"y":-508,"width":480,"height":2068,"color":"5","label":"Wednesday"},
\t\t{"id":"bbfa0bcca3eac649","type":"group","x":2080,"y":-508,"width":480,"height":2068,"color":"5","label":"Thursday"},
\t\t{"id":"edfbe0316507be62","type":"group","x":-640,"y":-508,"width":480,"height":2068,"color":"5","label":"Saturday"},
\t\t{"id":"87dc9d1c686ac86b","type":"group","x":2640,"y":-508,"width":480,"height":2068,"color":"5","label":"Friday"},
\t\t{"id":"c8f5f4efc8049602","type":"group","x":-100,"y":-508,"width":460,"height":2068,"color":"5","label":"Sunday"},
\t\t{"id":"7d48176f6ea25397","type":"group","x":440,"y":-508,"width":440,"height":2068,"color":"5","label":"Monday"}
\t],
\t"edges":[],
\t"metadata":{
\t\t"version":"1.0-1.0",
\t\t"frontmatter":{},
\t\t"startNode":"8f08d5322459761d"
\t}
}
`;

function getBundledTemplateDefault(templatePath) {
  const normalized = String(templatePath || "").trim();
  if (normalized === RECIPE_TEMPLATE_PATH) return BUNDLED_RECIPE_TEMPLATE_DEFAULT;
  if (normalized === MEAL_PREP_CANVAS_TEMPLATE_PATH) return BUNDLED_MEAL_PREP_CANVAS_TEMPLATE_DEFAULT;
  return null;
}

function getIsoWeekInfo(inputDate = new Date()) {
  const date = new Date(inputDate);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const isoYear = date.getFullYear();
  const yearStart = new Date(isoYear, 0, 1);
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return {
    isoYear,
    week,
    weekPadded: String(week).padStart(2, "0"),
  };
}

const UNIT_DENSITY_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/unit-density-rules.json";
const UNIT_ALIAS_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/unit-aliases.json";
const NUTRITION_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-database.json";
// Written only by "Download nutrition dataset" — never auto-created empty.
const DOWNLOADED_NUTRITION_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-database-downloaded.json";
// Every successful live-lookup result is cached here so it never needs a
// second network call; merged on top of whichever primary source is active.
const LIVE_NUTRITION_CACHE_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-live-cache.json";
// User-set manual ingredient->macro matches (via "Set nutrition match for
// ingredient" / the Nutrition settings section). Highest priority of all —
// overrides win over the primary source AND the live cache.
const NUTRITION_OVERRIDES_PATH = ".obsidian/plugins/weekly-meal-shopper/nutrition-overrides.json";

const FRACTIONS = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
};

const BASE_UNIT_MAP = {
  g: { baseUnit: "g", factor: 1 },
  gram: { baseUnit: "g", factor: 1 },
  grams: { baseUnit: "g", factor: 1 },
  kg: { baseUnit: "g", factor: 1000 },
  kilogram: { baseUnit: "g", factor: 1000 },
  kilograms: { baseUnit: "g", factor: 1000 },
  mg: { baseUnit: "g", factor: 0.001 },
  milligram: { baseUnit: "g", factor: 0.001 },
  milligrams: { baseUnit: "g", factor: 0.001 },
  oz: { baseUnit: "g", factor: 28.35 },
  ounce: { baseUnit: "g", factor: 28.35 },
  ounces: { baseUnit: "g", factor: 28.35 },
  lb: { baseUnit: "g", factor: 453.59 },
  lbs: { baseUnit: "g", factor: 453.59 },
  pound: { baseUnit: "g", factor: 453.59 },
  pounds: { baseUnit: "g", factor: 453.59 },

  ml: { baseUnit: "ml", factor: 1 },
  milliliter: { baseUnit: "ml", factor: 1 },
  milliliters: { baseUnit: "ml", factor: 1 },
  millilitre: { baseUnit: "ml", factor: 1 },
  millilitres: { baseUnit: "ml", factor: 1 },
  l: { baseUnit: "ml", factor: 1000 },
  litre: { baseUnit: "ml", factor: 1000 },
  litres: { baseUnit: "ml", factor: 1000 },
  liter: { baseUnit: "ml", factor: 1000 },
  liters: { baseUnit: "ml", factor: 1000 },
  clove: { baseUnit: "unit", factor: 1 },
  cloves: { baseUnit: "unit", factor: 1 },
  piece: { baseUnit: "unit", factor: 1 },
  pieces: { baseUnit: "unit", factor: 1 },
  unit: { baseUnit: "unit", factor: 1 },
  units: { baseUnit: "unit", factor: 1 },
  egg: { baseUnit: "unit", factor: 1 },
  eggs: { baseUnit: "unit", factor: 1 },
  can: { baseUnit: "unit", factor: 1 },
  cans: { baseUnit: "unit", factor: 1 },
  handful: { baseUnit: "unit", factor: 1 },
  handfuls: { baseUnit: "unit", factor: 1 },
  pinch: { baseUnit: "unit", factor: 1 },
  pinches: { baseUnit: "unit", factor: 1 },
  stalk: { baseUnit: "unit", factor: 1 },
  stalks: { baseUnit: "unit", factor: 1 },
  rib: { baseUnit: "unit", factor: 1 },
  ribs: { baseUnit: "unit", factor: 1 },
  head: { baseUnit: "unit", factor: 1 },
  heads: { baseUnit: "unit", factor: 1 },
  bulb: { baseUnit: "unit", factor: 1 },
  bulbs: { baseUnit: "unit", factor: 1 },
  bunch: { baseUnit: "unit", factor: 1 },
  bunches: { baseUnit: "unit", factor: 1 },
  sprig: { baseUnit: "unit", factor: 1 },
  sprigs: { baseUnit: "unit", factor: 1 },
  jar: { baseUnit: "unit", factor: 1 },
  jars: { baseUnit: "unit", factor: 1 },
  tin: { baseUnit: "unit", factor: 1 },
  tins: { baseUnit: "unit", factor: 1 },
  packet: { baseUnit: "unit", factor: 1 },
  packets: { baseUnit: "unit", factor: 1 },
  package: { baseUnit: "unit", factor: 1 },
  packages: { baseUnit: "unit", factor: 1 },
  bottle: { baseUnit: "unit", factor: 1 },
  bottles: { baseUnit: "unit", factor: 1 },
  slice: { baseUnit: "unit", factor: 1 },
  slices: { baseUnit: "unit", factor: 1 },
  sheet: { baseUnit: "unit", factor: 1 },
  sheets: { baseUnit: "unit", factor: 1 },
};

const MEASUREMENT_PRESETS = {
  vault_standard: { cupMl: 250, tbspMl: 15, tspMl: 5 },
  australian: { cupMl: 250, tbspMl: 20, tspMl: 5 },
  us_customary: { cupMl: 236.59, tbspMl: 14.79, tspMl: 4.93 },
};

const WEIGHT_DENSITY_G_PER_ML = {
  water: 1,
  stock: 1.01,
  broth: 1.01,
  vinegar: 1.01,
  milk: 1.03,
  "oat milk": 1.03,
  "soy milk": 1.03,
  "almond milk": 1.01,
  "coconut milk": 1.01,
  "lemon juice": 1.03,
  "lime juice": 1.03,
  "orange juice": 1.04,
  oil: 0.92,
  "olive oil": 0.91,
  "sunflower oil": 0.92,
  "coconut oil": 0.92,
  butter: 0.96,
  yogurt: 1.03,
  yoghurt: 1.03,
  flour: 0.53,
  "all purpose flour": 0.53,
  "all-purpose flour": 0.53,
  "plain flour": 0.53,
  sugar: 0.85,
  "brown sugar": 0.93,
  honey: 1.42,
  "maple syrup": 1.37,
  syrup: 1.33,
  molasses: 1.4,
  salt: 1.2,

  // Nut butters and pastes (weigh well; measured by volume in recipes but bought by weight)
  "peanut butter": 0.96,
  "almond butter": 0.96,
  "cashew butter": 0.96,
  "sunflower seed butter": 0.95,
  "pumpkin seed butter": 0.95,
  "sesame paste": 0.95,
  "miso": 1.07,
  "miso paste": 1.07,
  "tomato paste": 1.08,
  "gochujang": 1.18,
  "doubanjiang": 1.12,
  // Note: liquid condiments (soy sauce, vinegar, fish sauce, etc.) are intentionally
  // NOT listed here so they fall through to tbsp/tsp display in humanizeVolumeUnit.

  // Dry goods that are often measured by volume but better shown by weight
  "tahini": 0.95,
  "rolled oats": 0.36,
  "oats": 0.36,
  "instant oats": 0.36,
  "quick oats": 0.36,
  "almond meal": 0.48,
  "almond flour": 0.48,
  "ground almonds": 0.48,
  "breadcrumbs": 0.35,
  "panko breadcrumbs": 0.22,
  "panko": 0.22,
  "nutritional yeast": 0.30,
  "desiccated coconut": 0.28,
  "shredded coconut": 0.28,
  "coconut flakes": 0.28,
  "sesame seeds": 0.57,
  "sunflower seeds": 0.57,
  "pumpkin seeds": 0.53,
  "chia seeds": 0.69,
  "flaxseeds": 0.69,
  "flax seeds": 0.69,
  "poppy seeds": 0.65,
  "cornstarch": 0.67,
  "corn starch": 0.67,
  "cornflour": 0.67,
  "arrowroot": 0.67,
  "baking powder": 0.90,
  "baking soda": 0.89,
  "bicarbonate of soda": 0.89,
  "cocoa powder": 0.33,
  "cacao powder": 0.33,
  "cocoa": 0.33,
  "icing sugar": 0.56,
  "powdered sugar": 0.56,
  "confectioners sugar": 0.56,
  "rice flour": 0.56,
  "buckwheat flour": 0.53,
  "chickpea flour": 0.49,
  "besan": 0.49,
  "spelt flour": 0.53,
  "whole wheat flour": 0.55,
  "wholemeal flour": 0.55,
  "tapioca starch": 0.67,
  "potato starch": 0.67,

  // Cooked / canned legumes and grains
  "cooked chickpeas": 0.72,
  "canned chickpeas": 0.72,
  "cooked lentils": 0.74,
  "red lentils": 0.74,
  "cooked rice": 0.81,
  "cooked quinoa": 0.77,
  "frozen peas": 0.60,
  "green peas": 0.60,
  "frozen green peas": 0.60,
  "frozen corn": 0.65,
  "frozen edamame": 0.65,
  "white beans": 0.72,
  "cannellini beans": 0.72,
  "borlotti beans": 0.72,
  "black beans": 0.72,
  "kidney beans": 0.72,
  "black-eyed peas": 0.72,
  "cooked beans": 0.72,
  "lentils": 0.74,

  // Fresh vegetables measured by volume
  "mushrooms": 0.33,
  "sliced mushrooms": 0.26,
  "diced mushrooms": 0.26,
  "bean sprouts": 0.085,

  // Nuts (measured by volume → weight)
  "walnuts": 0.52,
  "pecans": 0.46,
  "almonds": 0.59,
  "cashews": 0.65,
  "pine nuts": 0.67,
  "hazelnuts": 0.55,
  "pistachios": 0.55,
  "macadamia nuts": 0.55,
  "peanuts": 0.64,
  "roasted peanuts": 0.64,
  "chopped walnuts": 0.52,
  "chopped almonds": 0.59,
  "chopped pecans": 0.46,
  "soy crisps": 0.25,

  // Other
  "coarse salt": 1.22,
  "sea salt": 1.22,
  "kosher salt": 0.72,
};

const DEFAULT_UNIT_DENSITY_CONFIG = {
  densities: WEIGHT_DENSITY_G_PER_ML,
};

// Approximate per-100g macronutrient values (kcal, protein/carbs/fat in grams),
// sourced from public USDA FoodData Central figures. Not medical-grade —
// intended for recipe planning, not clinical dietary tracking. `gramsPerUnit`
// is optional and only present on ingredients commonly measured by count
// (e.g. "2 eggs"), used to convert a unit-based ingredient line to grams
// before looking up its per-100g macros.
const DEFAULT_NUTRITION_CONFIG = {
  source: "USDA FoodData Central (public domain), approximate per-100g values",
  entries: {
    // Protein
    "chicken breast": { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
    "chicken thigh": { kcal: 209, protein: 26, carbs: 0, fat: 10.9 },
    "ground beef": { kcal: 250, protein: 26, carbs: 0, fat: 15 },
    "beef steak": { kcal: 271, protein: 25, carbs: 0, fat: 19 },
    "pork chop": { kcal: 231, protein: 23, carbs: 0, fat: 14 },
    "bacon": { kcal: 541, protein: 37, carbs: 1.4, fat: 42 },
    "salmon": { kcal: 208, protein: 20, carbs: 0, fat: 13 },
    "tuna": { kcal: 116, protein: 26, carbs: 0, fat: 0.8 },
    "shrimp": { kcal: 99, protein: 24, carbs: 0.2, fat: 0.3 },
    "egg": { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, gramsPerUnit: 50 },
    "tofu": { kcal: 76, protein: 8, carbs: 1.9, fat: 4.8 },
    "tempeh": { kcal: 192, protein: 20, carbs: 7.6, fat: 11 },

    // Dairy
    "whole milk": { kcal: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
    "skim milk": { kcal: 34, protein: 3.4, carbs: 5, fat: 0.1 },
    "plain yogurt": { kcal: 61, protein: 3.5, carbs: 4.7, fat: 3.3 },
    "greek yogurt": { kcal: 97, protein: 9, carbs: 4, fat: 5 },
    "cheddar cheese": { kcal: 403, protein: 25, carbs: 1.3, fat: 33 },
    "mozzarella cheese": { kcal: 280, protein: 22, carbs: 2.2, fat: 22 },
    "parmesan cheese": { kcal: 392, protein: 35.8, carbs: 3.2, fat: 25.8 },
    "feta cheese": { kcal: 264, protein: 14.2, carbs: 4.1, fat: 21.3 },
    "cream cheese": { kcal: 342, protein: 6, carbs: 4, fat: 34 },
    "butter": { kcal: 717, protein: 0.9, carbs: 0.1, fat: 81 },
    "sour cream": { kcal: 198, protein: 2.4, carbs: 4.6, fat: 19.4 },
    "heavy cream": { kcal: 340, protein: 2.1, carbs: 2.8, fat: 36 },
    "cottage cheese": { kcal: 98, protein: 11, carbs: 3.4, fat: 4.3 },

    // Grains / starches
    "white rice": { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
    "brown rice": { kcal: 123, protein: 2.6, carbs: 25.6, fat: 1 },
    "quinoa": { kcal: 120, protein: 4.4, carbs: 21.3, fat: 1.9 },
    "pasta": { kcal: 131, protein: 5, carbs: 25, fat: 1.1 },
    "white bread": { kcal: 265, protein: 9, carbs: 49, fat: 3.2 },
    "whole wheat bread": { kcal: 247, protein: 13, carbs: 41, fat: 3.4 },
    "all-purpose flour": { kcal: 364, protein: 10.3, carbs: 76.3, fat: 1 },
    "whole wheat flour": { kcal: 340, protein: 13.7, carbs: 72, fat: 2.5 },
    "oats": { kcal: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
    "couscous": { kcal: 112, protein: 3.8, carbs: 23.2, fat: 0.2 },
    "corn tortilla": { kcal: 218, protein: 5.7, carbs: 44.9, fat: 2.9 },
    "cornmeal": { kcal: 370, protein: 8, carbs: 79, fat: 3.9 },

    // Legumes
    "chickpeas": { kcal: 139, protein: 7.9, carbs: 22.9, fat: 2.6 },
    "black beans": { kcal: 132, protein: 8.9, carbs: 23.7, fat: 0.5 },
    "kidney beans": { kcal: 127, protein: 8.7, carbs: 22.8, fat: 0.5 },
    "lentils": { kcal: 116, protein: 9, carbs: 20.1, fat: 0.4 },
    "split peas": { kcal: 118, protein: 8.3, carbs: 21.1, fat: 0.4 },
    "edamame": { kcal: 121, protein: 11.9, carbs: 8.9, fat: 5.2 },
    "soybeans": { kcal: 173, protein: 16.6, carbs: 9.9, fat: 9 },

    // Vegetables
    "onion": { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, gramsPerUnit: 110 },
    "garlic": { kcal: 149, protein: 6.4, carbs: 33.1, fat: 0.5, gramsPerUnit: 3 },
    "tomato": { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, gramsPerUnit: 123 },
    "potato": { kcal: 77, protein: 2, carbs: 17, fat: 0.1, gramsPerUnit: 173 },
    "sweet potato": { kcal: 86, protein: 1.6, carbs: 20.1, fat: 0.1, gramsPerUnit: 130 },
    "carrot": { kcal: 41, protein: 0.9, carbs: 9.6, fat: 0.2, gramsPerUnit: 61 },
    "broccoli": { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4 },
    "spinach": { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
    "kale": { kcal: 49, protein: 4.3, carbs: 8.8, fat: 0.9 },
    "bell pepper": { kcal: 31, protein: 1, carbs: 6, fat: 0.3, gramsPerUnit: 119 },
    "cucumber": { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
    "zucchini": { kcal: 17, protein: 1.2, carbs: 3.1, fat: 0.3 },
    "mushrooms": { kcal: 22, protein: 3.1, carbs: 3.3, fat: 0.3 },
    "cauliflower": { kcal: 25, protein: 1.9, carbs: 5, fat: 0.3 },
    "green beans": { kcal: 31, protein: 1.8, carbs: 7, fat: 0.2 },
    "corn": { kcal: 96, protein: 3.4, carbs: 21, fat: 1.5 },
    "peas": { kcal: 81, protein: 5.4, carbs: 14.5, fat: 0.4 },
    "celery": { kcal: 16, protein: 0.7, carbs: 3, fat: 0.2 },
    "eggplant": { kcal: 25, protein: 1, carbs: 6, fat: 0.2 },
    "cabbage": { kcal: 25, protein: 1.3, carbs: 5.8, fat: 0.1 },
    "lettuce": { kcal: 17, protein: 1.2, carbs: 3.3, fat: 0.3 },
    "avocado": { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7, gramsPerUnit: 200 },
    "pumpkin": { kcal: 26, protein: 1, carbs: 6.5, fat: 0.1 },
    "beetroot": { kcal: 43, protein: 1.6, carbs: 9.6, fat: 0.2 },
    "asparagus": { kcal: 20, protein: 2.2, carbs: 3.9, fat: 0.1 },
    "brussels sprouts": { kcal: 43, protein: 3.4, carbs: 8.9, fat: 0.3 },
    "leek": { kcal: 61, protein: 1.5, carbs: 14.2, fat: 0.3 },
    "ginger": { kcal: 80, protein: 1.8, carbs: 17.8, fat: 0.8 },
    "scallion": { kcal: 32, protein: 1.8, carbs: 7.3, fat: 0.2 },

    // Fruit
    "banana": { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3, gramsPerUnit: 118 },
    "apple": { kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2, gramsPerUnit: 182 },
    "orange": { kcal: 47, protein: 0.9, carbs: 11.8, fat: 0.1, gramsPerUnit: 131 },
    "lemon": { kcal: 29, protein: 1.1, carbs: 9.3, fat: 0.3, gramsPerUnit: 58 },
    "lime": { kcal: 30, protein: 0.7, carbs: 10.5, fat: 0.2, gramsPerUnit: 67 },
    "mandarin": { kcal: 53, protein: 0.8, carbs: 13.3, fat: 0.3, gramsPerUnit: 84 },
    "clementine": { kcal: 47, protein: 0.9, carbs: 12, fat: 0.2, gramsPerUnit: 74 },
    "strawberries": { kcal: 32, protein: 0.7, carbs: 7.7, fat: 0.3 },
    "blueberries": { kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3 },
    "grapes": { kcal: 69, protein: 0.7, carbs: 18.1, fat: 0.2 },
    "mango": { kcal: 60, protein: 0.8, carbs: 15, fat: 0.4 },
    "pineapple": { kcal: 50, protein: 0.5, carbs: 13.1, fat: 0.1 },
    "watermelon": { kcal: 30, protein: 0.6, carbs: 7.6, fat: 0.2 },
    "raisins": { kcal: 299, protein: 3.1, carbs: 79.2, fat: 0.5 },
    "dates": { kcal: 277, protein: 1.8, carbs: 75, fat: 0.2 },

    // Nuts, seeds, oils
    "olive oil": { kcal: 884, protein: 0, carbs: 0, fat: 100 },
    "vegetable oil": { kcal: 884, protein: 0, carbs: 0, fat: 100 },
    "coconut oil": { kcal: 892, protein: 0, carbs: 0, fat: 99 },
    "sesame oil": { kcal: 884, protein: 0, carbs: 0, fat: 100 },
    "almonds": { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9 },
    "walnuts": { kcal: 654, protein: 15.2, carbs: 13.7, fat: 65.2 },
    "cashews": { kcal: 553, protein: 18.2, carbs: 30.2, fat: 43.9 },
    "peanuts": { kcal: 567, protein: 25.8, carbs: 16.1, fat: 49.2 },
    "peanut butter": { kcal: 588, protein: 25, carbs: 20, fat: 50 },
    "tahini": { kcal: 595, protein: 17, carbs: 21, fat: 53.8 },
    "chia seeds": { kcal: 486, protein: 16.5, carbs: 42.1, fat: 30.7 },
    "flaxseeds": { kcal: 534, protein: 18.3, carbs: 28.9, fat: 42.2 },
    "sunflower seeds": { kcal: 584, protein: 20.8, carbs: 20, fat: 51.5 },
    "pumpkin seeds": { kcal: 559, protein: 30.2, carbs: 10.7, fat: 49 },

    // Plant milks / canned
    "almond milk": { kcal: 17, protein: 0.6, carbs: 0.6, fat: 1.2 },
    "soy milk": { kcal: 33, protein: 2.9, carbs: 1.8, fat: 1.6 },
    "oat milk": { kcal: 47, protein: 1, carbs: 7.5, fat: 1.5 },
    "coconut milk": { kcal: 230, protein: 2.3, carbs: 5.5, fat: 24 },
    "coconut cream": { kcal: 330, protein: 3.6, carbs: 6.7, fat: 34.7 },

    // Sweeteners
    "sugar": { kcal: 387, protein: 0, carbs: 100, fat: 0 },
    "brown sugar": { kcal: 380, protein: 0, carbs: 98, fat: 0 },
    "honey": { kcal: 304, protein: 0.3, carbs: 82.4, fat: 0 },
    "maple syrup": { kcal: 260, protein: 0, carbs: 67, fat: 0.2 },

    // Condiments / misc
    "ketchup": { kcal: 101, protein: 1.2, carbs: 25.6, fat: 0.1 },
    "mayonnaise": { kcal: 680, protein: 1, carbs: 0.6, fat: 75 },
    "mustard": { kcal: 66, protein: 4.4, carbs: 5.8, fat: 3.3 },
    "tomato paste": { kcal: 82, protein: 4.3, carbs: 18.9, fat: 0.5 },
    "soy sauce": { kcal: 53, protein: 8, carbs: 4.9, fat: 0.6 },
    "vinegar": { kcal: 18, protein: 0, carbs: 0.4, fat: 0 },
    "breadcrumbs": { kcal: 395, protein: 13, carbs: 72, fat: 5.3 },
    "cornstarch": { kcal: 381, protein: 0.3, carbs: 91.3, fat: 0.1 },

    // Spices / herbs
    "black pepper": { kcal: 251, protein: 10.4, carbs: 64, fat: 3.3 },
    "salt": { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    "cumin": { kcal: 375, protein: 17.8, carbs: 44.2, fat: 22.3 },
    "paprika": { kcal: 282, protein: 14.1, carbs: 54, fat: 12.9 },
    "cinnamon": { kcal: 247, protein: 4, carbs: 80.6, fat: 1.2 },
    "turmeric": { kcal: 312, protein: 9.7, carbs: 67.1, fat: 3.3 },
    "chili powder": { kcal: 282, protein: 13.5, carbs: 49.7, fat: 14.3 },
    "oregano": { kcal: 265, protein: 9, carbs: 68.9, fat: 4.3 },
    "basil": { kcal: 22, protein: 3.2, carbs: 2.6, fat: 0.6 },
    "parsley": { kcal: 36, protein: 3, carbs: 6.3, fat: 0.8 },
    "cilantro": { kcal: 23, protein: 2.1, carbs: 3.7, fat: 0.5 },
    "thyme": { kcal: 101, protein: 5.6, carbs: 24.5, fat: 1.7 },
    "rosemary": { kcal: 131, protein: 3.3, carbs: 20.7, fat: 5.9 },
  },
};

const DEFAULT_UNIT_ALIAS_CONFIG = {
  cup: [],
  tbsp: [],
  tsp: [],
};

// Volume-unit aliases that are always recognized, independent of the user's
// unit-aliases.json. Single source of truth for both unit-map construction and
// the settings "Unit aliases" summary.
const BUILTIN_VOLUME_UNIT_ALIASES = {
  cup: ["cup", "cups"],
  tbsp: ["tbsp", "tbs", "tablespoon", "tablespoons"],
  tsp: ["tsp", "teaspoon", "teaspoons"],
};

function resolveMeasurementProfile(settings) {
  const presetKey = String(settings?.measurementPreset || "vault_standard").trim().toLowerCase();
  const preset = MEASUREMENT_PRESETS[presetKey] || MEASUREMENT_PRESETS.vault_standard;
  const readMl = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : fallback;
  };
  const cupMl = readMl(settings?.cupMl, preset.cupMl);
  const tbspMl = readMl(settings?.tbspMl, preset.tbspMl);
  const tspMl = readMl(settings?.tspMl, preset.tspMl);
  return {
    presetKey,
    cupMl,
    tbspMl,
    tspMl,
    labels: { cup: "cup", tbsp: "tbsp", tsp: "tsp" },
  };
}

function canonicalVolumeUnit(rawUnit) {
  const unit = normalizeSearchText(String(rawUnit || "").replace(/\.$/, ""));
  if (!unit) return "";
  if (["cup", "cups", "c"].includes(unit)) return "cup";
  if (["tbsp", "tbs", "tablespoon", "tablespoons"].includes(unit)) return "tbsp";
  if (["tsp", "teaspoon", "teaspoons"].includes(unit)) return "tsp";
  return "";
}

function formatVolumeUnitLabel(canonical, amount, outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels) {
  if (canonical === "cup") {
    return Math.abs(Number(amount || 0) - 1) < 1e-9 ? "cup" : "cups";
  }
  if (canonical && outputLabels?.[canonical]) return outputLabels[canonical];
  return canonical || "";
}

function buildUnitMapFromProfile(profile) {
  const map = { ...BASE_UNIT_MAP };
  const cupSpec = { baseUnit: "ml", factor: profile.cupMl };
  const tbspSpec = { baseUnit: "ml", factor: profile.tbspMl };
  const tspSpec = { baseUnit: "ml", factor: profile.tspMl };

  const addAliases = (aliases, spec) => {
    for (const alias of aliases) {
      const key = normalizeSearchText(alias);
      if (key) map[key] = spec;
    }
  };

  addAliases([...BUILTIN_VOLUME_UNIT_ALIASES.cup, profile.labels.cup], cupSpec);
  addAliases([...BUILTIN_VOLUME_UNIT_ALIASES.tbsp, profile.labels.tbsp], tbspSpec);
  addAliases([...BUILTIN_VOLUME_UNIT_ALIASES.tsp, profile.labels.tsp], tspSpec);
  addAliases(ACTIVE_EXTRA_UNIT_ALIASES.cup, cupSpec);
  addAliases(ACTIVE_EXTRA_UNIT_ALIASES.tbsp, tbspSpec);
  addAliases(ACTIVE_EXTRA_UNIT_ALIASES.tsp, tspSpec);

  return map;
}

let ACTIVE_EXTRA_UNIT_ALIASES = { ...DEFAULT_UNIT_ALIAS_CONFIG };
let ACTIVE_MEASUREMENT_PROFILE = resolveMeasurementProfile({
  measurementPreset: "vault_standard",
  measurementPreference: "weight",
  cupMl: 250,
  tbspMl: 15,
  tspMl: 5,
});
let ACTIVE_UNIT_MAP = buildUnitMapFromProfile(ACTIVE_MEASUREMENT_PROFILE);
let ACTIVE_MEASUREMENT_PREFERENCE = "weight";
let ACTIVE_CONVERT_LIQUID_VOLUME_TO_WEIGHT = true;
let ACTIVE_ENERGY_UNIT = "kcal";
const KCAL_TO_KJ = 4.184;
const STRUCTURED_INGREDIENT_SEPARATORS = [";", ",", ":", "|"];
const DEFAULT_INGREDIENT_STORAGE_SEPARATOR = ";";
const DEFAULT_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE = "{{Amount}} {{Unit}} {{Ingredient}}{{PreparationSuffix}}";
let ACTIVE_INGREDIENT_STORAGE_SEPARATOR = DEFAULT_INGREDIENT_STORAGE_SEPARATOR;
let ACTIVE_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE = DEFAULT_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE;

// Tunable conversion factors for the dried-legume mode. Defaults here; each is
// overridable via the matching setting (legumeGramsDriedPerCan /
// legumeCookedToDriedFactor / driedLegumeDensityGPerMl).
const LEGUME_GRAMS_DRIED_PER_CAN = 85; // a 400 g can drained ≈ 85 g dried
const LEGUME_COOKED_TO_DRIED_FACTOR = 0.4; // cooked/canned weight × 0.4 ≈ dried weight
const DRIED_LEGUME_DENSITY_G_PER_ML = 0.8; // bulk density for the storage-volume readout

function positiveNumberOr(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

// Pure batch-scaling math shared by getRecipePlanningProfile and the Meal
// Coverage canvas overlay. portionsPerMeal is normally settings.householdSize
// (how many portions one planned instance needs to feed).
function computePlanningProfile({ portionsPerCook, portionsPerMeal, frozenAvailable, useFrozenFirst, plannedInstances }) {
  const plannedPortions = plannedInstances * portionsPerMeal;
  const frozenUsed = useFrozenFirst ? Math.min(frozenAvailable, plannedPortions) : 0;
  const portionsNeedingCook = Math.max(0, plannedPortions - frozenUsed);
  const cooksNeeded = portionsNeedingCook > 0 ? Math.ceil(portionsNeedingCook / portionsPerCook) : 0;
  const cookedPortions = cooksNeeded * portionsPerCook;
  const projectedFrozen = Math.max(0, frozenAvailable - frozenUsed + Math.max(0, cookedPortions - portionsNeedingCook));

  return {
    portionsPerCook,
    portionsPerMeal,
    frozenAvailable,
    useFrozenFirst,
    plannedPortions,
    frozenUsed,
    portionsNeedingCook,
    cooksNeeded,
    projectedFrozen,
  };
}

// "covered" = a single cook this week satisfies everything currently planned
// for this recipe (cooksNeeded <= 1); "short" = you'll need to cook it more
// than once this week to meet the plan.
function classifyMealCoverageStatus(profile) {
  return profile && profile.cooksNeeded > 1 ? "short" : "covered";
}

// Display-tier sort order for the Meal Coverage panel: red (unacknowledged
// short) always first, then yellow (acknowledged short), then green.
const COVERAGE_STATUS_ORDER = { red: 0, yellow: 1, green: 2 };

// Accepts either raw settings (legume* keys) or short opts (gramsDriedPerCan …)
// and returns the resolved factor object used by the legume conversion.
function resolveLegumeFactors(source = {}) {
  const src = source || {};
  return {
    gramsDriedPerCan: positiveNumberOr(src.legumeGramsDriedPerCan ?? src.gramsDriedPerCan, LEGUME_GRAMS_DRIED_PER_CAN),
    cookedToDriedFactor: positiveNumberOr(src.legumeCookedToDriedFactor ?? src.cookedToDriedFactor, LEGUME_COOKED_TO_DRIED_FACTOR),
    densityGPerMl: positiveNumberOr(src.driedLegumeDensityGPerMl ?? src.densityGPerMl, DRIED_LEGUME_DENSITY_G_PER_ML),
  };
}

let ACTIVE_LEGUME_SHOPPING_MODE = "canned";
let ACTIVE_LEGUME_FACTORS = resolveLegumeFactors();

function normalizeMeasurementPreference(value) {
  const pref = normalizeSearchText(value);
  if (pref === "volume") return "volume";
  if (pref === "both") return "both";
  return "weight";
}

function shouldPreferWeightMeasurements(preference) {
  const pref = normalizeMeasurementPreference(preference);
  return pref === "weight" || pref === "both";
}

// Independent of measurementPreference/measurementPreset — those only affect
// volume/weight display, this only affects how energy (kcal/kJ) is shown.
function normalizeEnergyUnit(value) {
  const unit = normalizeSearchText(value);
  return unit === "kj" ? "kJ" : "kcal";
}

// Macro values are always cached in frontmatter as kcal; this is the only
// place kcal<->kJ conversion happens, applied at render/display time.
function convertKcalToDisplayEnergy(kcal, unit = ACTIVE_ENERGY_UNIT) {
  const num = Number(kcal);
  if (!Number.isFinite(num)) return 0;
  return normalizeEnergyUnit(unit) === "kJ" ? num * KCAL_TO_KJ : num;
}

function normalizeNutritionLiveLookupProvider(value) {
  const v = normalizeSearchText(value);
  return v === "openfoodfacts" ? "openfoodfacts" : "usda";
}

function setActiveMeasurementProfile(settings) {
  ACTIVE_MEASUREMENT_PROFILE = resolveMeasurementProfile(settings);
  ACTIVE_UNIT_MAP = buildUnitMapFromProfile(ACTIVE_MEASUREMENT_PROFILE);
  ACTIVE_MEASUREMENT_PREFERENCE = normalizeMeasurementPreference(settings?.measurementPreference);
  ACTIVE_CONVERT_LIQUID_VOLUME_TO_WEIGHT = settings?.convertLiquidVolumeMeasuresToWeight !== false;
  ACTIVE_LEGUME_SHOPPING_MODE = settings?.legumeShoppingMode === "dried" ? "dried" : "canned";
  ACTIVE_LEGUME_FACTORS = resolveLegumeFactors(settings || {});
  ACTIVE_ENERGY_UNIT = normalizeEnergyUnit(settings?.energyUnit);
}

function normalizeUnitAliasConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const normalizeList = (value) => {
    const values = Array.isArray(value) ? value : [];
    return [...new Set(values.map((v) => normalizeSingleLineText(v)).filter(Boolean))];
  };

  return {
    cup: normalizeList(src.cup),
    tbsp: normalizeList(src.tbsp),
    tsp: normalizeList(src.tsp),
  };
}

// Produces a display-friendly view of the active unit aliases for the settings
// tab: built-in aliases plus any custom aliases from unit-aliases.json (with
// custom entries that merely repeat a built-in filtered out).
function buildUnitAliasSummary(extraAliases = ACTIVE_EXTRA_UNIT_ALIASES) {
  const extra = normalizeUnitAliasConfig(extraAliases);
  return Object.keys(BUILTIN_VOLUME_UNIT_ALIASES).map((unit) => {
    const builtIn = [...BUILTIN_VOLUME_UNIT_ALIASES[unit]];
    const builtInSet = new Set(builtIn.map((alias) => normalizeSearchText(alias)));
    const custom = (extra[unit] || []).filter(
      (alias) => !builtInSet.has(normalizeSearchText(alias))
    );
    return { unit, builtIn, custom };
  });
}

function normalizeIngredientStorageSeparator(separator) {
  const raw = String(separator || "").trim();
  return STRUCTURED_INGREDIENT_SEPARATORS.includes(raw) ? raw : DEFAULT_INGREDIENT_STORAGE_SEPARATOR;
}

function setActiveIngredientStorageSeparator(separator) {
  ACTIVE_INGREDIENT_STORAGE_SEPARATOR = normalizeIngredientStorageSeparator(separator);
}

function normalizeRecipeViewIngredientDisplayTemplate(template) {
  const raw = normalizeSingleLineText(template);
  if (!raw || !/{{\s*ingredient\s*}}/i.test(raw)) {
    return DEFAULT_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE;
  }
  return raw;
}

function setActiveRecipeViewIngredientDisplayTemplate(template) {
  ACTIVE_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE = normalizeRecipeViewIngredientDisplayTemplate(template);
}

function buildDensityEntries(mapLike) {
  const source = mapLike && typeof mapLike === "object" ? mapLike : WEIGHT_DENSITY_G_PER_ML;
  return Object.entries(source)
    .map(([pattern, density]) => [normalizeSearchText(pattern), Number(density)])
    .filter(([pattern, density]) => !!pattern && Number.isFinite(density) && density > 0)
    .sort((a, b) => b[0].length - a[0].length);
}
let WEIGHT_DENSITY_ENTRIES = buildDensityEntries(WEIGHT_DENSITY_G_PER_ML);

function estimateIngredientDensityGPerMl(name) {
  const text = normalizeSearchText(name);
  if (!text) return null;
  for (const [pattern, density] of WEIGHT_DENSITY_ENTRIES) {
    if (text.includes(pattern)) return density;
  }
  return null;
}

// Same canonical-name/substring-matching approach as density lookups, so
// alias/normalization improvements made for one benefit the other for free.
function buildNutritionEntries(config) {
  const entries = config && typeof config === "object" ? config.entries : null;
  const source = entries && typeof entries === "object" ? entries : DEFAULT_NUTRITION_CONFIG.entries;
  return Object.entries(source)
    .map(([pattern, macros]) => [normalizeSearchText(pattern), macros])
    .filter(([pattern, macros]) => !!pattern && macros && typeof macros === "object" && Number.isFinite(Number(macros.kcal)))
    .sort((a, b) => b[0].length - a[0].length);
}
let NUTRITION_ENTRIES = buildNutritionEntries(DEFAULT_NUTRITION_CONFIG);

// Returns { kcal, protein, carbs, fat, gramsPerUnit? } per 100g, or null if no
// entry matches. Never guesses — callers must treat null as "no data".
function estimateIngredientMacrosPer100g(name) {
  const text = normalizeSearchText(name);
  if (!text) return null;
  for (const [pattern, macros] of NUTRITION_ENTRIES) {
    if (text.includes(pattern)) return macros;
  }

  // Word-overlap fallback: official USDA bulk-dataset descriptions (e.g.
  // "chicken broiler or fryers breast skinless boneless meat only cooked
  // braised") are longer and differently-ordered than what a user actually
  // types ("chicken breast"), so the substring check above — which assumes
  // the dataset key is a short phrase CONTAINED IN the ingredient text —
  // never matches them. Fall back to: every word the user typed appears
  // somewhere among the pattern's words, in any order. NUTRITION_ENTRIES is
  // sorted longest-pattern-first, so among equally-valid word-overlap
  // matches the most specific (longest) one wins.
  const textWords = text.split(" ").filter(Boolean);
  if (textWords.length === 0) return null;
  for (const [pattern, macros] of NUTRITION_ENTRIES) {
    const patternWords = pattern.split(" ");
    if (textWords.every((word) => patternWords.includes(word))) return macros;
  }
  return null;
}

// Extensible registry of external nutrition providers for live lookup and/or
// bulk download. supportsDownload/requiresApiKeyForLookup drive which
// settings controls are shown for each in renderNutritionSettingsSection.
const NUTRITION_PROVIDERS = {
  usda: { name: "USDA FoodData Central", supportsDownload: true, requiresApiKeyForLookup: true },
  openfoodfacts: { name: "Open Food Facts", supportsDownload: false, requiresApiKeyForLookup: false },
};

// USDA nutrient ids are stable across records (unlike nutrientName text, which
// can vary slightly) — 1003 protein, 1004 fat, 1005 carbohydrate, 1008 energy.
const USDA_NUTRIENT_IDS = { protein: 1003, fat: 1004, carbs: 1005, kcal: 1008 };

// Pure: extracts {kcal,protein,carbs,fat} from one USDA search-API food
// result's foodNutrients array (flat nutrientId/value shape), or null. Split
// out from lookupIngredientMacrosFromUsda so the parsing logic is directly
// testable without mocking requestUrl.
function extractUsdaSearchResultMacros(foodNutrients) {
  if (!Array.isArray(foodNutrients)) return null;
  const byId = new Map();
  for (const n of foodNutrients) {
    const id = Number(n?.nutrientId);
    const value = Number(n?.value);
    if (Number.isFinite(id) && Number.isFinite(value)) byId.set(id, value);
  }
  const kcal = byId.get(USDA_NUTRIENT_IDS.kcal);
  if (!Number.isFinite(kcal)) return null;
  return {
    kcal,
    protein: byId.get(USDA_NUTRIENT_IDS.protein) || 0,
    carbs: byId.get(USDA_NUTRIENT_IDS.carbs) || 0,
    fat: byId.get(USDA_NUTRIENT_IDS.fat) || 0,
  };
}

// Looks up one ingredient's per-100g macros from USDA FoodData Central's live
// search API (https://api.nal.usda.gov/fdc/v1/foods/search). Returns null on
// any failure (no results, network error, unexpected shape) — never throws,
// matching estimateIngredientMacrosPer100g's "null means not found" contract.
async function lookupIngredientMacrosFromUsda(name, apiKey) {
  const query = String(name || "").trim();
  const key = String(apiKey || "").trim();
  if (!query || !key) return null;

  let response;
  try {
    response = await requestUrl({
      url: `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(query)}&pageSize=1`,
      method: "GET",
    });
  } catch {
    return null;
  }

  return extractUsdaSearchResultMacros(response?.json?.foods?.[0]?.foodNutrients);
}

// Pure: extracts {kcal,protein,carbs,fat} from an Open Food Facts product's
// "nutriments" object, or null. Split out for the same testability reason as
// extractUsdaSearchResultMacros above.
function extractOpenFoodFactsMacros(nutriments) {
  if (!nutriments) return null;
  const kcal = Number(nutriments["energy-kcal_100g"]);
  if (!Number.isFinite(kcal)) return null;
  return {
    kcal,
    protein: Number(nutriments["proteins_100g"]) || 0,
    carbs: Number(nutriments["carbohydrates_100g"]) || 0,
    fat: Number(nutriments["fat_100g"]) || 0,
  };
}

// Looks up one ingredient's per-100g macros from Open Food Facts' free text
// search (no API key needed). Note: Open Food Facts is a branded/packaged-
// product database, not a generic-ingredient composition table, so a plain
// ingredient name (e.g. "olive oil") matches whichever specific product
// ranked first — less reliable than USDA for raw ingredients, offered because
// it needs no API key signup.
async function lookupIngredientMacrosFromOpenFoodFacts(name) {
  const query = String(name || "").trim();
  if (!query) return null;

  let response;
  try {
    response = await requestUrl({
      url: `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=1`,
      method: "GET",
    });
  } catch {
    return null;
  }

  return extractOpenFoodFactsMacros(response?.json?.products?.[0]?.nutriments);
}

// USDA republishes bulk datasets periodically with a new date in the
// filename (checked at fdc.nal.usda.gov/download-datasets) — update this
// constant if downloads start failing with a 404.
const FOUNDATION_FOODS_ZIP_URL = "http://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip";
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;

// Extracts and decompresses the first file entry from a ZIP archive buffer.
// Handles the common case (compression method 0 = stored or 8 = deflate;
// sizes present directly in the local file header, not a trailing streamed
// data descriptor). Throws a descriptive error on anything else so a
// failure is diagnosable rather than silently returning garbage — desktop
// only (needs Node's zlib for DEFLATE, unavailable on mobile).
function extractFirstFileFromZip(buffer) {
  if (buffer.length < 30 || buffer.readUInt32LE(0) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Not a recognizable ZIP file (missing local file header signature).");
  }
  const generalPurposeFlag = buffer.readUInt16LE(6);
  if (generalPurposeFlag & 0x08) {
    throw new Error("ZIP entry uses a streamed data descriptor, which isn't supported.");
  }
  const compressionMethod = buffer.readUInt16LE(8);
  const compressedSize = buffer.readUInt32LE(18);
  const fileNameLength = buffer.readUInt16LE(26);
  const extraFieldLength = buffer.readUInt16LE(28);
  const dataStart = 30 + fileNameLength + extraFieldLength;
  const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

  if (compressionMethod === 0) return compressedData;
  if (compressionMethod === 8) return require("zlib").inflateRawSync(compressedData);
  throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
}

// USDA's bulk JSON export nests nutrients as foodNutrients[].nutrient.{id} +
// .amount — a different shape from the live search API's flat
// nutrientId/value (main.js's lookupIngredientMacrosFromUsda). Handled
// defensively since the bulk shape wasn't directly inspectable ahead of
// time — tries both the nested and flat field names.
function extractUsdaBulkFoodMacros(foodNutrients) {
  if (!Array.isArray(foodNutrients)) return null;
  const byId = new Map();
  for (const entry of foodNutrients) {
    const id = Number(entry?.nutrient?.id ?? entry?.nutrientId);
    const value = Number(entry?.amount ?? entry?.value);
    if (Number.isFinite(id) && Number.isFinite(value)) byId.set(id, value);
  }
  const kcal = byId.get(USDA_NUTRIENT_IDS.kcal);
  if (!Number.isFinite(kcal)) return null;
  return {
    kcal,
    protein: byId.get(USDA_NUTRIENT_IDS.protein) || 0,
    carbs: byId.get(USDA_NUTRIENT_IDS.carbs) || 0,
    fat: byId.get(USDA_NUTRIENT_IDS.fat) || 0,
  };
}

// Parses a USDA bulk-download JSON payload (e.g. Foundation Foods) into our
// { source, entries: { name: {kcal,protein,carbs,fat} } } shape. The
// top-level key varies by dataset (FoundationFoods, SRLegacyFoods, ...) —
// use whichever array-valued top-level key is present.
function parseUsdaBulkDatasetToNutritionConfig(parsedJson) {
  const foodsArray = Object.values(parsedJson || {}).find((v) => Array.isArray(v));
  const entries = {};
  for (const food of foodsArray || []) {
    const name = normalizeSearchText(food?.description);
    if (!name) continue;
    const macros = extractUsdaBulkFoodMacros(food?.foodNutrients);
    if (!macros) continue;
    entries[name] = macros;
  }
  return { source: "USDA FoodData Central (downloaded)", entries };
}

function isLikelyLiquidIngredient(name) {
  const text = normalizeSearchText(name);
  if (!text) return false;
  return /\b(water|stock|broth|vinegar|milk|juice|oil|yogurt|yoghurt|syrup|molasses|honey|brine)\b/.test(text);
}

function applyMeasurementPreferenceToParsedItem(
  parsed,
  { preferWeight = shouldPreferWeightMeasurements(ACTIVE_MEASUREMENT_PREFERENCE) } = {}
) {
  if (!parsed || typeof parsed !== "object") return parsed;
  if (parsed.unitMetric !== "ml") return parsed;
  const explicitVolumeUnit = canonicalVolumeUnit(parsed.unit);
  const autoConvertLiquidVolume = ACTIVE_CONVERT_LIQUID_VOLUME_TO_WEIGHT
    && !!explicitVolumeUnit
    && isLikelyLiquidIngredient(parsed.name);
  if (!preferWeight && !autoConvertLiquidVolume) return parsed;
  const density = estimateIngredientDensityGPerMl(parsed.name);
  if (!Number.isFinite(density) || density <= 0) return parsed;
  const grams = Math.round(Number(parsed.amountMetric || 0) * density);
  if (!Number.isFinite(grams) || grams <= 0) return parsed;
  return {
    ...parsed,
    amountMetric: grams,
    unitMetric: "g",
  };
}

const PREPARATION_ONLY_WORDS = new Set([
  "peeled",
  "seeded",
  "deseeded",
  "de-seeded",
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "crushed",
  "zested",
  "juiced",
  "drained",
  "rinsed",
  "softened",
  "melted",
  "thawed",
  "pitted",
  "cored",
]);

const TRAILING_PREPARATION_PHRASES = [
  "drained and rinsed",
  "rinsed and drained",
  "roughly chopped",
  "finely chopped",
  "coarsely chopped",
  "roughly diced",
  "finely diced",
  "finely sliced",
  "thinly sliced",
  "finely grated",
  "roughly grated",
  "lightly beaten",
  "room temperature",
  "to serve",
  "for serving",
  "for garnish",
  "as needed",
  "to taste",
  "optional",
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "crushed",
  "peeled",
  "zested",
  "juiced",
  "drained",
  "rinsed",
  "softened",
  "melted",
  "thawed",
  "pitted",
  "cored",
  "beaten",
].sort((a, b) => b.length - a.length);

const INGREDIENT_DESCRIPTOR_WORDS = new Set([
  "all",
  "brown",
  "canned",
  "extra",
  "fine",
  "finely",
  "fresh",
  "freshly",
  "large",
  "medium",
  "neutral",
  "neutralflavored",
  "optional",
  "organic",
  "pure",
  "ripe",
  "small",
  "squeezed",
  "very",
]);

const GENERIC_INGREDIENT_SINGLE_WORDS = new Set([
  "baking",
  "broth",
  "extract",
  "juice",
  "milk",
  "oil",
  "paste",
  "powder",
  "sauce",
  "seasoning",
  "stock",
  "sugar",
  "vinegar",
  "water",
]);

const INGREDIENT_CONNECTOR_WORDS = new Set([
  "and",
  "or",
]);

// Fresh herbs that should be displayed as "N bunch" in the shopping list
// regardless of how they were measured in the recipe.
const HERB_BUNCH_INGREDIENTS = new Set([
  "parsley",
  "flat leaf parsley",
  "flat-leaf parsley",
  "curly parsley",
  "coriander",
  "cilantro",
  "coriander leaves",
  "basil",
  "fresh basil",
  "mint",
  "fresh mint",
  "dill",
  "chives",
  "tarragon",
  "sage",
  "rosemary",
  "thyme",
  "fresh thyme",
  "oregano",
  "fresh oregano",
  "lemongrass",
  "spring onions",
  "green onions",
  "scallions",
  "baby arugula",
  "arugula",
  "rocket",
  "baby spinach",
  "spinach",
  "watercress",
  "kale",
  "silverbeet",
  "chard",
  "swiss chard",
]);

// Culinary herbs that are sold in both fresh and dried forms. Used to route
// "dried <herb>" to the spice section and "fresh <herb>" to fresh produce,
// regardless of whether a per-herb rule exists. Deliberately excludes leafy
// greens (spinach, kale, …) that only come fresh.
const CULINARY_HERBS = new Set([
  "basil",
  "oregano",
  "thyme",
  "rosemary",
  "sage",
  "parsley",
  "coriander",
  "cilantro",
  "mint",
  "dill",
  "chive",
  "tarragon",
  "marjoram",
  "chervil",
  "bay leaf",
  "bay leaves",
  "lemongrass",
]);

// How many ml of a herb corresponds to one "bunch" for shopping purposes.
// 1 bunch of most fresh herbs yields roughly 1 cup (250ml) usable leaves.
const HERB_BUNCH_ML = 250;

const SHOPPING_CATEGORY_ORDER = [
  "Cheese",
  "Fresh Fruit and Vegetables",
  "Pantry Staples",
  "Protein",
  "Spices and Seasoning",
  "Dairy and Refrigerated",
  "Bakery",
  "Frozen",
  "Other",
];
const INGREDIENT_CATEGORY_CONFIG_PATH = ".obsidian/plugins/weekly-meal-shopper/ingredient-categories.json";
const DEFAULT_INGREDIENT_CATEGORY_CONFIG = {
  categoryOrder: SHOPPING_CATEGORY_ORDER,
  defaultCategory: "Other",
  exact: {
    // General herbs
    "fresh herbs": "Fresh Fruit and Vegetables",
    // Specific fresh herbs (override contains spice rules below)
    "fresh thyme": "Fresh Fruit and Vegetables",
    "fresh rosemary": "Fresh Fruit and Vegetables",
    "fresh basil": "Fresh Fruit and Vegetables",
    "fresh sage": "Fresh Fruit and Vegetables",
    "fresh dill": "Fresh Fruit and Vegetables",
    "fresh mint": "Fresh Fruit and Vegetables",
    "fresh chives": "Fresh Fruit and Vegetables",
    "fresh coriander": "Fresh Fruit and Vegetables",
    // Specific dried herbs (override contains fresh rules below)
    "dried thyme": "Spices and Seasoning",
    "dried rosemary": "Spices and Seasoning",
    "dried basil": "Spices and Seasoning",
    "dried sage": "Spices and Seasoning",
    "dried dill": "Spices and Seasoning",
    "dried mint": "Spices and Seasoning",
    "dried chives": "Spices and Seasoning",
    // Specific spices from coriander seeds context
    "coriander seeds": "Spices and Seasoning",
    "ground coriander": "Spices and Seasoning",
    "coriander powder": "Spices and Seasoning",
    // Produce exact entries
    "head radicchio": "Fresh Fruit and Vegetables",
    "radicchio head": "Fresh Fruit and Vegetables",
    "serrano pepper": "Fresh Fruit and Vegetables",
    "fennel bulb": "Fresh Fruit and Vegetables",
    "baby arugula": "Fresh Fruit and Vegetables",
    "sweet corn": "Fresh Fruit and Vegetables",
    "sweetcorn": "Fresh Fruit and Vegetables",
    // Bug-fix: "eggplant" and "aubergine" contain "egg" → Protein without this
    "eggplant": "Fresh Fruit and Vegetables",
    "aubergine": "Fresh Fruit and Vegetables",
    "courgette": "Fresh Fruit and Vegetables",
    // Bug-fix: "fish sauce" contains "fish" → Protein without this
    "fish sauce": "Pantry Staples",
    // Specific spice entries
    "chipotle chile flakes": "Spices and Seasoning",
    // Pantry exact entries
    "almonds": "Pantry Staples",
    "cashews": "Pantry Staples",
    "cocoa nibs": "Pantry Staples",
    "cornstarch": "Pantry Staples",
    "cornflour": "Pantry Staples",
    "corn flour": "Pantry Staples",
    "corn starch": "Pantry Staples",
    "capers": "Pantry Staples",
    "artichoke hearts": "Pantry Staples",
    "canned corn": "Pantry Staples",
    "baking soda": "Pantry Staples",
    "bicarbonate of soda": "Pantry Staples",
    "bicarbonate": "Pantry Staples",
    "dried apricots": "Pantry Staples",
    "dried apricot": "Pantry Staples",
    "dried dates": "Pantry Staples",
    "dried figs": "Pantry Staples",
    "dried cranberries": "Pantry Staples",
    // Frozen exact
    "green peas": "Frozen",
    // Cheese exact
    "mascarpone": "Cheese",
    "burrata": "Cheese",
    // Dairy exact
    "creme fraiche": "Dairy and Refrigerated",
    // Bakery exact
    "naan bread": "Bakery",
    "pita bread": "Bakery",
    "sourdough bread": "Bakery",
    "sourdough loaf": "Bakery",
    // Produce misc
    "shallots": "Fresh Fruit and Vegetables",
    "apricot": "Fresh Fruit and Vegetables",
    "fig": "Fresh Fruit and Vegetables",
    "pear": "Fresh Fruit and Vegetables",
    "peach": "Fresh Fruit and Vegetables",
    "plum": "Fresh Fruit and Vegetables",
    "strawberry": "Fresh Fruit and Vegetables",
    "raspberry": "Fresh Fruit and Vegetables",
    "grape": "Fresh Fruit and Vegetables",
  },
  contains: {
    // ── Cheese ───────────────────────────────────────────────────────────────
    parmesan: "Cheese",
    mozzarella: "Cheese",
    feta: "Cheese",
    cheddar: "Cheese",
    gouda: "Cheese",
    brie: "Cheese",
    halloumi: "Cheese",
    ricotta: "Cheese",
    pecorino: "Cheese",
    cheese: "Cheese",

    // ── Frozen ───────────────────────────────────────────────────────────────
    frozen: "Frozen",

    // ── Spices and Seasoning ─────────────────────────────────────────────────
    salt: "Spices and Seasoning",
    pepper: "Spices and Seasoning",
    oregano: "Spices and Seasoning",
    cumin: "Spices and Seasoning",
    paprika: "Spices and Seasoning",
    "garam masala": "Spices and Seasoning",
    turmeric: "Spices and Seasoning",
    tumeric: "Spices and Seasoning",
    "chilli flake": "Spices and Seasoning",
    "chili flake": "Spices and Seasoning",
    cinnamon: "Spices and Seasoning",
    "bay leaf": "Spices and Seasoning",
    "bay leaves": "Spices and Seasoning",
    vegeta: "Spices and Seasoning",
    "kala namak": "Spices and Seasoning",
    gochugaru: "Spices and Seasoning",
    mustard: "Spices and Seasoning",
    powder: "Spices and Seasoning",
    ground: "Spices and Seasoning",
    "dried herb": "Spices and Seasoning",
    "dried herbs": "Spices and Seasoning",
    "dried flakes": "Spices and Seasoning",
    saffron: "Spices and Seasoning",
    "star anise": "Spices and Seasoning",
    anise: "Spices and Seasoning",
    cardamom: "Spices and Seasoning",
    "five spice": "Spices and Seasoning",
    "five-spice": "Spices and Seasoning",
    "chinese five": "Spices and Seasoning",
    allspice: "Spices and Seasoning",
    cloves: "Spices and Seasoning",
    nutmeg: "Spices and Seasoning",
    "fennel seed": "Spices and Seasoning",
    "fennel seeds": "Spices and Seasoning",
    szechuan: "Spices and Seasoning",
    sichuan: "Spices and Seasoning",
    sumac: "Spices and Seasoning",
    "za atar": "Spices and Seasoning",
    harissa: "Spices and Seasoning",
    "ras el hanout": "Spices and Seasoning",
    dukkah: "Spices and Seasoning",
    // Bare herb names → Spices (dried is the common shopping form for these)
    thyme: "Spices and Seasoning",
    rosemary: "Spices and Seasoning",
    sage: "Spices and Seasoning",

    // ── Fresh Fruit and Vegetables ────────────────────────────────────────────
    avocado: "Fresh Fruit and Vegetables",
    apple: "Fresh Fruit and Vegetables",
    banana: "Fresh Fruit and Vegetables",
    orange: "Fresh Fruit and Vegetables",
    mandarin: "Fresh Fruit and Vegetables",
    lemon: "Fresh Fruit and Vegetables",
    lime: "Fresh Fruit and Vegetables",
    mango: "Fresh Fruit and Vegetables",
    blueberry: "Fresh Fruit and Vegetables",
    passionfruit: "Fresh Fruit and Vegetables",
    tomato: "Fresh Fruit and Vegetables",
    onion: "Fresh Fruit and Vegetables",
    garlic: "Fresh Fruit and Vegetables",
    ginger: "Fresh Fruit and Vegetables",
    carrot: "Fresh Fruit and Vegetables",
    broccoli: "Fresh Fruit and Vegetables",
    capsicum: "Fresh Fruit and Vegetables",
    lettuce: "Fresh Fruit and Vegetables",
    kale: "Fresh Fruit and Vegetables",
    cabbage: "Fresh Fruit and Vegetables",
    celery: "Fresh Fruit and Vegetables",
    cucumber: "Fresh Fruit and Vegetables",
    potato: "Fresh Fruit and Vegetables",
    "sweet potato": "Fresh Fruit and Vegetables",
    mushroom: "Fresh Fruit and Vegetables",
    scallion: "Fresh Fruit and Vegetables",
    radish: "Fresh Fruit and Vegetables",
    parsley: "Fresh Fruit and Vegetables",
    coriander: "Fresh Fruit and Vegetables",
    chilli: "Fresh Fruit and Vegetables",
    chili: "Fresh Fruit and Vegetables",
    lemongrass: "Fresh Fruit and Vegetables",
    squash: "Fresh Fruit and Vegetables",
    zucchini: "Fresh Fruit and Vegetables",
    asparagus: "Fresh Fruit and Vegetables",
    spinach: "Fresh Fruit and Vegetables",
    beet: "Fresh Fruit and Vegetables",
    corn: "Fresh Fruit and Vegetables",
    arugula: "Fresh Fruit and Vegetables",
    rocket: "Fresh Fruit and Vegetables",
    "bok choy": "Fresh Fruit and Vegetables",
    leek: "Fresh Fruit and Vegetables",
    pumpkin: "Fresh Fruit and Vegetables",
    silverbeet: "Fresh Fruit and Vegetables",
    // Fresh herbs (commonly bought as living plants or bunches)
    basil: "Fresh Fruit and Vegetables",
    dill: "Fresh Fruit and Vegetables",
    chive: "Fresh Fruit and Vegetables",
    mint: "Fresh Fruit and Vegetables",

    // ── Dairy and Refrigerated ────────────────────────────────────────────────
    milk: "Dairy and Refrigerated",
    yogurt: "Dairy and Refrigerated",
    cream: "Dairy and Refrigerated",
    butter: "Dairy and Refrigerated",
    "ice cream": "Dairy and Refrigerated",
    "sour cream": "Dairy and Refrigerated",
    kefir: "Dairy and Refrigerated",

    // ── Bakery ────────────────────────────────────────────────────────────────
    bread: "Bakery",
    bagel: "Bakery",
    wrap: "Bakery",
    tortilla: "Bakery",
    bun: "Bakery",
    naan: "Bakery",
    sourdough: "Bakery",

    // ── Protein ───────────────────────────────────────────────────────────────
    tofu: "Protein",
    tempeh: "Protein",
    chorizo: "Protein",
    chicken: "Protein",
    beef: "Protein",
    pork: "Protein",
    salmon: "Protein",
    lamb: "Protein",
    tuna: "Protein",
    anchov: "Protein",
    prawn: "Protein",
    shrimp: "Protein",
    scallop: "Protein",
    squid: "Protein",
    mussel: "Protein",
    crab: "Protein",
    lobster: "Protein",
    sardine: "Protein",
    bacon: "Protein",
    pancetta: "Protein",
    prosciutto: "Protein",
    salami: "Protein",
    sausage: "Protein",
    mince: "Protein",
    fish: "Protein",
    egg: "Protein",
    protein: "Protein",

    // ── Pantry Staples ────────────────────────────────────────────────────────
    pasta: "Pantry Staples",
    spaghetti: "Pantry Staples",
    rice: "Pantry Staples",
    bean: "Pantry Staples",
    beans: "Pantry Staples",
    lentil: "Pantry Staples",
    lentils: "Pantry Staples",
    oat: "Pantry Staples",
    oats: "Pantry Staples",
    flour: "Pantry Staples",
    canned: "Pantry Staples",
    puree: "Pantry Staples",
    "purée": "Pantry Staples",
    stock: "Pantry Staples",
    broth: "Pantry Staples",
    seed: "Pantry Staples",
    seeds: "Pantry Staples",
    nut: "Pantry Staples",
    nuts: "Pantry Staples",
    oil: "Pantry Staples",
    vinegar: "Pantry Staples",
    sauce: "Pantry Staples",
    syrup: "Pantry Staples",
    maple: "Pantry Staples",
    "peanut butter": "Pantry Staples",
    tahini: "Pantry Staples",
    tamari: "Pantry Staples",
    quinoa: "Pantry Staples",
    sugar: "Pantry Staples",
    chickpea: "Pantry Staples",
    chickpeas: "Pantry Staples",
    "nutritional yeast": "Pantry Staples",
    popcorn: "Pantry Staples",
    breadcrumbs: "Pantry Staples",
    coconut: "Pantry Staples",
    miso: "Pantry Staples",
    honey: "Pantry Staples",
    agave: "Pantry Staples",
    vanilla: "Pantry Staples",
    yeast: "Pantry Staples",
    caper: "Pantry Staples",
    olive: "Pantry Staples",
    raisin: "Pantry Staples",
    currant: "Pantry Staples",
    noodle: "Pantry Staples",
    couscous: "Pantry Staples",
    polenta: "Pantry Staples",
    cracker: "Pantry Staples",
    chip: "Pantry Staples",
    chocolate: "Pantry Staples",
    cocoa: "Pantry Staples",
    jam: "Pantry Staples",
    paste: "Pantry Staples",
  },
};

function splitFrontmatter(content) {
  if (!content.startsWith("---\n")) return { frontmatterRaw: "", body: content };
  const end = content.indexOf("\n---", 4);
  if (end === -1) return { frontmatterRaw: "", body: content };
  const frontmatterRaw = content.slice(0, end + 4);
  const body = content.slice(end + 4).replace(/^\n+/, "");
  return { frontmatterRaw, body };
}

function cleanIngredientName(name) {
  return name
    .replace(/\[\[|\]\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/^of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalIngredientName(name) {
  return cleanIngredientName(name).toLowerCase();
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeadingKey(value) {
  return normalizeSearchText(String(value || "").replace(/[:\-–—]+$/g, ""));
}

function cloneDefaultCategoryConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_INGREDIENT_CATEGORY_CONFIG));
}

function normalizeRuleMap(map) {
  const out = {};
  for (const [k, v] of Object.entries(map || {})) {
    const key = normalizeSearchText(k);
    const category = String(v || "").trim();
    if (key && category) out[key] = category;
  }
  return out;
}

function normalizeCategoryConfig(raw) {
  const base = cloneDefaultCategoryConfig();
  // Normalize the default rule keys up front so matching (which runs against
  // normalizeSearchText'd ingredient names) behaves identically whether or not
  // the user supplies overrides.
  base.exact = normalizeRuleMap(base.exact);
  base.contains = normalizeRuleMap(base.contains);
  if (!raw || typeof raw !== "object") return base;

  if (Array.isArray(raw.categoryOrder)) {
    const order = raw.categoryOrder.map((v) => String(v || "").trim()).filter(Boolean);
    if (order.length > 0) base.categoryOrder = order;
  }

  if (typeof raw.defaultCategory === "string" && raw.defaultCategory.trim()) {
    base.defaultCategory = raw.defaultCategory.trim();
  }

  // Exact and contains maps from the JSON file are layered ON TOP of the
  // bundled defaults rather than replacing them, so customised configs still
  // pick up rules added in later plugin updates. The JSON layer wins on any
  // key conflict.
  if (raw.exact && typeof raw.exact === "object") {
    // Order is irrelevant for exact lookups; user rules override on conflict.
    base.exact = { ...base.exact, ...normalizeRuleMap(raw.exact) };
  }

  if (raw.contains && typeof raw.contains === "object") {
    // User rules go first so they take matching precedence (contains rules are
    // evaluated in insertion order and the first match wins) and override
    // default values on key conflict; default-only rules are then appended.
    const merged = normalizeRuleMap(raw.contains);
    for (const [key, category] of Object.entries(base.contains)) {
      if (!(key in merged)) merged[key] = category;
    }
    base.contains = merged;
  }

  return base;
}

// Finds the configured category whose name matches one of the candidates,
// returning "" when none exist (e.g. the user renamed their categories) so the
// caller can fall back to normal rule matching instead of inventing a category.
function resolveConfigCategory(config, candidates) {
  const order = Array.isArray(config?.categoryOrder) ? config.categoryOrder : [];
  for (const candidate of candidates) {
    const match = order.find((cat) => normalizeSearchText(cat) === normalizeSearchText(candidate));
    if (match) return match;
  }
  return "";
}

const DRIED_HERB_CATEGORY_CANDIDATES = ["Spices and Seasoning", "Herbs, Spices and Seasonings", "Spices"];
const FRESH_HERB_CATEGORY_CANDIDATES = ["Fresh Fruit and Vegetables", "Fresh Fruit and Veg", "Produce"];

// "dried <herb>" is a pantry spice; "fresh <herb>" is fresh produce. This rule
// generalizes that split to every culinary herb so we don't need a per-herb
// exact rule. Returns null when the name has no fresh/dried qualifier, isn't a
// herb, or the target category doesn't exist in the user's config.
function classifyFreshOrDriedHerb(text, config) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return null;
  const isDried = /\bdried\b/.test(normalized);
  const isFresh = /\bfresh\b/.test(normalized);
  if (!isDried && !isFresh) return null;

  let herb = "";
  for (const candidate of CULINARY_HERBS) {
    if (normalized.includes(candidate)) {
      herb = candidate;
      break;
    }
  }
  if (!herb) return null;

  if (isDried) {
    const category = resolveConfigCategory(config, DRIED_HERB_CATEGORY_CANDIDATES);
    if (category) return { category, reason: `dried herb: "${herb}"` };
  } else if (isFresh) {
    const category = resolveConfigCategory(config, FRESH_HERB_CATEGORY_CANDIDATES);
    if (category) return { category, reason: `fresh herb: "${herb}"` };
  }
  return null;
}

function classifyIngredientCategory(name, config) {
  return classifyIngredientCategoryWithReason(name, config).category;
}

function classifyIngredientCategoryWithReason(name, config) {
  const text = normalizeSearchText(name);
  const c = normalizeCategoryConfig(config);
  if (text && c.exact[text]) {
    return { category: c.exact[text], reason: `exact match: "${text}"` };
  }
  // Fresh/dried herb routing takes precedence over the broad contains rules so
  // that, e.g., "fresh oregano" reaches produce instead of the "oregano" spice rule.
  const herbRule = classifyFreshOrDriedHerb(text, c);
  if (herbRule) return herbRule;
  for (const [pattern, category] of Object.entries(c.contains)) {
    if (text.includes(pattern)) {
      return { category, reason: `contains rule: "${pattern}"` };
    }
  }
  return { category: c.defaultCategory || "Other", reason: "default category" };
}

// Data-quality lint for a single recipe. Pure given the recipe's raw ingredient
// lines, its Portions value, and the category config. Returns a list of
// findings ({ severity, type, message }) used by the "Validate recipes" command.
function validateRecipeData({ ingredientLines = [], portions = null, categoryConfig } = {}) {
  const findings = [];
  const config = normalizeCategoryConfig(categoryConfig);
  const defaultCategory = config.defaultCategory || "Other";

  const portionsNum = parseNumberLike(portions, NaN);
  if (!Number.isFinite(portionsNum) || portionsNum <= 0) {
    findings.push({
      severity: "warning",
      type: "portions",
      message: "Missing or invalid Portions frontmatter (batch scaling assumes 1).",
    });
  }

  let nonStructured = 0;
  const lines = Array.isArray(ingredientLines) ? ingredientLines : [];
  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const trimmed = line.replace(/^[-*+]\s+/, "").trim();
    if (!trimmed) continue;
    if (looksLikeIngredientSubheadingLine(trimmed)) continue;

    const parsed = parseIngredientLine(line);
    if (!parsed) {
      // Ignore blank / separator-only placeholder rows (e.g. "; ; ;").
      if (!/[a-z0-9]/i.test(trimmed)) continue;
      findings.push({ severity: "error", type: "unparsed", message: `Could not parse ingredient line: "${trimmed}"` });
      continue;
    }
    if (!parsed.isStructured) nonStructured += 1;
    if (!parsed.quantityUnknown && !Number.isFinite(parsed.amountMetric)) {
      findings.push({ severity: "error", type: "amount", message: `Amount did not resolve to a number: "${trimmed}"` });
    }
    const displayName = normalizeShoppingDisplayName(stripPreparationPhrases(parsed.name));
    const classified = classifyIngredientCategoryWithReason(displayName, config);
    if (classified.category === defaultCategory) {
      findings.push({
        severity: "info",
        type: "uncategorized",
        message: `"${displayName}" has no category rule (lands in ${defaultCategory}).`,
      });
    }
  }

  if (nonStructured > 0) {
    findings.push({
      severity: "info",
      type: "legacy-format",
      message: `${nonStructured} ingredient line(s) are not in 4-slot format.`,
    });
  }

  return findings;
}

const VALIDATION_SEVERITY_ICONS = { error: "❌", warning: "⚠️", info: "ℹ️" };
const VALIDATION_SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

// Renders the per-recipe findings into a markdown report note.
function buildRecipeValidationReport(recipeReports, totalRecipes = 0) {
  const reports = Array.isArray(recipeReports) ? recipeReports : [];
  const withFindings = reports.filter((r) => r && Array.isArray(r.findings) && r.findings.length > 0);
  const lines = [
    "# Recipe Validation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Scanned ${totalRecipes} recipe(s); ${withFindings.length} with findings.`,
    "",
  ];

  if (withFindings.length === 0) {
    lines.push("✅ No issues found.");
    return lines.join("\n");
  }

  for (const report of withFindings) {
    const name = String(report.name || "Untitled recipe");
    lines.push(`## ${report.link || name}`);
    const sorted = [...report.findings].sort(
      (a, b) => (VALIDATION_SEVERITY_ORDER[a.severity] ?? 9) - (VALIDATION_SEVERITY_ORDER[b.severity] ?? 9)
    );
    for (const finding of sorted) {
      const icon = VALIDATION_SEVERITY_ICONS[finding.severity] || "•";
      lines.push(`- ${icon} ${finding.message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

// Replaces the body text between a `### <headingName>` heading and the next
// `---` divider or heading (whichever comes first) with newBody. Mirrors this
// template's convention of separating sections with `---` rather than nested
// heading levels. Returns null if the heading isn't found.
function replaceMarkdownSectionBody(content, headingName, newBody) {
  const lines = String(content || "").split(/\r?\n/);
  const headingRegex = new RegExp(`^#{1,6}\\s+${escapeRegExp(headingName)}\\s*$`, "i");
  const startIdx = lines.findIndex((line) => headingRegex.test(line.trim()));
  if (startIdx === -1) return null;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === "---" || /^#{1,6}\s+/.test(trimmed)) {
      endIdx = i;
      break;
    }
  }

  const before = lines.slice(0, startIdx + 1);
  const after = lines.slice(endIdx);
  const bodyLines = newBody ? String(newBody).split(/\r?\n/) : [""];
  return [...before, ...bodyLines, "", ...after].join("\n");
}

// Computes one ingredient line's macro contribution (absolute, not yet
// divided by servings). Returns { kcal, protein, carbs, fat } on success, or
// null while pushing a finding ({ severity, type, message }, same shape as
// validateRecipeData's findings) onto the optional findings array — missing
// data is surfaced, never silently guessed.
function computeIngredientMacroContribution(item, findings = []) {
  const name = item?.name || "";
  if (item?.quantityUnknown) {
    findings.push({ severity: "warning", type: "unknown-quantity", message: `Amount unknown for "${name}" — excluded from macro totals.` });
    return null;
  }

  const macros = estimateIngredientMacrosPer100g(name);
  if (!macros) {
    findings.push({ severity: "warning", type: "no-nutrition-data", message: `No nutrition data for "${name}".` });
    return null;
  }

  let grams = 0;
  if (item.unitMetric === "g") {
    grams = Number(item.amountMetric) || 0;
  } else if (item.unitMetric === "ml") {
    const density = estimateIngredientDensityGPerMl(name);
    if (!Number.isFinite(density)) {
      findings.push({ severity: "warning", type: "no-density-data", message: `No density data to convert "${name}" from ml to grams.` });
      return null;
    }
    grams = (Number(item.amountMetric) || 0) * density;
  } else if (item.unitMetric === "unit") {
    const gramsPerUnit = Number(macros.gramsPerUnit);
    if (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) {
      findings.push({ severity: "warning", type: "no-unit-weight-data", message: `No per-unit weight for "${name}" — cannot convert count to grams.` });
      return null;
    }
    grams = (Number(item.amountMetric) || 0) * gramsPerUnit;
  } else {
    findings.push({ severity: "warning", type: "unsupported-unit", message: `Unsupported unit "${item.unitMetric}" for "${name}".` });
    return null;
  }

  const scale = grams / 100;
  return {
    kcal: (Number(macros.kcal) || 0) * scale,
    protein: (Number(macros.protein) || 0) * scale,
    carbs: (Number(macros.carbs) || 0) * scale,
    fat: (Number(macros.fat) || 0) * scale,
  };
}

// Sums per-ingredient macro contributions across a recipe's ingredients and
// divides by the number of servings (portions), mirroring getRecipePortions'
// own Math.max(1, ...) floor. Findings from unresolvable ingredients are
// collected and returned alongside the totals rather than dropped.
function computeRecipeMacros(ingredients, portions) {
  const findings = [];
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const items = Array.isArray(ingredients) ? ingredients : [];

  for (const item of items) {
    const contribution = computeIngredientMacroContribution(item, findings);
    if (!contribution) continue;
    totals.kcal += contribution.kcal;
    totals.protein += contribution.protein;
    totals.carbs += contribution.carbs;
    totals.fat += contribution.fat;
  }

  const divisor = Math.max(1, Number(portions) || 1);
  const perServing = {
    kcal: totals.kcal / divisor,
    protein: totals.protein / divisor,
    carbs: totals.carbs / divisor,
    fat: totals.fat / divisor,
  };

  return { perServing, totals, findings };
}

// Renders a per-serving macro table for the recipe's `### Nutrition` section.
// energyUnit conversion happens only here (display time) — cached frontmatter
// values are always kcal.
function formatMacroTableMarkdown(perServing, energyUnit = ACTIVE_ENERGY_UNIT) {
  const unit = normalizeEnergyUnit(energyUnit);
  const energy = convertKcalToDisplayEnergy(perServing?.kcal, unit);
  const round = (n) => Math.round(Number(n) || 0);
  return [
    "| Nutrient | Per serving |",
    "|---|---|",
    `| Energy | ${round(energy)} ${unit} |`,
    `| Protein | ${round(perServing?.protein)} g |`,
    `| Carbs | ${round(perServing?.carbs)} g |`,
    `| Fat | ${round(perServing?.fat)} g |`,
  ].join("\n");
}

// Renders the per-recipe macro findings into a markdown report note, mirroring
// buildRecipeValidationReport's format.
function buildMacroCalculationReport(recipeReports, totalRecipes = 0) {
  const reports = Array.isArray(recipeReports) ? recipeReports : [];
  const withFindings = reports.filter((r) => r && Array.isArray(r.findings) && r.findings.length > 0);
  const lines = [
    "# Macro Calculation Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Calculated ${totalRecipes} recipe(s); ${withFindings.length} with findings.`,
    "",
  ];

  if (withFindings.length === 0) {
    lines.push("✅ No issues found.");
    return lines.join("\n");
  }

  for (const report of withFindings) {
    const name = String(report.name || "Untitled recipe");
    lines.push(`## ${report.link || name}`);
    for (const finding of report.findings) {
      const icon = VALIDATION_SEVERITY_ICONS[finding.severity] || "•";
      lines.push(`- ${icon} ${finding.message}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function parseAmountToken(token) {
  if (!token) return null;
  const t = token.trim();
  if (FRACTIONS[t] !== undefined) return FRACTIONS[t];
  if (/^\d+\/\d+$/.test(t)) {
    const [n, d] = t.split("/").map(Number);
    if (d !== 0) return n / d;
  }
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  const mixed = t.match(/^(\d+)([½⅓⅔¼¾⅛])$/);
  if (mixed) return Number(mixed[1]) + (FRACTIONS[mixed[2]] || 0);
  return null;
}

function parseAmountFromStart(text) {
  const compact = text.replace(/^\s+/, "");
  const range = compact.match(/^([^\s]+)\s*(?:to|-|–|—)\s*([^\s]+)/i);
  if (range) {
    const first = parseAmountToken(range[1]);
    const second = parseAmountToken(range[2]);
    // Only treat this as a quantity range when BOTH ends are numbers. This
    // avoids matching the "to" inside words like "tomatoes" (e.g. "2 tomatoes"),
    // which previously consumed the whole token and dropped the ingredient name.
    if (first !== null && second !== null) {
      const consumed = range[0].length;
      // Represent a range by its midpoint, e.g. "1-2 tbsp" -> 1.5.
      return { amount: (first + second) / 2, rest: compact.slice(consumed).trim() };
    }
  }

  const parts = compact.split(/\s+/);
  if (parts.length === 0) return null;

  const first = parseAmountToken(parts[0]);
  if (first === null) return null;

  if (parts.length > 1) {
    const second = parseAmountToken(parts[1]);
    if (second !== null) {
      return {
        amount: first + second,
        rest: parts.slice(2).join(" "),
      };
    }
  }

  return { amount: first, rest: parts.slice(1).join(" ") };
}

function normalizeUnit(rawUnit, unitMap = ACTIVE_UNIT_MAP) {
  if (!rawUnit) return { rawUnit: "", baseUnit: "unit", factor: 1 };
  const normalized = normalizeSearchText(rawUnit).replace(/\.$/, "");
  return unitMap[normalized] || { rawUnit: normalized, baseUnit: "unit", factor: 1 };
}

function splitIngredientNameAndPreparation(text) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return { ingredientName: "", preparation: "" };

  const commaIdx = source.indexOf(",");
  if (commaIdx !== -1) {
    return {
      ingredientName: cleanIngredientName(source.slice(0, commaIdx)),
      preparation: cleanIngredientName(source.slice(commaIdx + 1)),
    };
  }

  for (const phrase of TRAILING_PREPARATION_PHRASES) {
    const phrasePattern = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
    const match = source.match(new RegExp(`^(.*?)(?:\\s+)(${phrasePattern})$`, "i"));
    if (!match) continue;
    const ingredientName = cleanIngredientName(match[1]);
    const preparation = cleanIngredientName(match[2]);
    if (!ingredientName || looksLikePreparationOnlyName(ingredientName)) continue;
    return { ingredientName, preparation };
  }

  return {
    ingredientName: cleanIngredientName(source),
    preparation: "",
  };
}

function looksLikeIngredientSubheadingLine(text) {
  const source = normalizeSingleLineText(text);
  if (!source) return false;
  if (parseAmountFromStart(source)) return false;

  const trimmed = source.replace(/[:\-–—]+$/g, "").trim();
  const normalized = normalizeSearchText(trimmed);
  if (!normalized) return false;

  if (/\bingredients?\b/.test(normalized)) return true;
  if (/^for the\b/.test(normalized)) return true;
  if (/[::\-–—]\s*$/.test(source) && normalized.split(" ").length <= 6) return true;
  return false;
}

function normalizeLegacyIngredientText(text) {
  let source = normalizeSingleLineText(text).replace(/[–—]/g, "-");
  if (!source) return "";

  // Collapse multiplier phrasings like "2 × 400g" / "2 x 400g" into a plain
  // "2 400g" so the container rules below can pick up count + pack size. Guarded
  // by digits on both sides so we never touch an "x" inside an ingredient word.
  source = source.replace(/(\d)\s*[×x]\s*(?=\d)/gi, "$1 ");

  source = source.replace(/^zest\s+and\s+juice\s+of\s+(.+)$/i, (_match, target) => `${target}, zested and juiced`);
  source = source.replace(/^juice\s+of\s+(.+)$/i, (_match, target) => `${target}, juiced`);
  source = source.replace(/^zest\s+of\s+(.+)$/i, (_match, target) => `${target}, zested`);
  // Vague hand-measure phrasings, with or without a leading article, become a
  // count of that measure: "a handful of spinach" -> "1 handful spinach".
  source = source.replace(
    /^(?:(?:a|an)\s+)?(handful|pinch|dash|splash|knob|drizzle|sprinkle)\s+of\s+(.+)$/i,
    (_match, measure, target) => `1 ${measure} ${target}`
  );
  source = source.replace(
    /^(\d+(?:\.\d+)?)\s*cm\s+piece(?:s)?\s+of\s+(.+)$/i,
    (_match, size, target) => `1 piece ${target}, ${size} cm`
  );
  source = source.replace(
    /^(\d+(?:\.\d+)?)\s*(?:in|inch|inches)\s+piece(?:s)?\s+of\s+(.+)$/i,
    (_match, size, target) => `1 piece ${target}, ${size} inch`
  );
  source = source.replace(
    /^(\d+(?:\.\d+)?(?:\s+\d+\/\d+)?)\s+(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms|ml|milliliters?|millilitres?|l|liters?|litres?)\s+(can|cans|jar|jars|tin|tins|packet|packets|package|packages|bottle|bottles)\s+(.+)$/i,
    (_match, count, size, sizeUnit, container, target) => `${count} ${container} ${target}, ${size} ${sizeUnit} each`
  );
  source = source.replace(
    /^(\d+(?:\.\d+)?)\s*(oz|ounce|ounces|g|gram|grams|kg|kilogram|kilograms|ml|milliliters?|millilitres?|l|liters?|litres?)\s+(can|cans|jar|jars|tin|tins|packet|packets|package|packages|bottle|bottles)\s+(.+)$/i,
    (_match, size, sizeUnit, container, target) => `1 ${singularizeSimple(container)} ${target}, ${size} ${sizeUnit}`
  );

  return source.replace(/\s{2,}/g, " ").trim();
}

function splitStructuredIngredientSlots(text, preferredSeparator = ACTIVE_INGREDIENT_STORAGE_SEPARATOR) {
  const source = String(text || "").replace(/^[-*+]\s+/, "").trim();
  if (!source) return null;

  const candidates = [
    normalizeIngredientStorageSeparator(preferredSeparator),
    ...STRUCTURED_INGREDIENT_SEPARATORS,
  ];
  const seen = new Set();

  for (const separator of candidates) {
    if (!separator || seen.has(separator)) continue;
    seen.add(separator);
    const parts = source.split(separator);
    if (parts.length !== 4) continue;
    return {
      separator,
      slots: parts.map((part) => normalizeSingleLineText(part)),
    };
  }

  return null;
}

function hasStructuredIngredientLineFormat(line) {
  return !!splitStructuredIngredientSlots(line);
}

function buildIngredientRenderFields(
  parsed,
  {
    metricMode = false,
    measurementPreference = ACTIVE_MEASUREMENT_PREFERENCE,
    preferWeight = shouldPreferWeightMeasurements(measurementPreference),
    outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  } = {}
) {
  if (!parsed || typeof parsed !== "object") {
    return {
      amount: "",
      unit: "",
      ingredient: "",
      preparation: "",
      preparationSuffix: "",
    };
  }

  const normalizedPreference = normalizeMeasurementPreference(measurementPreference);
  const effective = applyMeasurementPreferenceToParsedItem(parsed, { preferWeight });
  const prep = normalizeSingleLineText(effective.preparation || "");
  let amount = "";
  let unit = "";

  if (!effective.quantityUnknown) {
    const useMetricValues = metricMode
      || (normalizedPreference === "weight" && effective.unitMetric === "g" && parsed.unitMetric === "ml");

    if (useMetricValues) {
      if (effective.unitMetric === "unit") {
        amount = formatMetricAmount(effective.amount);
        unit = effective.unitExplicit ? effective.unit : "";
      } else {
        amount = formatMetricAmount(effective.amountMetric);
        unit = effective.unitMetric;
      }
    } else {
      amount = formatMetricAmount(parsed.amount);
      if (parsed.unitExplicit) {
        const canonical = canonicalVolumeUnit(parsed.unit);
        unit = canonical ? formatVolumeUnitLabel(canonical, parsed.amount, outputLabels) : parsed.unit;
      }
    }
  }

  if (unit && isDuplicateCountUnit(unit, effective.name)) {
    unit = "";
  }

  return {
    amount,
    unit,
    ingredient: normalizeSingleLineText(effective.name),
    preparation: prep,
    preparationSuffix: prep ? `, ${prep}` : "",
  };
}

function formatRecipeViewIngredientDisplay(
  parsed,
  {
    template = ACTIVE_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE,
    outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  } = {}
) {
  const templateToUse = normalizeRecipeViewIngredientDisplayTemplate(template);
  const fields = buildIngredientRenderFields(parsed, {
    metricMode: false,
    measurementPreference: ACTIVE_MEASUREMENT_PREFERENCE,
    preferWeight: shouldPreferWeightMeasurements(ACTIVE_MEASUREMENT_PREFERENCE),
    outputLabels,
  });
  let displayAmount = fields.amount;
  let displayUnit = fields.unit;
  let displayIngredient = fields.ingredient;

  // Dried-legume mode: show legumes in the recipe view as a dried gram weight
  // (grams only — no storage ml, which is shopping-list-specific).
  let legumeDried = null;
  if (ACTIVE_LEGUME_SHOPPING_MODE === "dried") {
    legumeDried = computeLegumeDried(
      { name: parsed?.name, unit: parsed?.unitMetric, amount: parsed?.amountMetric, quantityUnknown: parsed?.quantityUnknown },
      ACTIVE_LEGUME_FACTORS
    );
  }

  if (legumeDried) {
    displayAmount = String(legumeDried.grams);
    displayUnit = "g";
  } else if (displayUnit === "ml" && parsed?.amountMetric > 0) {
    const humanized = humanizeVolumeUnit(parsed.amountMetric, "ml", parsed.name || "");
    displayAmount = String(humanized.amount);
    displayUnit = humanized.unit;
  }
  const replacements = {
    amount: displayAmount,
    unit: displayUnit,
    ingredient: displayIngredient,
    preparation: fields.preparation,
    preparationsuffix: fields.preparationSuffix,
  };

  let line = templateToUse.replace(/{{\s*(amount|unit|ingredient|preparation|preparationsuffix)\s*}}/gi, (_match, key) => {
    const normalizedKey = normalizeSearchText(key);
    return Object.prototype.hasOwnProperty.call(replacements, normalizedKey) ? replacements[normalizedKey] : "";
  });

  line = line
    .replace(/\s+,/g, ",")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!line) line = fields.ingredient;
  if (
    fields.preparation
    && !/{{\s*preparation\s*}}/i.test(templateToUse)
    && !/{{\s*preparationsuffix\s*}}/i.test(templateToUse)
  ) {
    line = `${line}, ${fields.preparation}`;
  }

  return line;
}

function formatStructuredIngredientLineFromParsed(
  parsed,
  {
    separator = ACTIVE_INGREDIENT_STORAGE_SEPARATOR,
    metricMode = false,
    measurementPreference = ACTIVE_MEASUREMENT_PREFERENCE,
    outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  } = {}
) {
  if (!parsed) return "";
  const fields = buildIngredientRenderFields(parsed, {
    metricMode,
    measurementPreference,
    preferWeight: metricMode ? true : shouldPreferWeightMeasurements(measurementPreference),
    outputLabels,
  });
  const normalizedSeparator = normalizeIngredientStorageSeparator(separator);
  const slots = [
    fields.amount,
    fields.unit,
    fields.ingredient,
    fields.preparation,
  ];
  const normalizedSlots = slots.map((slot) => normalizeSingleLineText(slot));
  let rendered = "";
  for (let i = 0; i < normalizedSlots.length; i += 1) {
    const slot = normalizedSlots[i];
    if (i > 0) rendered += " ";
    rendered += slot;
    if (i < normalizedSlots.length - 1) rendered += normalizedSeparator;
  }
  rendered = rendered.replace(/\s+$/, "");
  return `- ${rendered}`;
}

function parseIngredientLine(line, unitMap = ACTIVE_UNIT_MAP, options = {}) {
  const allowLegacy = options?.allowLegacy !== false;
  let text = line.replace(/^[-*+]\s+/, "").trim();
  if (!text) return null;

  const structured = splitStructuredIngredientSlots(text, options?.preferredSeparator);
  if (structured) {
    const [amountSlot, unitSlot, ingredientSlot, preparationSlot] = structured.slots;
    const ingredientName = cleanIngredientName(ingredientSlot);
    const preparation = cleanIngredientName(preparationSlot);
    if (!ingredientName) return null;

    let amount = 1;
    let quantityUnknown = true;
    let amountMetric = 0;
    if (amountSlot) {
      const parsedAmount = parseAmountFromStart(amountSlot);
      if (!parsedAmount || normalizeSingleLineText(parsedAmount.rest)) return null;
      amount = Number(parsedAmount.amount.toFixed(2));
      quantityUnknown = false;
    }

    const cleanedUnitSlot = normalizeSingleLineText(unitSlot);
    const normalizedUnitToken = normalizeSearchText(cleanedUnitSlot).replace(/\.$/, "");
    const knownUnit = cleanedUnitSlot && unitMap[normalizedUnitToken]
      ? normalizeUnit(cleanedUnitSlot, unitMap)
      : null;
    const unitExplicit = !!cleanedUnitSlot;
    const unit = unitExplicit ? cleanedUnitSlot : "";

    if (!quantityUnknown) {
      if (knownUnit) {
        amountMetric = Number((amount * knownUnit.factor).toFixed(2));
      } else {
        amountMetric = Number(amount.toFixed(2));
      }
    }

    if (looksLikeIngredientSubheadingLine(ingredientSlot) && !amountSlot && !cleanedUnitSlot) {
      return null;
    }

    if (!cleanedUnitSlot) {
      const repairCandidate = amountSlot
        ? `${amountSlot} ${ingredientSlot}${preparation ? `, ${preparation}` : ""}`
        : `${ingredientSlot}${preparation ? `, ${preparation}` : ""}`;
      const repaired = parseIngredientLine(`- ${repairCandidate}`, unitMap, {
        allowLegacy: true,
        preferredSeparator: null,
      });
      if (
        repaired
        && !repaired.isStructured
        && (
          repaired.unitExplicit
          || repaired.quantityUnknown !== quantityUnknown
          || repaired.name !== ingredientName
          || repaired.preparation !== preparation
        )
      ) {
        return {
          ...repaired,
          source: line,
          isStructured: true,
          separator: structured.separator,
        };
      }
    }

    return {
      name: ingredientName,
      preparation,
      amount,
      unit,
      unitExplicit,
      quantityUnknown,
      amountMetric,
      unitMetric: knownUnit?.baseUnit || "unit",
      canonicalName: canonicalIngredientName(ingredientName),
      source: line,
      isStructured: true,
      separator: structured.separator,
    };
  }

  if (!allowLegacy) return null;

  text = normalizeLegacyIngredientText(text);
  if (!text || looksLikeIngredientSubheadingLine(text)) return null;
  text = text.replace(/\([^)]*oz[^)]*\)/gi, "").trim();
  // Support compact quantity+unit formats like "150g", "1kg", "250ml".
  text = text.replace(/^(\d+(?:\.\d+)?)([a-zA-Z]+)/, "$1 $2");
  text = text.replace(/\s+/g, " ");

  const amountResult = parseAmountFromStart(text);
  if (!amountResult) {
    const { ingredientName, preparation } = splitIngredientNameAndPreparation(text);
    if (!ingredientName) return null;
    return {
      name: ingredientName,
      preparation,
      amount: 1,
      unit: "",
      unitExplicit: false,
      quantityUnknown: true,
      amountMetric: 0,
      unitMetric: "unit",
      canonicalName: canonicalIngredientName(ingredientName),
      source: line,
      isStructured: false,
    };
  }

  const restParts = amountResult.rest.split(/\s+/).filter(Boolean);
  if (restParts.length === 0) return null;

  let unitToken = restParts[0].replace(/[,.;:]$/, "");
  if (/^\(.+\)$/.test(unitToken)) {
    unitToken = "";
  }

  const normalizedUnitToken = normalizeSearchText(unitToken || "").replace(/\.$/, "");
  const hasExplicitUnit = !!unitMap[normalizedUnitToken];
  const unitInfo = hasExplicitUnit ? normalizeUnit(unitToken, unitMap) : { baseUnit: "unit", factor: 1 };
  let nameStartIdx = hasExplicitUnit ? 1 : 0;

  let ingredientName = restParts.slice(nameStartIdx).join(" ");
  if (!ingredientName) ingredientName = restParts.join(" ");

  ingredientName = ingredientName
    .replace(/^[,\-:]+/, "")
    .trim();

  const split = splitIngredientNameAndPreparation(ingredientName);
  ingredientName = split.ingredientName;
  const preparation = split.preparation;
  if (!ingredientName) return null;

  const amountMetric = Number((amountResult.amount * unitInfo.factor).toFixed(2));

  return {
    name: ingredientName,
    preparation,
    amount: Number(amountResult.amount.toFixed(2)),
    unit: hasExplicitUnit ? unitToken : "unit",
    unitExplicit: hasExplicitUnit,
    quantityUnknown: false,
    amountMetric,
    unitMetric: unitInfo.baseUnit,
    canonicalName: canonicalIngredientName(ingredientName),
    source: line,
    isStructured: false,
  };
}

function isDuplicateCountUnit(unitLabel, ingredientName) {
  const unit = normalizeSearchText(String(unitLabel || "").replace(/\.$/, ""));
  const ingredient = normalizeSearchText(ingredientName);
  if (!unit || !ingredient) return false;
  const unitSingular = normalizeSearchText(singularizeSimple(unit));
  const ingredientSingular = normalizeSearchText(singularizeSimple(ingredient));
  if (!unitSingular || !ingredientSingular) return false;
  return unitSingular === ingredientSingular;
}

function normalizeNutIngredientTerms(text) {
  let out = normalizeSingleLineText(text);
  if (!out) return "";
  out = out.replace(/\bpecans\b/gi, "pecan nuts");
  out = out.replace(/\bpecan\b(?!\s+nuts?\b)/gi, "pecan nuts");
  return out.replace(/\s{2,}/g, " ").trim();
}

function detectPreferredNutPhraseFromIngredientLines(ingredientLines) {
  const lines = normalizeStringArray(ingredientLines);
  let hasPecan = false;
  let hasWalnut = false;

  for (const raw of lines) {
    const cleaned = String(raw).replace(/^[-*+]\s+/, "").trim();
    if (!cleaned) continue;
    const parsed = parseIngredientLine(`- ${cleaned}`, ACTIVE_UNIT_MAP);
    const name = normalizeSearchText(normalizeNutIngredientTerms(parsed?.name || cleaned));
    if (!name) continue;
    if (/\bpecan(?:\s+nuts?)?\b/.test(name)) hasPecan = true;
    if (/\bwalnuts?\b/.test(name)) hasWalnut = true;
  }

  if (hasPecan && hasWalnut) return "pecan nuts or walnuts";
  if (hasPecan) return "pecan nuts";
  if (hasWalnut) return "walnuts";
  return "";
}

function alignDirectionIngredientReferences(line, { preferredNutPhrase = "" } = {}) {
  let out = normalizeNutIngredientTerms(String(line || ""));
  if (!out) return "";

  const preferred = normalizeSingleLineText(preferredNutPhrase);
  if (preferred) {
    const normalized = normalizeSearchText(out);
    const hasSpecificNutMention = /\b(pecan(?:\s+nuts?)?|walnuts?)\b/.test(normalized);
    if (!hasSpecificNutMention && /\bnuts?\b/i.test(out)) {
      out = out.replace(/\bnuts?\b/gi, preferred);
    }
  }

  return normalizeSingleLineText(out);
}

function extractIngredientsSection(content) {
  const lines = content.split(/\r?\n/);
  const sectionStart = lines.findIndex((line) => /^#{1,6}\s+ingredients\b/i.test(line.trim()));
  if (sectionStart === -1) return [];
  const sectionHeadingMatch = lines[sectionStart].trim().match(/^(#{1,6})\s+/);
  const sectionHeadingLevel = sectionHeadingMatch ? sectionHeadingMatch[1].length : 2;

  const entries = [];
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const headingMatch = line.trim().match(/^(#{1,6})\s+/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      if (level <= sectionHeadingLevel) break;
      continue;
    }
    if (/^[-*+]\s+/.test(line.trim())) entries.push(line.trim());
  }

  return entries;
}

function formatIngredientLineFromParsed(
  parsed,
  {
    template = ACTIVE_RECIPE_VIEW_INGREDIENT_DISPLAY_TEMPLATE,
    metricMode = false,
    measurementPreference = ACTIVE_MEASUREMENT_PREFERENCE,
    outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  } = {}
) {
  if (!parsed) return "";
  const normalizedPreference = normalizeMeasurementPreference(measurementPreference);
  const effective = applyMeasurementPreferenceToParsedItem(parsed, {
    preferWeight: shouldPreferWeightMeasurements(measurementPreference),
  });

  const prep = normalizeSingleLineText(effective.preparation || "");
  let amount = "";
  let unit = "";
  const showingBothMeasurements = normalizedPreference === "both" && !metricMode;
  const usingWeightMetric = !showingBothMeasurements && effective.unitMetric === "g" && parsed.unitMetric === "ml";

  if (!effective.quantityUnknown) {
    if (metricMode || usingWeightMetric) {
      if (effective.unitMetric === "unit") {
        amount = formatMetricAmount(effective.amount);
        unit = effective.unitExplicit ? effective.unit : "";
      } else {
        amount = formatMetricAmount(effective.amountMetric);
        unit = effective.unitMetric;
      }
    } else {
      amount = formatMetricAmount(parsed.amount);
      if (parsed.unitExplicit) {
        const canonical = canonicalVolumeUnit(parsed.unit);
        unit = canonical ? formatVolumeUnitLabel(canonical, parsed.amount, outputLabels) : parsed.unit;
      }
      if (
        showingBothMeasurements
        && parsed.unitMetric === "ml"
        && effective.unitMetric === "g"
        && Number.isFinite(Number(effective.amountMetric))
        && Number(effective.amountMetric) > 0
      ) {
        const convertedWeight = `${formatMetricAmount(effective.amountMetric)} g`;
        unit = unit ? `${unit} (${convertedWeight})` : `(${convertedWeight})`;
      }
    }
  }

  if (unit && isDuplicateCountUnit(unit, effective.name)) {
    unit = "";
  }

  const replacements = {
    amount,
    unit,
    ingredient: normalizeSingleLineText(effective.name),
    preparation: prep,
    preparationsuffix: prep ? `, ${prep}` : "",
  };

  const templateToUse = normalizeRecipeViewIngredientDisplayTemplate(template);
  let line = templateToUse.replace(/{{\s*(amount|unit|ingredient|preparation|preparationsuffix)\s*}}/gi, (_match, key) => {
    const normalizedKey = normalizeSearchText(key);
    return Object.prototype.hasOwnProperty.call(replacements, normalizedKey) ? replacements[normalizedKey] : "";
  });

  line = line
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!line) line = replacements.ingredient;
  if (
    prep
    && !/{{\s*preparation\s*}}/i.test(templateToUse)
    && !/{{\s*preparationsuffix\s*}}/i.test(templateToUse)
  ) {
    line = `${line}, ${prep}`;
  }
  return `- ${line}`;
}

function normalizeIngredientsSectionLines(
  lines,
  unitMap = ACTIVE_UNIT_MAP,
  outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  separator = ACTIVE_INGREDIENT_STORAGE_SEPARATOR,
  measurementPreference = ACTIVE_MEASUREMENT_PREFERENCE
) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => {
    const parsed = parseIngredientLine(line, unitMap);
    if (!parsed) return line;
    return formatStructuredIngredientLineFromParsed(parsed, {
      metricMode: false,
      measurementPreference,
      outputLabels,
      separator,
    });
  });
}

function hasOnlyBlankIngredientSlots(line) {
  const structured = splitStructuredIngredientSlots(line);
  return !!structured && structured.slots.every((slot) => !slot);
}

function isMeaningfulIngredientLine(line) {
  const text = stripListMarkerText(line);
  return !!text && !hasOnlyBlankIngredientSlots(line);
}

function recipeIngredientLinesAreStructured(lines) {
  const values = Array.isArray(lines) ? lines : [];
  return values.every((line) => {
    if (!isMeaningfulIngredientLine(line)) return true;
    return hasStructuredIngredientLineFormat(line);
  });
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPreparationPhrases(name) {
  let cleaned = cleanIngredientName(String(name || ""));
  cleaned = cleaned.replace(/\([^)]*\)/g, "").trim();

  const trailingPhrases = [
    "to taste",
    "for serving",
    "optional",
    "as needed",
    "plus more",
    "divided",
    "for garnish",
  ];
  for (const phrase of trailingPhrases) {
    const re = new RegExp(`\\s+${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    cleaned = cleaned.replace(re, "").trim();
  }
  const split = splitIngredientNameAndPreparation(cleaned);
  return split.ingredientName || cleanIngredientName(String(name || ""));
}

function normalizeShoppingDisplayName(name) {
  let cleaned = String(name || "").trim();
  if (!cleaned) return cleaned;
  cleaned = cleaned.replace(/\bfresh\s+cilantro\b/gi, "fresh coriander");
  cleaned = cleaned.replace(/\bcilantro\b/gi, "coriander");
  cleaned = cleaned.replace(/\bgreen\s+onions?\b/gi, "spring onion");
  cleaned = cleaned.replace(/\bscallions?\b/gi, "spring onion");
  cleaned = cleaned.replace(/\bbell\s+peppers?\b/gi, "capsicum");
  return cleaned.replace(/\s+/g, " ").trim();
}

const SHOPPING_OVERRIDE_LINK_PREFIX = "weekly-meal-shopper://ingredient-override";

function getVaultBasename(filePath) {
  const normalized = String(filePath || "").trim().split("/").pop() || "";
  return normalized.replace(/\.[^.]+$/, "") || normalized;
}

function buildIngredientOverrideHref(ingredientName) {
  const ingredient = cleanIngredientName(String(ingredientName || ""));
  if (!ingredient) return SHOPPING_OVERRIDE_LINK_PREFIX;
  return `${SHOPPING_OVERRIDE_LINK_PREFIX}?ingredient=${encodeURIComponent(ingredient)}`;
}

function parseIngredientOverrideHref(href) {
  const raw = String(href || "").trim();
  if (!raw.startsWith(SHOPPING_OVERRIDE_LINK_PREFIX)) return "";
  const queryIndex = raw.indexOf("?");
  const query = queryIndex === -1 ? "" : raw.slice(queryIndex + 1);
  const params = new URLSearchParams(query);
  return cleanIngredientName(decodeURIComponent(params.get("ingredient") || ""));
}

// Builds the recipe-usage suffix appended inline to a shopping item:
// " - [[Recipe 1]] - [[Recipe 2]]". Returns "" when there are no recipes.
function buildShoppingRecipeUsageSuffix(recipes) {
  const values = recipes && typeof recipes[Symbol.iterator] === "function"
    ? [...recipes]
    : [];
  const uniquePaths = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  if (uniquePaths.length === 0) return "";
  const links = uniquePaths
    .sort((a, b) => getVaultBasename(a).localeCompare(getVaultBasename(b), undefined, { sensitivity: "base" }))
    .map((recipePath) => {
      const basename = getVaultBasename(recipePath);
      if (recipePath.includes("/") || /\.[a-z0-9]+$/i.test(recipePath)) {
        return `[[${recipePath}|${basename}]]`;
      }
      return `[[${basename}]]`;
    });
  return ` - ${links.join(" - ")}`;
}

function formatShoppingListItemLines(
  item,
  {
    includeRecipeUsage = false,
    includeOverrideLinks = false,
    noAmountCategory = false,
  } = {}
) {
  if (!item || typeof item !== "object") return [];

  const overrideIngredient = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
  const overrideSuffix = includeOverrideLinks && overrideIngredient
    ? ` [Override](${buildIngredientOverrideHref(overrideIngredient)})`
    : "";

  const amountLabel = formatShoppingItemAmountLabel(item);
  let mainLine = "";
  if (noAmountCategory || item.quantityUnknown) {
    mainLine = `  - [ ] ${item.name}${overrideSuffix}`;
  } else if (item.unit === "unit") {
    const roundedAmount = shouldRoundUpUnitItem(item.name) ? Math.ceil(item.amount) : item.amount;
    const displayName = pluralizeSimple(singularizeSimple(item.name), roundedAmount);
    mainLine = `  - [ ] (${formatMetricAmount(roundedAmount)}) ${displayName}${overrideSuffix}`;
  } else {
    mainLine = `  - [ ] (${amountLabel}) ${item.name}${overrideSuffix}`;
  }

  // Recipe links are appended inline to the ingredient line rather than on a
  // separate indented sub-bullet: "… ingredient - [[Recipe 1]] - [[Recipe 2]]".
  if (includeRecipeUsage) {
    mainLine += buildShoppingRecipeUsageSuffix(item.recipes);
  }
  return [mainLine];
}

// Amount label for a measured (non-unit) shopping item. Most items render as
// "<amount> <unit>"; legume items in dried mode also carry a secondary volume
// for eyeballing storage, rendered as "<g> g / <ml> ml".
function formatShoppingItemAmountLabel(item) {
  const primary = `${formatMetricAmount(item.amount)} ${item.unit}`;
  if (item && item.secondaryAmount != null && item.secondaryUnit) {
    return `${primary} / ${formatMetricAmount(item.secondaryAmount)} ${item.secondaryUnit}`;
  }
  return primary;
}

// Spice/seasoning amounts below these thresholds read as a pinch and add noise
// to the shopping list, so we hide the amount. Anything larger (e.g. a 100 g
// bag of saffron) is a real purchase quantity and should be shown.
const SPICE_AMOUNT_DISPLAY_MAX_GRAMS = 15;
const SPICE_AMOUNT_DISPLAY_MAX_ML = 15; // ~3 tsp at 5 ml/tsp

// Best-effort ml equivalent for the volume units a shopping item can carry
// after humanization. Returns null for units we can't convert (discrete or
// weight units), which callers treat as "not a small volume".
function estimateMlEquivalentForUnit(amount, unit, profile = ACTIVE_MEASUREMENT_PROFILE) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return null;
  const cupMl = Number(profile?.cupMl) || 250;
  const tbspMl = Number(profile?.tbspMl) || 15;
  const tspMl = Number(profile?.tspMl) || 5;
  switch (String(unit || "")) {
    case "ml":
      return value;
    case "tsp":
      return value * tspMl;
    case "tbsp":
      return value * tbspMl;
    case "cup":
    case "cups":
      return value * cupMl;
    default:
      return null;
  }
}

// Decides whether a spice/seasoning shopping item carries a meaningful enough
// amount to print it. Used to replace blanket category-level amount hiding so
// that recipes specifying real weights/volumes keep their quantities.
function shouldShowSpiceAmount(item, profile = ACTIVE_MEASUREMENT_PROFILE) {
  if (!item || typeof item !== "object") return false;
  if (item.quantityUnknown) return false;
  const amount = Number(item.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const unit = String(item.unit || "");
  if (unit === "g") return amount > SPICE_AMOUNT_DISPLAY_MAX_GRAMS;
  const ml = estimateMlEquivalentForUnit(amount, unit, profile);
  // Discrete units (unit, bunch, can, …) and anything we can't measure as a
  // small volume are treated as real purchase quantities and shown.
  if (ml === null) return true;
  return ml > SPICE_AMOUNT_DISPLAY_MAX_ML;
}

// Turns an aggregated `totals` map (aggregation key -> item) into the grouped,
// category-ordered shopping checklist markdown lines. Pulled out of
// generateWeeklyShoppingList so the same rollup/format logic can be run once for
// a combined list or once per canvas in split mode.
// Legumes that home cooks commonly buy dried and cook from scratch. Bare
// "bean" is excluded so fresh green/string beans never match.
const LEGUMES = new Set([
  "chickpea",
  "garbanzo",
  "black bean",
  "kidney bean",
  "cannellini",
  "borlotti",
  "pinto bean",
  "butter bean",
  "navy bean",
  "lima bean",
  "white bean",
  "lentil",
  "black eyed pea",
  "split pea",
  "adzuki",
  "mung bean",
  "fava bean",
  "broad bean",
  "great northern bean",
]);

function matchesLegume(name) {
  const text = normalizeSearchText(name);
  if (!text) return false;
  for (const legume of LEGUMES) {
    if (text.includes(legume)) return true;
  }
  return false;
}

// Core dried-legume computation shared by the shopping list and recipe view.
// Given an item ({ name, unit, amount } in metric base units) and optional
// factor overrides, returns { grams, density, baseName } or null when the item
// isn't a convertible legume. `unit` is the metric base: "unit" (cans), "g", "ml".
function computeLegumeDried(item, factors = ACTIVE_LEGUME_FACTORS) {
  if (!item || typeof item !== "object" || item.quantityUnknown) return null;
  const rawName = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
  if (!matchesLegume(rawName)) return null;

  const amount = Number(item.amount || 0);
  if (!(amount > 0)) return null;

  const { gramsDriedPerCan, cookedToDriedFactor, densityGPerMl } = resolveLegumeFactors(factors);
  const text = normalizeSearchText(rawName);
  const alreadyDried = /\bdried\b/.test(text);
  const cannedInName = /\b(can|cans|canned|tin|tins|tinned|cooked)\b/.test(text);
  const unit = String(item.unit || "");

  let driedGrams = null;
  if (alreadyDried) {
    // Already specified as dried (typical for a from-scratch recipe): keep the weight.
    if (unit === "g") driedGrams = amount;
    else if (unit === "ml") driedGrams = amount * densityGPerMl;
    else if (unit === "unit") driedGrams = amount * gramsDriedPerCan;
  } else if (unit === "unit") {
    driedGrams = amount * gramsDriedPerCan; // counted legumes = cans
  } else if (cannedInName && (unit === "g" || unit === "ml")) {
    driedGrams = amount * cookedToDriedFactor; // explicit canned/cooked weight
  } else if (unit === "g") {
    driedGrams = amount; // bare weight: assume an already-dry from-scratch amount
  } else if (unit === "ml") {
    driedGrams = amount * densityGPerMl;
  }

  if (!(driedGrams > 0)) return null;

  const baseName = rawName
    .replace(/\b(canned|tinned|cooked|cans?|tins?|dried)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { grams: Math.round(driedGrams), density: densityGPerMl, baseName };
}

// For cooks who make legumes from scratch: converts a canned/cooked legume
// shopping item into a dried-weight equivalent, carrying a secondary ml volume
// so they can eyeball how much is left in storage. Returns null for non-legumes
// or quantities it can't convert. Mode-agnostic; the caller decides when to apply it.
function convertLegumeToDriedForShopping(item, factors = ACTIVE_LEGUME_FACTORS) {
  const dried = computeLegumeDried(item, factors);
  if (!dried) return null;
  return {
    ...item,
    name: `dried ${dried.baseName}`.replace(/\s+/g, " ").trim(),
    unit: "g",
    amount: dried.grams,
    secondaryAmount: Math.round(dried.grams / dried.density),
    secondaryUnit: "ml",
  };
}

function buildGroupedShoppingChecklistLines(totals, {
  categoryConfig,
  ingredientOverrides = new Map(),
  includeRecipeUsage = false,
  includeOverrideLinks = false,
  legumeMode = "canned",
  legumeFactors = ACTIVE_LEGUME_FACTORS,
} = {}) {
  const config = categoryConfig || {};
  const totalsValues = totals && typeof totals.values === "function" ? totals.values() : [];
  const rawItems = [...totalsValues].sort((a, b) => a.name.localeCompare(b.name));
  const garlicItems = [];
  const citrusRollup = new Map();
  const totalItems = [];

  for (const item of rawItems) {
    const displayName = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
    const normalizedDisplayName = normalizeSearchText(displayName);

    // Dried-legume mode: convert canned/cooked legumes to a dried-weight item
    // (with a secondary ml readout) before any other rollup runs.
    if (legumeMode === "dried") {
      const driedLegume = convertLegumeToDriedForShopping({ ...item, name: displayName }, legumeFactors);
      if (driedLegume) {
        totalItems.push(driedLegume);
        continue;
      }
    }

    const citrusKey = detectCitrusKey(displayName);
    const garlicCandidate = isGarlicRollupCandidate(displayName) && !item.quantityUnknown && ["ml", "unit"].includes(item.unit);

    if (garlicCandidate) {
      garlicItems.push({ ...item, name: displayName });
      continue;
    }

    if (!citrusKey) {
      if (item.quantityUnknown) {
        totalItems.push({ ...item, name: displayName, unit: "", amount: 0, quantityUnknown: true });
        continue;
      }
      const adjustedAmount =
        item.unit === "unit" && shouldRoundUpUnitItem(displayName)
          ? Math.ceil(item.amount)
          : item.amount;
      const override = ingredientOverrides.get(displayName);
      let converted = convertBaseAmountToPreferredUnit(adjustedAmount, item.unit, override?.unit || "");
      // If still showing raw ml, humanize to weight or volume units
      if (converted.unit === "ml") {
        const humanized = humanizeVolumeUnit(converted.amount, "ml", displayName);
        converted = { amount: humanized.amount, unit: humanized.unit };
      }
      totalItems.push({ ...item, name: displayName, amount: converted.amount, unit: converted.unit });
      continue;
    }

    const citrus = citrusRollup.get(citrusKey) || {
      key: citrusKey,
      category: item.category || "Fresh Fruit and Vegetables",
      wholeFromJuice: 0,
      wholeExplicit: 0,
      recipes: new Set(),
    };

    const recipeEntries = item.recipes && typeof item.recipes[Symbol.iterator] === "function"
      ? item.recipes
      : [];
    for (const recipe of recipeEntries) citrus.recipes.add(recipe);

    if (/\bjuice\b/.test(normalizedDisplayName)) {
      citrus.wholeFromJuice += estimateCitrusUnitsFromJuice(item, citrusKey);
    } else if (/\b(wedge|wedges|rind|zest|peel|segments?)\b/.test(normalizedDisplayName)) {
      citrus.wholeExplicit += Math.max(1, item.amount);
    } else if (item.unit === "unit") {
      citrus.wholeExplicit += item.amount;
    } else {
      const adjustedAmount =
        item.unit === "unit" && shouldRoundUpUnitItem(displayName)
          ? Math.ceil(item.amount)
          : item.amount;
      totalItems.push({ ...item, name: displayName, amount: adjustedAmount });
    }

    citrusRollup.set(citrusKey, citrus);
  }

  const garlicRollupItem = buildGarlicRollupItem(garlicItems);
  if (garlicRollupItem) totalItems.push(garlicRollupItem);

  for (const citrus of citrusRollup.values()) {
    const rule = CITRUS_RULES[citrus.key];
    const neededWhole = Math.max(citrus.wholeFromJuice, citrus.wholeExplicit);
    const roundedWhole = Math.max(1, Math.ceil(neededWhole));
    totalItems.push({
      name: roundedWhole === 1 ? rule.singular : rule.plural,
      unit: "unit",
      amount: roundedWhole,
      recipes: citrus.recipes,
      category: citrus.category || "Fresh Fruit and Vegetables",
      categoryReason: "citrus rollup",
    });
  }

  const categoryOrder = Array.isArray(config.categoryOrder) && config.categoryOrder.length
    ? config.categoryOrder
    : SHOPPING_CATEGORY_ORDER;
  const grouped = new Map();
  const orderedCategories = [...categoryOrder];
  for (const category of orderedCategories) grouped.set(category, []);
  for (const item of totalItems) {
    const category = String(item.category || config.defaultCategory || "Other");
    if (!grouped.has(category)) {
      grouped.set(category, []);
      orderedCategories.push(category);
    }
    grouped.get(category).push(item);
  }

  const groupedIngredientLines = [];
  for (const category of orderedCategories) {
    const items = grouped.get(category) || [];
    if (items.length === 0) continue;
    groupedIngredientLines.push(`- ${category}`);
    const isSpiceCategory =
      category === "Spices and Seasoning" || category === "Herbs, Spices and Seasonings";
    for (const item of items) {
      // Within spice categories, only hide the amount for pinch-sized
      // quantities; meaningful weights/volumes (e.g. 100 g saffron) keep theirs.
      const noAmountCategory = isSpiceCategory && !shouldShowSpiceAmount(item);
      groupedIngredientLines.push(...formatShoppingListItemLines(item, {
        includeRecipeUsage,
        includeOverrideLinks,
        noAmountCategory,
      }));
    }
  }

  return groupedIngredientLines;
}

function pluralizeSimple(name, amount) {
  if (Math.abs(amount - 1) < 1e-9) return name;
  if (name.endsWith("s")) return name;
  return `${name}s`;
}

function singularizeSimple(name) {
  const clean = String(name || "").trim();
  if (!clean) return clean;
  if (clean.endsWith("ies") && clean.length > 3) return `${clean.slice(0, -3)}y`;
  if (clean.endsWith("oes") && clean.length > 3) return clean.slice(0, -2);
  if (clean.endsWith("ses") && clean.length > 3) return clean.slice(0, -2);
  if (clean.endsWith("s") && !clean.endsWith("ss") && clean.length > 1) return clean.slice(0, -1);
  return clean;
}

function collectSharedGenericIngredientWords(ingredientLines) {
  const lines = Array.isArray(ingredientLines) ? ingredientLines : [];
  const counts = new Map();

  for (const line of lines) {
    const parsed = parseIngredientLine(line);
    if (!parsed) continue;
    const baseName = stripPreparationPhrases(parsed.name);
    if (!baseName) continue;
    const fullWords = normalizeSearchText(baseName).split(" ").filter(Boolean);
    const coreWords = fullWords
      .filter((word) => !INGREDIENT_DESCRIPTOR_WORDS.has(word))
      .filter((word) => !INGREDIENT_CONNECTOR_WORDS.has(word))
      .map((word) => normalizeSearchText(singularizeSimple(word)))
      .filter(Boolean);
    const seenInThisIngredient = new Set(coreWords);
    for (const word of seenInThisIngredient) {
      if (!GENERIC_INGREDIENT_SINGLE_WORDS.has(word)) continue;
      counts.set(word, Number(counts.get(word) || 0) + 1);
    }
  }

  const shared = new Set();
  for (const [word, count] of counts.entries()) {
    if (count >= 2) shared.add(word);
  }
  return shared;
}

function buildIngredientMentionPhrases(ingredientLines, options = {}) {
  const lines = Array.isArray(ingredientLines) ? ingredientLines : [];
  const sharedGenericWords = options?.sharedGenericWords instanceof Set
    ? options.sharedGenericWords
    : collectSharedGenericIngredientWords(lines);
  const set = new Set();
  for (const line of lines) {
    const parsed = parseIngredientLine(line);
    if (!parsed) continue;
    const baseName = stripPreparationPhrases(parsed.name);
    if (!baseName) continue;

    const addPhrase = (phrase) => {
      const p = normalizeSearchText(phrase);
      if (p && p.length >= 3) set.add(p);
    };

    const addPhraseWithInflections = (words) => {
      const list = Array.isArray(words) ? words.filter(Boolean) : [];
      if (list.length === 0) return;
      addPhrase(list.join(" "));
      const last = list[list.length - 1];
      const singular = singularizeSimple(last);
      const plural = pluralizeSimple(singular, 2);
      addPhrase([...list.slice(0, -1), singular].join(" "));
      addPhrase([...list.slice(0, -1), plural].join(" "));
    };

    const fullWords = normalizeSearchText(baseName).split(" ").filter(Boolean);
    addPhraseWithInflections(fullWords);

    const coreWords = fullWords
      .filter((word) => !INGREDIENT_DESCRIPTOR_WORDS.has(word))
      .filter((word) => !INGREDIENT_CONNECTOR_WORDS.has(word));
    if (coreWords.length > 0) {
      addPhraseWithInflections(coreWords);
    }

    if (coreWords.length >= 2) {
      for (let i = 0; i < coreWords.length - 1; i += 1) {
        addPhraseWithInflections([coreWords[i], coreWords[i + 1]]);
      }
      addPhraseWithInflections(coreWords.slice(-2));
    }

    if (coreWords.length > 0) {
      for (let i = 0; i < coreWords.length; i += 1) {
        const word = normalizeSearchText(singularizeSimple(coreWords[i]));
        if (!word || word.length < 4) continue;
        if (GENERIC_INGREDIENT_SINGLE_WORDS.has(word) && !sharedGenericWords.has(word)) continue;
        addPhraseWithInflections([word]);
      }
    }
  }
  return [...set].sort((a, b) => b.length - a.length);
}

function buildPhraseRegex(phrase, flags = "gi") {
  const normalized = normalizeSearchText(phrase);
  if (!normalized) return null;
  return new RegExp(`\\b${escapeRegExp(normalized).replace(/\s+/g, "\\s+")}\\b`, flags);
}

function containsNormalizedPhrase(text, phrase) {
  const normalizedText = normalizeSearchText(text);
  if (!normalizedText) return false;
  const regex = buildPhraseRegex(phrase, "i");
  if (!regex) return false;
  return regex.test(normalizedText);
}

function boldDirectionIngredientMentions(line, mentionPhrases) {
  const phrases = Array.isArray(mentionPhrases) ? mentionPhrases : [];
  if (!line || phrases.length === 0) return line;
  if (/^#{1,6}\s/.test(line.trim())) return line;

  const source = String(line).replace(/\*\*/g, "");
  const taken = new Array(source.length).fill(false);
  const matches = [];

  for (const phrase of phrases) {
    if (!phrase) continue;
    const regex = new RegExp(`\\b${escapeRegExp(String(phrase)).replace(/\s+/g, "\\s+")}\\b`, "gi");
    if (!regex) continue;
    let match;
    while ((match = regex.exec(source)) !== null) {
      const matchedText = String(match[0] || "");
      if (!matchedText) continue;
      const originalStart = Number(match.index || 0);
      const originalEnd = originalStart + matchedText.length;
      let overlaps = false;
      for (let i = originalStart; i < originalEnd; i += 1) {
        if (taken[i]) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      for (let i = originalStart; i < originalEnd; i += 1) taken[i] = true;
      matches.push({ start: originalStart, end: originalEnd });
    }
  }

  if (matches.length === 0) return source;
  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = "";
  let cursor = 0;
  for (const match of matches) {
    out += source.slice(cursor, match.start);
    out += `**${source.slice(match.start, match.end)}**`;
    cursor = match.end;
  }
  out += source.slice(cursor);
  return out;
}

function normalizeDirectionsSectionLines(directionLines, ingredientLines) {
  const directions = Array.isArray(directionLines) ? directionLines : [];
  const mentionPhrases = buildIngredientMentionPhrases(ingredientLines);
  return directions.map((line) => boldDirectionIngredientMentions(line, mentionPhrases));
}

// Leading descriptor words that describe a state/size but not a distinct
// shopping item, so they can be dropped when building the aggregation key
// (e.g. "baby spinach" -> "spinach", "plain flour" -> "flour"). Deliberately
// conservative: words like "brown" (brown vs white sugar), "dried" and "fresh"
// (dried vs fresh herbs land in different shopping sections — and bare "oregano"
// usually means dried) are intentionally excluded because they change which
// product you actually buy and where you buy it.
const AGGREGATION_LEADING_DESCRIPTORS = new Set([
  "baby",
  "plain",
  "raw",
  "ripe",
  "whole",
]);

// Herbs sold fresh by default, so the bare name already implies "fresh". For
// these, "fresh basil" should aggregate with "basil". Herbs NOT listed here
// (oregano, thyme, rosemary, sage) usually mean dried when bare, so their
// "fresh X" form is deliberately kept as a separate shopping line.
const TYPICALLY_FRESH_HERBS = new Set([
  "basil",
  "parsley",
  "coriander",
  "cilantro",
  "mint",
  "dill",
  "chive",
]);

function isTypicallyFreshHerb(text) {
  const normalized = normalizeSearchText(text);
  if (!normalized) return false;
  if (TYPICALLY_FRESH_HERBS.has(normalized)) return true;
  return TYPICALLY_FRESH_HERBS.has(normalizeSearchText(singularizeSimple(normalized)));
}

function normalizedAggregationName(name) {
  const text = normalizeSearchText(name);
  if (!text) return "";
  let words = text.split(" ").filter(Boolean);
  // Drop leading descriptor adjectives that don't change the shopping item,
  // but always keep at least one word so a name never collapses to nothing.
  while (words.length > 1 && AGGREGATION_LEADING_DESCRIPTORS.has(words[0])) {
    words = words.slice(1);
  }
  // "fresh" is normally kept (fresh vs dried changes the product/section), but
  // for herbs that are fresh by default, "fresh basil" == "basil".
  if (words.length > 1 && words[0] === "fresh" && isTypicallyFreshHerb(words.slice(1).join(" "))) {
    words = words.slice(1);
  }
  // Singularize every word so plural forms collapse across the whole compound
  // noun, not just the final word ("cherry tomatoes" -> "cherry tomato").
  words = words.map((word) => normalizeSearchText(singularizeSimple(word)) || word);
  return words.join(" ").trim();
}

function shouldRoundUpUnitItem(name) {
  const text = normalizeSearchText(name);
  return text.includes("avocado");
}

const GARLIC_ROLLUP_RULE = {
  singular: "garlic clove",
  plural: "garlic cloves",
  mlPerClove: 5,
};

function isGarlicRollupCandidate(name) {
  const text = normalizeSearchText(name);
  return text === "garlic" || text === "garlic clove" || text === "garlic cloves";
}

function estimateGarlicClovesFromItem(item) {
  if (!item || typeof item !== "object") return 0;
  const amount = Number(item.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (item.unit === "unit") return amount;
  if (item.unit === "ml") return amount / GARLIC_ROLLUP_RULE.mlPerClove;
  return 0;
}

function buildGarlicRollupItem(items) {
  const candidates = Array.isArray(items) ? items : [];
  let estimatedCloves = 0;
  let category = "";
  let categoryLocked = false;
  const recipes = new Set();

  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const displayName = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
    if (!isGarlicRollupCandidate(displayName)) continue;
    const cloves = estimateGarlicClovesFromItem(item);
    if (!Number.isFinite(cloves) || cloves <= 0) continue;
    estimatedCloves += cloves;

    const itemCategory = String(item.category || "").trim();
    if (!category && itemCategory) category = itemCategory;
    if (item.categoryLocked) {
      category = itemCategory || category;
      categoryLocked = true;
    } else if ((!category || category === "Other") && itemCategory && itemCategory !== "Other") {
      category = itemCategory;
    }

    const recipeEntries = item.recipes && typeof item.recipes[Symbol.iterator] === "function"
      ? item.recipes
      : [];
    for (const recipe of recipeEntries) recipes.add(recipe);
  }

  if (estimatedCloves <= 0) return null;

  const roundedCloves = Math.max(1, Math.ceil(estimatedCloves));
  return {
    name: roundedCloves === 1 ? GARLIC_ROLLUP_RULE.singular : GARLIC_ROLLUP_RULE.plural,
    unit: "unit",
    amount: roundedCloves,
    recipes,
    category: category || "Fresh Fruit and Vegetables",
    categoryReason: categoryLocked ? "manual override" : "garlic clove estimate",
  };
}

const CITRUS_RULES = {
  lemon: { singular: "lemon", plural: "lemons", juiceMlPerFruit: 45 },
  lime: { singular: "lime", plural: "limes", juiceMlPerFruit: 30 },
  orange: { singular: "orange", plural: "oranges", juiceMlPerFruit: 120 },
  mandarin: { singular: "mandarin", plural: "mandarins", juiceMlPerFruit: 60 },
  grapefruit: { singular: "grapefruit", plural: "grapefruits", juiceMlPerFruit: 180 },
};

function detectCitrusKey(name) {
  const text = normalizeSearchText(name);
  for (const key of Object.keys(CITRUS_RULES)) {
    if (text.includes(key)) return key;
  }
  return "";
}

function estimateCitrusUnitsFromJuice(item, citrusKey) {
  const rule = CITRUS_RULES[citrusKey];
  if (!rule) return 0;
  if (item.unit === "unit") return item.amount;
  if (item.unit === "ml") return item.amount / rule.juiceMlPerFruit;
  return 0;
}

function normalizeExactExclusionList(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

function parseExcludedIngredients(lines) {
  const values = Array.isArray(lines) ? lines : [];
  const map = new Map();

  for (const raw of values) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const parts = line.split("|").map((p) => p.trim());
    const ingredient = parts[0] || "";
    if (!ingredient) continue;
    const category = parts[1] || "";
    const normalized = normalizeSearchText(ingredient);
    if (!normalized) continue;
    map.set(normalized, { ingredient, category });
  }

  return map;
}

function shouldExcludeIngredientExact(name, exclusionList) {
  const candidate = String(name || "").trim();
  if (!candidate) return false;
  const normalized = normalizeSearchText(candidate);
  if (!normalized) return false;
  if (exclusionList instanceof Map) return exclusionList.has(normalized);
  if (Array.isArray(exclusionList)) {
    return exclusionList.some((entry) => normalizeSearchText(String(entry || "")) === normalized);
  }
  return false;
}

function parseIngredientOverrideEntries(lines) {
  const values = Array.isArray(lines) ? lines : [];
  const entries = [];
  for (const raw of values) {
    const line = String(raw || "").trim();
    if (!line) continue;
    const parts = line.split("|").map((p) => p.trim());
    const ingredient = parts[0] || "";
    if (!ingredient) continue;
    const category = parts[1] || "";
    const unit = parts[2] || "";
    entries.push({ ingredient, category, unit });
  }
  return entries;
}

function parseIngredientOverrides(lines) {
  const map = new Map();
  for (const { ingredient, category, unit } of parseIngredientOverrideEntries(lines)) {
    map.set(ingredient, {
      ingredient,
      category,
      unit,
    });
  }

  return map;
}

function looksLikePreparationOnlyName(name) {
  const normalized = normalizeSearchText(name);
  if (!normalized) return true;
  if (PREPARATION_ONLY_WORDS.has(normalized)) return true;
  if (/^(and|or|with|without)$/.test(normalized)) return true;
  return false;
}

function getSelectableIngredientCategories(config) {
  const normalized = normalizeCategoryConfig(config);
  const order = Array.isArray(normalized.categoryOrder) ? normalized.categoryOrder : [];
  const categories = order.map((c) => String(c || "").trim()).filter(Boolean);
  if (!categories.includes(normalized.defaultCategory)) {
    categories.push(normalized.defaultCategory);
  }
  return categories.filter(Boolean);
}

function moveArrayItem(values, fromIndex, toIndex) {
  const items = Array.isArray(values) ? [...values] : [];
  if (fromIndex < 0 || fromIndex >= items.length) return items;
  if (toIndex < 0) toIndex = 0;
  if (toIndex > items.length) toIndex = items.length;
  const [moved] = items.splice(fromIndex, 1);
  const boundedIndex = Math.max(0, Math.min(toIndex, items.length));
  items.splice(boundedIndex, 0, moved);
  return items;
}

const OUTPUT_UNIT_MAP = {
  g: { base: "g", factor: 1 },
  kg: { base: "g", factor: 1 / 1000 },
  ml: { base: "ml", factor: 1 },
  l: { base: "ml", factor: 1 / 1000 },
  tsp: { base: "ml", factor: 1 / 5 },
  tbsp: { base: "ml", factor: 1 / 15 },
  unit: { base: "unit", factor: 1 },
};

function normalizePreferredOutputUnit(raw) {
  const t = normalizeSearchText(raw);
  if (!t) return "";
  if (["g", "gram", "grams"].includes(t)) return "g";
  if (["kg", "kilogram", "kilograms"].includes(t)) return "kg";
  if (["ml", "milliliter", "milliliters", "millilitre", "millilitres"].includes(t)) return "ml";
  if (["l", "liter", "liters", "litre", "litres"].includes(t)) return "l";
  if (["tsp", "teaspoon", "teaspoons"].includes(t)) return "tsp";
  if (["tbsp", "tablespoon", "tablespoons"].includes(t)) return "tbsp";
  if (["unit", "units", "piece", "pieces"].includes(t)) return "unit";
  return "";
}

function convertBaseAmountToPreferredUnit(amount, baseUnit, preferredUnitRaw) {
  const preferred = normalizePreferredOutputUnit(preferredUnitRaw);
  if (!preferred) return { amount, unit: baseUnit };
  const target = OUTPUT_UNIT_MAP[preferred];
  if (!target) return { amount, unit: baseUnit };
  if (target.base !== baseUnit) return { amount, unit: baseUnit };
  return {
    amount: Number((amount * target.factor).toFixed(2)),
    unit: preferred,
  };
}

// Converts a raw ml amount to the most human-readable shopping display unit.
// Priority: weight (if density known and preferring weight) → cups/tbsp/tsp fallback.
// Also detects herb-type ingredients and returns a bunch count instead.
function humanizeVolumeUnit(amount, unit, ingredientName = "") {
  if (unit !== "ml") return { amount, unit, bunches: 0 };

  const normalizedName = normalizeSearchText(ingredientName);

  // Herb bunch conversion
  const isHerb = [...HERB_BUNCH_INGREDIENTS].some((herb) => {
    const h = normalizeSearchText(herb);
    return normalizedName === h || normalizedName.includes(h) || h.includes(normalizedName);
  });
  if (isHerb) {
    const bunches = Math.max(1, Math.ceil(amount / HERB_BUNCH_ML));
    return { amount: bunches, unit: bunches === 1 ? "bunch" : "bunches", bunches };
  }

  // Weight conversion via density
  if (ACTIVE_MEASUREMENT_PREFERENCE === "weight" || ACTIVE_MEASUREMENT_PREFERENCE === "both") {
    const density = estimateIngredientDensityGPerMl(ingredientName);
    if (Number.isFinite(density) && density > 0) {
      const grams = Math.round(amount * density);
      if (grams > 0) return { amount: grams, unit: "g", bunches: 0 };
    }
  }

  // Volume fallback: cups / tbsp / tsp
  const cupMl = ACTIVE_MEASUREMENT_PROFILE.cupMl;
  const tbspMl = ACTIVE_MEASUREMENT_PROFILE.tbspMl;
  const tspMl = ACTIVE_MEASUREMENT_PROFILE.tspMl;

  if (amount >= cupMl * 0.25) {
    const cups = Number((amount / cupMl).toFixed(2));
    return { amount: cups, unit: cups <= 1 ? "cup" : "cups", bunches: 0 };
  }
  if (amount >= tbspMl * 0.75) {
    const tbsp = Number((amount / tbspMl).toFixed(1));
    return { amount: tbsp, unit: "tbsp", bunches: 0 };
  }
  const tsp = Number((amount / tspMl).toFixed(1));
  return { amount: tsp, unit: "tsp", bunches: 0 };
}

function buildStandardBody(sectionMap) {
  const ingredients = sectionMap.ingredients?.length
    ? sectionMap.ingredients
    : [`- ${ACTIVE_INGREDIENT_STORAGE_SEPARATOR} ${ACTIVE_INGREDIENT_STORAGE_SEPARATOR} ${ACTIVE_INGREDIENT_STORAGE_SEPARATOR}`];
  const directions = sectionMap.directions?.length ? sectionMap.directions : ["1. "];
  const notes = sectionMap.notes?.length ? sectionMap.notes : [""];
  const nutrition = sectionMap.nutrition?.length ? sectionMap.nutrition : [""];
  const tags = sectionMap.tags?.length ? sectionMap.tags : [""];

  const logSection = sectionMap.log?.length
    ? sectionMap.log
    : [
        "```dataview",
        "TASK",
        "WHERE icontains(text, this.file.name)",
        "GROUP BY file.name",
        "SORT file.link DESC",
        "```",
      ];

  return [
    "### Ingredients",
    ...ingredients,
    "---",
    "### Directions",
    ...directions,
    "---",
    "### Notes",
    ...notes,
    "---",
    "### Nutrition",
    ...nutrition,
    "---",
    "### Log",
    ...logSection,
    "---",
    "### Tags",
    ...tags,
    "",
  ].join("\n");
}

function parseSections(body) {
  const sectionMap = {};
  const lines = body.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (match) {
      current = match[1].trim().toLowerCase();
      if (!sectionMap[current]) sectionMap[current] = [];
      continue;
    }

    if (!current) continue;
    if (line.trim() === "---") continue;

    sectionMap[current].push(line);
  }

  return {
    ingredients: sectionMap.ingredients || [],
    directions: sectionMap.directions || [],
    notes: sectionMap.notes || [],
    nutrition: sectionMap.nutrition || [],
    log: sectionMap.log || [],
    tags: sectionMap.tags || [],
  };
}

function normalizeSingleLineText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const text = normalizeSingleLineText(value);
    const key = normalizeSearchText(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizeOrderedStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => normalizeSingleLineText(value))
    .filter(Boolean);
}

function stripListMarkerText(line) {
  return normalizeSingleLineText(String(line || "").replace(/^[-*+]\s+/, "").replace(/^\d+\.\s*/, ""));
}

function firstStringValue(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") {
    return normalizeSingleLineText(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstStringValue(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    const priorityKeys = ["text", "name", "url", "@id", "contentUrl", "value"];
    for (const key of priorityKeys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const found = firstStringValue(value[key]);
      if (found) return found;
    }
  }
  return "";
}

function normalizeDurationText(value) {
  const raw = firstStringValue(value);
  if (!raw) return "";
  const iso = raw.toUpperCase();
  const match = iso.match(/^P(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?)?$/);
  if (!match) return raw;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  const seconds = Number(match[4] || 0);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(" ") || raw;
}

function decodeHtmlEntities(text) {
  const entityMap = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: "\"",
    apos: "'",
    nbsp: " ",
  };
  return String(text || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity || "").toLowerCase();
    if (key.startsWith("#x")) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (key.startsWith("#")) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return Object.prototype.hasOwnProperty.call(entityMap, key) ? entityMap[key] : match;
  });
}

function extractBalancedJsonSegment(text, startIndex) {
  const source = String(text || "");
  const openingChar = source[startIndex];
  const closingChar = openingChar === "[" ? "]" : "}";
  if (openingChar !== "{" && openingChar !== "[") return "";

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === openingChar) {
      depth += 1;
      continue;
    }
    if (char === closingChar) {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }

  return "";
}

function extractJsonSegmentAfterMarker(text, marker, openingChar) {
  const source = String(text || "");
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";
  const startIndex = source.indexOf(openingChar, markerIndex + marker.length);
  if (startIndex === -1) return "";
  return extractBalancedJsonSegment(source, startIndex);
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(String(url || ""));
}

function extractSourceTitleFromHtml(html) {
  const source = String(html || "");
  const ogMatch = source.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch?.[1]) {
    return normalizeSingleLineText(decodeHtmlEntities(ogMatch[1]));
  }
  const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleMatch?.[1]) return "";
  return normalizeSingleLineText(
    decodeHtmlEntities(String(titleMatch[1] || "").replace(/\s*-\s*YouTube\s*$/i, ""))
  );
}

function decodeJsonEscapedString(value) {
  const raw = String(value || "");
  if (!raw) return "";
  try {
    return JSON.parse(`"${raw.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`);
  } catch {
    return decodeHtmlEntities(raw);
  }
}

function extractYouTubeShortDescriptionFromHtml(html) {
  const source = String(html || "");
  const match = source.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!match?.[1]) return "";
  return String(decodeJsonEscapedString(match[1] || ""))
    .replace(/\r\n?/g, "\n")
    .trim();
}

function extractContextSection(text, heading) {
  const source = String(text || "");
  const pattern = new RegExp(`${heading}:\\n([\\s\\S]*?)(?:\\n\\n[A-Z][^\\n]*:\\n|$)`);
  const match = source.match(pattern);
  return String(match?.[1] || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => normalizeSingleLineText(line).replace(/\s+([,.!?;:])/g, "$1"))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractContextSingleLineValue(text, label) {
  const source = String(text || "");
  const pattern = new RegExp(`^${label}:\\s*(.+)$`, "mi");
  const match = source.match(pattern);
  return normalizeSingleLineText(match?.[1] || "");
}

function extractRecipeCountHint(text) {
  const source = normalizeSearchText(text);
  if (!source) return 0;
  const digitMatch = source.match(/\b([2-9]|1[0-2])\s+(?:ways|recipes|versions|methods|variations)\b/);
  if (digitMatch) return Number(digitMatch[1]);
  const wordMap = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  for (const [word, value] of Object.entries(wordMap)) {
    if (new RegExp(`\\b${word}\\s+(?:ways|recipes|versions|methods|variations)\\b`).test(source)) {
      return value;
    }
  }
  return 0;
}

function buildWayTitle(sourceTitle, ordinal) {
  const cleanTitle = normalizeSingleLineText(
    String(sourceTitle || "")
      .replace(/\s*[-–—]\s*\d+\s+(?:ways|recipes|versions|methods|variations)\b.*$/i, "")
  ) || "Recipe";
  return `${cleanTitle} - Way ${ordinal}`;
}

function extractRecipeTargetsFromDescription(descriptionText) {
  const lines = String(descriptionText || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim());
  const targets = [];
  let insideRecipeList = false;
  for (const line of lines) {
    if (!insideRecipeList) {
      if (/^in the video we share\s*:?\s*$/i.test(line)) {
        insideRecipeList = true;
      }
      continue;
    }
    if (!line) {
      if (targets.length > 0) break;
      continue;
    }
    if (/^(plus|if you're new|subscribe|follow|make sure to check out)/i.test(line)) break;
    const bulletMatch = line.match(/^[*+-]\s*(.+)$/);
    if (!bulletMatch?.[1]) continue;
    const title = normalizeSingleLineText(bulletMatch[1]);
    if (!title) continue;
    targets.push({
      title,
      evidence: title,
    });
  }
  return targets;
}

function buildOrdinalWayRegex(ordinal) {
  const defs = {
    1: "(?:first|1st|one)",
    2: "(?:second|2nd|two)",
    3: "(?:third|3rd|three)",
    4: "(?:fourth|4th|four)",
    5: "(?:fifth|5th|five)",
    6: "(?:sixth|6th|six)",
    7: "(?:seventh|7th|seven)",
    8: "(?:eighth|8th|eight)",
    9: "(?:ninth|9th|nine)",
    10: "(?:tenth|10th|ten)",
    11: "(?:eleventh|11th|eleven)",
    12: "(?:twelfth|12th|twelve)",
  };
  const token = defs[ordinal];
  if (!token) return null;
  return new RegExp(`\\b(?:the\\s+)?(?:${token})\\b(?:[^\\n]{0,60})\\b(?:way|recipe|version|method|variation)\\b`, "i");
}

function segmentTranscriptByWayMarkers(transcriptText, countHint, sourceTitle = "") {
  const lines = String(transcriptText || "")
    .split(/\n+/)
    .map((line) => normalizeSingleLineText(line))
    .filter(Boolean);
  if (lines.length === 0 || countHint < 2) return [];

  const markers = [];
  for (let ordinal = 1; ordinal <= countHint; ordinal += 1) {
    const regex = buildOrdinalWayRegex(ordinal);
    if (!regex) return [];
    const index = lines.findIndex((line, lineIndex) => lineIndex > (markers[markers.length - 1]?.index ?? -1) && regex.test(line));
    if (index === -1) return [];
    markers.push({
      ordinal,
      index,
      evidence: lines[index],
      title: buildWayTitle(sourceTitle, ordinal),
    });
  }

  const segments = [];
  for (let idx = 0; idx < markers.length; idx += 1) {
    const start = markers[idx].index;
    const end = idx + 1 < markers.length ? markers[idx + 1].index : lines.length;
    const segmentLines = lines.slice(start, end);
    if (segmentLines.length === 0) continue;
    segments.push({
      title: markers[idx].title,
      evidence: markers[idx].evidence,
      transcriptText: segmentLines.join("\n"),
    });
  }

  return segments;
}

function extractYouTubeCaptionTracksFromHtml(html) {
  const source = String(html || "");
  const markers = [
    "\"captionTracks\":",
    "\"captionTracks\" :",
  ];
  for (const marker of markers) {
    const jsonText = extractJsonSegmentAfterMarker(source, marker, "[");
    if (!jsonText) continue;
    try {
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // keep scanning
    }
  }
  return [];
}

function selectPreferredYouTubeCaptionTrack(tracks) {
  if (!Array.isArray(tracks) || tracks.length === 0) return null;
  const scoreTrack = (track) => {
    const languageCode = normalizeSearchText(track?.languageCode || "");
    const vssId = normalizeSearchText(track?.vssId || "");
    const name = normalizeSearchText(firstStringValue(track?.name));
    let score = 0;
    if (track?.kind !== "asr") score += 100;
    if (/^en(?:[-_]|$)/.test(languageCode)) score += 60;
    if (/^\.en(?:[-_]|$)/.test(vssId) || /\.en\b/.test(vssId)) score += 40;
    if (name.includes("english")) score += 30;
    if (track?.isTranslatable) score += 5;
    return score;
  };

  return [...tracks].sort((a, b) => scoreTrack(b) - scoreTrack(a))[0] || null;
}

function buildYouTubeTranscriptRequestUrl(track) {
  const baseUrl = firstStringValue(track?.baseUrl || track?.base_url);
  if (!baseUrl) return "";
  if (/[?&]fmt=/.test(baseUrl)) return baseUrl;
  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=json3`;
}

function parseYouTubeTranscriptJson3(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw);
    const events = Array.isArray(parsed?.events) ? parsed.events : [];
    const lines = events
      .map((event) => {
        const segs = Array.isArray(event?.segs) ? event.segs : [];
        return normalizeSingleLineText(decodeHtmlEntities(segs.map((seg) => String(seg?.utf8 || "")).join("")));
      })
      .filter(Boolean);
    return normalizeOrderedStringArray(lines).join("\n");
  } catch {
    return "";
  }
}

function parseYouTubeTranscriptXml(text) {
  const raw = String(text || "");
  const lines = [];
  const re = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  let match;
  while ((match = re.exec(raw))) {
    const line = normalizeSingleLineText(
      decodeHtmlEntities(String(match[1] || "").replace(/<[^>]+>/g, " "))
    );
    if (line) lines.push(line);
  }
  return normalizeOrderedStringArray(lines).join("\n");
}

function parseYouTubeTranscriptText(text) {
  return parseYouTubeTranscriptJson3(text) || parseYouTubeTranscriptXml(text) || "";
}

function assembleUrlTranscriptionContext({
  url = "",
  pageText = "",
  transcriptText = "",
  sourceType = "",
  sourceTitle = "",
  descriptionText = "",
  includePageText = true,
} = {}) {
  const sections = [`URL: ${normalizeSingleLineText(url)}`];
  const normalizedSourceType = normalizeSingleLineText(sourceType);
  if (normalizedSourceType) sections.push(`Source type: ${normalizedSourceType}`);
  const normalizedSourceTitle = normalizeSingleLineText(sourceTitle);
  if (normalizedSourceTitle) sections.push(`Source title: ${normalizedSourceTitle}`);
  const description = String(descriptionText || "").trim();
  if (description) sections.push(`Description:\n${description.slice(0, 8000)}`);
  const transcript = String(transcriptText || "").trim();
  const page = String(pageText || "").trim();
  if (transcript) sections.push(`Transcript:\n${transcript.slice(0, 24000)}`);
  if (includePageText && page) {
    sections.push(`${transcript ? "Page text" : "Content"}:\n${page.slice(0, transcript ? 8000 : 18000)}`);
  }
  return sections.join("\n\n");
}

function extractImageUrl(value) {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return normalizeSingleLineText(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof value === "object") {
    return (
      firstStringValue(value.url)
      || firstStringValue(value.contentUrl)
      || firstStringValue(value["@id"])
      || ""
    );
  }
  return "";
}

function collectRecipeInstructionLines(value, out) {
  if (!Array.isArray(out)) return;
  if (value == null) return;
  if (typeof value === "string" || typeof value === "number") {
    const text = normalizeSingleLineText(String(value).replace(/^\d+\.\s*/, ""));
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRecipeInstructionLines(item, out);
    return;
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "text")) {
      collectRecipeInstructionLines(value.text, out);
    }
    if (Object.prototype.hasOwnProperty.call(value, "itemListElement")) {
      collectRecipeInstructionLines(value.itemListElement, out);
    }
    if (Object.prototype.hasOwnProperty.call(value, "steps")) {
      collectRecipeInstructionLines(value.steps, out);
    }
    if (Object.prototype.hasOwnProperty.call(value, "instructions")) {
      collectRecipeInstructionLines(value.instructions, out);
    }
    if (
      !Object.prototype.hasOwnProperty.call(value, "text")
      && !Object.prototype.hasOwnProperty.call(value, "itemListElement")
      && !Object.prototype.hasOwnProperty.call(value, "steps")
      && !Object.prototype.hasOwnProperty.call(value, "instructions")
      && Object.prototype.hasOwnProperty.call(value, "name")
    ) {
      collectRecipeInstructionLines(value.name, out);
    }
  }
}

function collectJsonLdRecipeObjects(node, out) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectJsonLdRecipeObjects(item, out);
    return;
  }
  if (typeof node !== "object") return;

  const rawType = node["@type"] ?? node.type;
  const types = Array.isArray(rawType) ? rawType : [rawType];
  if (types.some((t) => normalizeSearchText(t) === "recipe")) {
    out.push(node);
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") collectJsonLdRecipeObjects(value, out);
  }
}

function extractRecipeSeedFromHtml(html, sourceUrl = "") {
  const scripts = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(String(html || "")))) {
    const block = String(match[1] || "")
      .replace(/^\s*<!--/, "")
      .replace(/-->\s*$/, "")
      .trim();
    if (block) scripts.push(block);
  }

  const candidates = [];
  for (const block of scripts) {
    try {
      const parsed = JSON.parse(block);
      collectJsonLdRecipeObjects(parsed, candidates);
    } catch {
      // ignore malformed script blocks
    }
  }

  if (candidates.length === 0) {
    return {
      title: "",
      ingredients: [],
      directions: [],
      notes: [],
      prepTime: "",
      cookTime: "",
      portions: "",
      link: normalizeSingleLineText(sourceUrl),
      cover: "",
    };
  }

  const scoreCandidate = (candidate) => {
    const ingredientCount = Array.isArray(candidate.recipeIngredient) ? candidate.recipeIngredient.length : 0;
    const directionLines = [];
    collectRecipeInstructionLines(candidate.recipeInstructions, directionLines);
    return ingredientCount + directionLines.length;
  };

  const best = candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a))[0];
  const directions = [];
  collectRecipeInstructionLines(best.recipeInstructions, directions);

  const link = firstStringValue(best.url)
    || firstStringValue(best.mainEntityOfPage)
    || normalizeSingleLineText(sourceUrl);
  const notes = [];
  const description = firstStringValue(best.description);
  if (description) notes.push(description);

  return {
    title: firstStringValue(best.name) || firstStringValue(best.headline),
    ingredients: normalizeStringArray(Array.isArray(best.recipeIngredient) ? best.recipeIngredient : []),
    directions: normalizeStringArray(directions),
    notes: normalizeStringArray(notes),
    prepTime: normalizeDurationText(best.prepTime),
    cookTime: normalizeDurationText(best.cookTime),
    portions: firstStringValue(best.recipeYield),
    link,
    cover: extractImageUrl(best.image),
  };
}

function mergeTranscribedRecipeData(primary, seed, sourceUrl = "") {
  const base = primary && typeof primary === "object" ? primary : {};
  const fallback = seed && typeof seed === "object" ? seed : {};
  const normalizedSourceUrl = normalizeSingleLineText(sourceUrl);
  const titlePrimary = normalizeSingleLineText(base.title);
  const titleFallback = normalizeSingleLineText(fallback.title);
  const title = (!titlePrimary || /^https?:\/\//i.test(titlePrimary))
    ? (titleFallback || titlePrimary || "Transcribed Recipe")
    : titlePrimary;

  const ingredientsPrimary = normalizeStringArray(base.ingredients);
  const ingredientsFallback = normalizeStringArray(fallback.ingredients);
  const directionsPrimary = normalizeStringArray(base.directions);
  const directionsFallback = normalizeStringArray(fallback.directions);
  const notesPrimary = normalizeStringArray(base.notes);
  const notesFallback = normalizeStringArray(fallback.notes);

  return {
    title,
    ingredients: ingredientsPrimary.length > 0 ? ingredientsPrimary : ingredientsFallback,
    directions: directionsPrimary.length > 0 ? directionsPrimary : directionsFallback,
    notes: normalizeStringArray([...notesPrimary, ...notesFallback]),
    prepTime: normalizeDurationText(base.prepTime || base.prep_time || base.prep || fallback.prepTime),
    cookTime: normalizeDurationText(base.cookTime || base.cook_time || base.cook || fallback.cookTime),
    portions: firstStringValue(base.portions || base.servings || base.recipeYield || fallback.portions),
    link: firstStringValue(normalizedSourceUrl || base.link || base.url || fallback.link),
    cover: firstStringValue(base.cover || base.image || base.thumbnail || fallback.cover),
  };
}

function yamlQuoted(value) {
  return JSON.stringify(normalizeSingleLineText(value));
}

function convertDirectionTemperaturesToMetric(line) {
  const raw = String(line || "");
  if (!raw.trim()) return raw;
  const isOvenLine = /\b(oven|preheat|bake|roast)\b/i.test(raw);

  const toMetric = (fahrenheit) => {
    const celsius = Math.round((Number(fahrenheit) - 32) * 5 / 9);
    if (!Number.isFinite(celsius)) return `${fahrenheit}`;
    if (!isOvenLine) return `${celsius}\u00b0C`;
    const fan = Math.max(0, celsius - 20);
    return `${celsius}\u00b0C (fan ${fan}\u00b0C)`;
  };

  let updated = raw.replace(
    /(\d{2,3})(?:\s*\u00b0?\s*F\b|\s*degrees?\s*F(?:ahrenheit)?)/gi,
    (_, f) => toMetric(f)
  );

  if (isOvenLine && !/\bfan\b/i.test(updated)) {
    updated = updated.replace(
      /(\d{2,3})(?:\s*\u00b0?\s*C\b|\s*degrees?\s*C(?:elsius)?)/gi,
      (_, c) => {
        const celsius = Number(c);
        if (!Number.isFinite(celsius)) return `${c}`;
        const fan = Math.max(0, celsius - 20);
        return `${celsius}\u00b0C (fan ${fan}\u00b0C)`;
      }
    );
  }

  return updated;
}

function formatMetricAmount(amount) {
  if (Number.isInteger(amount)) return String(amount);
  return amount.toFixed(2).replace(/\.00$/, "").replace(/0$/, "");
}

function parseNumberLike(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Normalizes a frozen-portion count: never negative, capped to 2 decimals to
// match how generateWeeklyShoppingList persists projected frozen values.
function clampFrozenPortionValue(value) {
  const num = parseNumberLike(value, 0);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Number(num.toFixed(2));
}

// Applies a +/- step to a frozen-portion count, clamping at zero. Used by the
// frozen inventory manager's increment/decrement controls.
function adjustFrozenPortionValue(current, delta) {
  const base = Math.max(0, parseNumberLike(current, 0));
  return clampFrozenPortionValue(base + parseNumberLike(delta, 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole days between an ISO timestamp and now. Returns null for missing or
// unparseable dates.
function frozenAgeInDays(lastUpdateIso, now = new Date()) {
  if (!lastUpdateIso) return null;
  const then = new Date(lastUpdateIso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return null;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (Number.isNaN(nowMs)) return null;
  return Math.floor((nowMs - thenMs) / DAY_MS);
}

// Human-readable age of a frozen-inventory entry plus a staleness flag, for the
// frozen inventory manager. `lastUpdateIso` is the LastFrozenInventoryUpdate
// frontmatter value (the best available proxy for when it was frozen).
function describeFrozenAge(lastUpdateIso, { now = new Date(), staleDays = 90 } = {}) {
  const days = frozenAgeInDays(lastUpdateIso, now);
  if (days === null) return { label: "no freeze date recorded", days: null, isStale: false };
  let label;
  if (days <= 0) label = "frozen today";
  else if (days === 1) label = "frozen 1 day ago";
  else label = `frozen ${days} days ago`;
  const isStale = Number.isFinite(staleDays) && staleDays > 0 && days >= staleDays;
  return { label, days, isStale };
}

function parseBooleanLike(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

function extractWikiLinkpath(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/);
  return match ? match[1].trim() : "";
}

function getNodeCenter(node) {
  const x = typeof node?.x === "number" ? node.x : 0;
  const y = typeof node?.y === "number" ? node.y : 0;
  const width = typeof node?.width === "number" ? node.width : 0;
  const height = typeof node?.height === "number" ? node.height : 0;
  return { x: x + width / 2, y: y + height / 2 };
}

function classifySectionLabel(label) {
  const l = String(label || "").toLowerCase();
  if (l.includes("project")) return "project";
  if (l.includes("hosting")) return "hosting";
  return "default";
}

function isPointInGroupBounds(point, g) {
  const x = typeof g.x === "number" ? g.x : 0;
  const y = typeof g.y === "number" ? g.y : 0;
  const w = typeof g.width === "number" ? g.width : 0;
  const h = typeof g.height === "number" ? g.height : 0;
  return point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h;
}

function sectionForNode(node, groups) {
  const center = getNodeCenter(node);
  const containing = groups
    .filter((g) => isPointInGroupBounds(center, g))
    .sort((a, b) => (a.width * a.height) - (b.width * b.height));

  for (const g of containing) {
    const section = classifySectionLabel(g.label);
    if (section !== "default") return section;
  }

  return "default";
}

// Canonical Sunday..Saturday order, lowercase. The meal-plan canvas grid is
// day-columns (labeled with one of these names) x meal-type rows (any other
// non-project/hosting group label).
const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_DISPLAY_NAMES = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday",
};

function normalizeWeekStartDay(value) {
  const v = normalizeSearchText(value);
  return WEEKDAY_NAMES.includes(v) ? v : "saturday";
}

// The 7 weekday names in Sun..Sat order, rotated so index 0 is startDay —
// e.g. startDay "saturday" -> [saturday, sunday, monday, ... friday].
function getOrderedWeekdays(startDay) {
  const start = WEEKDAY_NAMES.indexOf(normalizeWeekStartDay(startDay));
  return [...WEEKDAY_NAMES.slice(start), ...WEEKDAY_NAMES.slice(0, start)];
}

// Chronological rank (0..6) of a weekday name relative to startDay; unknown
// or unscheduled (null/blank) days sort last.
function weekdayRank(dayName, startDay) {
  const normalized = normalizeSearchText(dayName);
  if (!normalized) return 999;
  const idx = getOrderedWeekdays(startDay).indexOf(normalized);
  return idx === -1 ? 999 : idx;
}

// Finds the smallest weekday-labeled group containing this node's center, or
// null if the card isn't sitting inside a recognizable day column.
function findContainingWeekdayLabel(node, groups) {
  const center = getNodeCenter(node);
  const candidates = groups
    .filter((g) => WEEKDAY_NAMES.includes(normalizeSearchText(g.label)))
    .filter((g) => isPointInGroupBounds(center, g))
    .sort((a, b) => (a.width * a.height) - (b.width * b.height));
  return candidates.length > 0 ? normalizeSearchText(candidates[0].label) : null;
}

// Finds the smallest non-weekday, non-project/hosting group containing this
// node's center — by convention that's the meal-type row (Breakfast, Dinner,
// ...), whatever the user has actually named it.
function findContainingMealTypeLabel(node, groups) {
  const center = getNodeCenter(node);
  const candidates = groups
    .filter((g) => !WEEKDAY_NAMES.includes(normalizeSearchText(g.label)))
    .filter((g) => classifySectionLabel(g.label) === "default")
    .filter((g) => isPointInGroupBounds(center, g))
    .sort((a, b) => (a.width * a.height) - (b.width * b.height));
  return candidates.length > 0 ? String(candidates[0].label || "").trim() : null;
}

// Rewrites weekday-labeled group nodes in a canvas template's JSON text so
// the leftmost day slot (smallest x) shows startDay, then the rest follow in
// chronological order. Only which weekday LABEL sits in which slot changes —
// the grid geometry (x/y/width/height, number of day slots) is left exactly
// as authored. Returns the input unchanged if it isn't parseable JSON or has
// no recognizable weekday groups (e.g. a heavily customized template).
function applyWeekStartDayToCanvasTemplate(templateContent, startDay) {
  let canvas;
  try {
    canvas = JSON.parse(templateContent);
  } catch {
    return templateContent;
  }
  if (!Array.isArray(canvas.nodes)) return templateContent;

  const dayGroups = canvas.nodes
    .filter((n) => n && n.type === "group" && WEEKDAY_NAMES.includes(normalizeSearchText(n.label)))
    .sort((a, b) => (Number(a.x) || 0) - (Number(b.x) || 0));
  if (dayGroups.length === 0) return templateContent;

  const orderedNames = getOrderedWeekdays(startDay);
  dayGroups.forEach((group, i) => {
    group.label = WEEKDAY_DISPLAY_NAMES[orderedNames[i % orderedNames.length]];
  });

  return `${JSON.stringify(canvas, null, 2)}\n`;
}

function parseCanvasRecipeEntries(canvasText) {
  let parsed;
  try {
    parsed = JSON.parse(canvasText);
  } catch {
    return [];
  }

  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const groups = nodes.filter((node) => node?.type === "group");
  const entries = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;

    if (node.type === "file" && typeof node.file === "string" && node.file.endsWith(".md")) {
      entries.push({ rawPath: normalizePath(node.file), section: sectionForNode(node, groups) });
    }

    if (typeof node.text === "string") {
      const matches = [...node.text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)];
      for (const m of matches) {
        entries.push({ rawPath: m[1].trim(), section: sectionForNode(node, groups) });
      }
    }
  }

  return entries;
}

class PositiveNumberPromptModal extends Modal {
  constructor(app, message, defaultValue, onSubmit, onCancel) {
    super(app);
    this.message = message;
    this.defaultValue = defaultValue;
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this.submitted = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText("Weekly Meal Shopper");
    contentEl.empty();

    contentEl.createEl("p", { text: this.message });
    const inputEl = contentEl.createEl("input", { type: "number" });
    inputEl.value = String(this.defaultValue);
    inputEl.min = "0";
    inputEl.step = "any";
    inputEl.style.width = "100%";
    inputEl.style.marginBottom = "12px";

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const okBtn = buttons.createEl("button", { text: "OK" });
    okBtn.addClass("mod-cta");

    const submit = () => {
      const value = Number(String(inputEl.value || "").trim());
      if (!Number.isFinite(value) || value <= 0) {
        new Notice("Please enter a number greater than zero.");
        inputEl.focus();
        inputEl.select();
        return;
      }
      this.submitted = true;
      this.onSubmit(value);
      this.close();
    };

    cancelBtn.addEventListener("click", () => {
      this.submitted = true;
      this.onCancel();
      this.close();
    });
    okBtn.addEventListener("click", submit);
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.submitted = true;
        this.onCancel();
        this.close();
      }
    });

    window.setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 0);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.submitted) this.onCancel();
  }
}

class IngredientEntryModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
    this.submitted = false;
    this.selectedCategory = String(this.options.initialCategory || "").trim();
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    const categories = Array.isArray(this.options.categories) ? this.options.categories : [];
    const requireCategory = this.options.requireCategory !== false;
    const showCategoryChooser = categories.length > 0;
    const includeUnit = !!this.options.includeUnit;
    titleEl.setText(this.options.title || "Add ingredient");
    contentEl.empty();

    const ingredientLabel = contentEl.createEl("label", { text: this.options.ingredientLabel || "Ingredient" });
    ingredientLabel.style.display = "block";
    ingredientLabel.style.marginBottom = "6px";
    const ingredientInput = contentEl.createEl("input", { type: "text" });
    ingredientInput.value = String(this.options.initialIngredient || "");
    ingredientInput.style.width = "100%";
    ingredientInput.style.marginBottom = "12px";

    let unitInput = null;
    if (includeUnit) {
      const unitLabel = contentEl.createEl("label", { text: this.options.unitLabel || "Unit (optional)" });
      unitLabel.style.display = "block";
      unitLabel.style.marginBottom = "6px";
      unitInput = contentEl.createEl("input", { type: "text" });
      unitInput.value = String(this.options.initialUnit || "");
      unitInput.style.width = "100%";
      unitInput.style.marginBottom = "12px";
    }

    let categoryWrap = null;
    if (showCategoryChooser) {
      const categoryHeading = contentEl.createEl("p", { text: requireCategory ? "Category (required)" : "Category (optional)" });
      categoryHeading.style.margin = "0 0 6px 0";
      categoryHeading.style.fontWeight = "600";
      categoryWrap = contentEl.createDiv({ cls: "weekly-meal-shopper-category-checkboxes" });
    }
    const categoryInputs = [];

    for (const category of categories) {
      if (!categoryWrap) break;
      const option = categoryWrap.createEl("label", { cls: "weekly-meal-shopper-category-label" });
      const checkbox = option.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selectedCategory === category;
      option.appendText(category);
      categoryInputs.push({ category, checkbox });
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.selectedCategory = category;
          for (const entry of categoryInputs) {
            if (entry.checkbox !== checkbox) entry.checkbox.checked = false;
          }
          return;
        }
        if (this.selectedCategory === category) this.selectedCategory = "";
      });
    }

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";
    buttons.style.marginTop = "12px";

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const okBtn = buttons.createEl("button", { text: this.options.submitText || "Add" });
    okBtn.addClass("mod-cta");

    const submit = () => {
      const ingredient = String(ingredientInput.value || "").trim();
      if (!ingredient) {
        new Notice("Please enter an ingredient name.");
        ingredientInput.focus();
        return;
      }
      if (requireCategory && showCategoryChooser && !this.selectedCategory) {
        new Notice("Please select a category.");
        return;
      }

      this.submitted = true;
      this.options.onSubmit?.({
        ingredient,
        category: this.selectedCategory,
        unit: String(unitInput?.value || "").trim(),
      });
      this.close();
    };

    cancelBtn.addEventListener("click", () => {
      this.submitted = true;
      this.options.onCancel?.();
      this.close();
    });
    okBtn.addEventListener("click", submit);
    ingredientInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.submitted = true;
        this.options.onCancel?.();
        this.close();
      }
    });

    window.setTimeout(() => {
      ingredientInput.focus();
      ingredientInput.select();
    }, 0);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.submitted) this.options.onCancel?.();
  }
}

// Lists every recipe note with its current FrozenPortionsAvailable value and
// lets the user increment / decrement / zero each one inline. Writes are
// persisted immediately to frontmatter.
class FrozenInventoryModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  readFrozenValue(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    return clampFrozenPortionValue(fm.FrozenPortionsAvailable);
  }

  readFrozenUpdateIso(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    return fm.LastFrozenInventoryUpdate || "";
  }

  get staleDays() {
    return parseNumberLike(this.plugin.settings.frozenStaleWarningDays, 90);
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText("Manage frozen portions");
    contentEl.empty();

    const recipes = this.app.vault
      .getMarkdownFiles()
      .filter((file) => this.plugin.isRecipeFile(file))
      .sort((a, b) => a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" }));

    if (recipes.length === 0) {
      contentEl.createEl("p", { text: "No recipe notes found." });
      return;
    }

    const intro = contentEl.createEl("p", {
      text: "Adjust how many cooked portions you currently have frozen for each recipe. Changes save immediately.",
    });
    intro.style.marginTop = "0";

    const searchInput = contentEl.createEl("input", { type: "text" });
    searchInput.placeholder = "Filter recipes…";
    searchInput.style.width = "100%";
    searchInput.style.marginBottom = "12px";

    const listEl = contentEl.createDiv({ cls: "weekly-meal-shopper-frozen-list" });
    listEl.style.maxHeight = "55vh";
    listEl.style.overflowY = "auto";

    const rows = recipes.map((file) => this.buildRow(listEl, file));

    const applyFilter = () => {
      const query = normalizeSearchText(searchInput.value || "");
      for (const row of rows) {
        const match = !query || normalizeSearchText(row.file.basename).includes(query);
        row.el.style.display = match ? "flex" : "none";
      }
    };
    searchInput.addEventListener("input", applyFilter);

    window.setTimeout(() => searchInput.focus(), 0);
  }

  buildRow(listEl, file) {
    let value = this.readFrozenValue(file);

    const row = listEl.createDiv({ cls: "weekly-meal-shopper-frozen-row" });
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "8px";
    row.style.padding = "6px 0";
    row.style.borderBottom = "1px solid var(--background-modifier-border)";

    const nameCol = row.createDiv();
    nameCol.style.flex = "1";
    nameCol.style.overflow = "hidden";
    nameCol.style.minWidth = "0";

    const nameEl = nameCol.createDiv({ text: file.basename });
    nameEl.style.overflow = "hidden";
    nameEl.style.textOverflow = "ellipsis";
    nameEl.style.whiteSpace = "nowrap";

    const ageEl = nameCol.createDiv();
    ageEl.style.fontSize = "var(--font-ui-smaller)";
    ageEl.style.color = "var(--text-muted)";

    const refreshAge = () => {
      const age = describeFrozenAge(this.readFrozenUpdateIso(file), { staleDays: this.staleDays });
      if (value <= 0) {
        ageEl.setText("");
        return;
      }
      ageEl.setText(age.isStale ? `${age.label} ⚠️ check before eating` : age.label);
      ageEl.style.color = age.isStale ? "var(--text-error)" : "var(--text-muted)";
    };
    refreshAge();

    const controls = row.createDiv();
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "6px";

    const decBtn = controls.createEl("button", { text: "−" });
    const input = controls.createEl("input", { type: "number" });
    input.min = "0";
    input.step = "0.5";
    input.value = String(value);
    input.style.width = "64px";
    input.style.textAlign = "center";
    const incBtn = controls.createEl("button", { text: "+" });
    const zeroBtn = controls.createEl("button", { text: "Zero" });

    const commit = async (nextValue) => {
      value = clampFrozenPortionValue(nextValue);
      input.value = String(value);
      await this.plugin.setRecipeFrozenPortions(file, value);
      // The write just stamped LastFrozenInventoryUpdate to now; reflect that
      // immediately rather than waiting on the metadata cache.
      if (value <= 0) {
        ageEl.setText("");
      } else {
        const age = describeFrozenAge(new Date().toISOString(), { staleDays: this.staleDays });
        ageEl.setText(age.label);
        ageEl.style.color = "var(--text-muted)";
      }
    };

    decBtn.addEventListener("click", () => commit(adjustFrozenPortionValue(value, -1)));
    incBtn.addEventListener("click", () => commit(adjustFrozenPortionValue(value, 1)));
    zeroBtn.addEventListener("click", () => commit(0));
    input.addEventListener("change", () => commit(input.value));

    return { file, el: row };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TextEntryModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
    this.submitted = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.options.title || "Add item");
    contentEl.empty();

    const label = contentEl.createEl("label", { text: this.options.label || "Name" });
    label.style.display = "block";
    label.style.marginBottom = "6px";

    const input = contentEl.createEl("input", { type: "text" });
    input.value = String(this.options.initialValue || "");
    input.style.width = "100%";
    input.style.marginBottom = "12px";

    let checkbox = null;
    if (this.options.checkboxLabel) {
      const checkboxRow = contentEl.createEl("label");
      checkboxRow.style.display = "flex";
      checkboxRow.style.alignItems = "center";
      checkboxRow.style.gap = "8px";
      checkboxRow.style.marginBottom = "12px";

      checkbox = checkboxRow.createEl("input", { type: "checkbox" });
      checkbox.checked = this.options.checkboxValue === true;
      checkboxRow.createEl("span", { text: this.options.checkboxLabel });
    }

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const okBtn = buttons.createEl("button", { text: this.options.submitText || "Add" });
    okBtn.addClass("mod-cta");

    const submit = () => {
      const value = String(input.value || "").trim();
      if (!value) {
        new Notice(this.options.emptyError || "Please enter a value.");
        input.focus();
        return;
      }
      this.submitted = true;
      this.options.onSubmit?.(
        checkbox
          ? {
            value,
            checkboxValue: checkbox.checked,
          }
          : value
      );
      this.close();
    };

    cancelBtn.addEventListener("click", () => {
      this.submitted = true;
      this.options.onCancel?.();
      this.close();
    });
    okBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.submitted = true;
        this.options.onCancel?.();
        this.close();
      }
    });

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.submitted) this.options.onCancel?.();
  }
}

// Lets the user manually pin an ingredient's per-100g macros — either by
// searching/picking an existing database entry (auto-fills the number
// fields, which stay editable) or typing values directly. Always saves
// whatever the four number fields hold, regardless of how they got there.
class NutritionMatchModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
    this.submitted = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    titleEl.setText(`Nutrition match: ${this.options.ingredient || ""}`);

    const current = this.options.currentMacros;
    contentEl.createEl("p", {
      text: current
        ? `Currently resolves to ${Math.round(current.kcal)} kcal, ${Math.round(current.protein)}g protein, ${Math.round(current.carbs)}g carbs, ${Math.round(current.fat)}g fat per 100g.`
        : "No current match — this ingredient doesn't resolve to anything yet.",
    }).addClass("weekly-meal-shopper-empty");

    const searchLabel = contentEl.createEl("label", { text: "Search existing database entries" });
    searchLabel.style.display = "block";
    searchLabel.style.marginTop = "10px";
    searchLabel.style.marginBottom = "6px";
    const searchInput = contentEl.createEl("input", { type: "search", placeholder: "e.g. chicken breast" });
    searchInput.style.width = "100%";
    searchInput.style.marginBottom = "6px";

    const resultsEl = contentEl.createDiv();
    resultsEl.style.maxHeight = "140px";
    resultsEl.style.overflowY = "auto";
    resultsEl.style.marginBottom = "12px";

    const fieldsWrap = contentEl.createDiv();
    fieldsWrap.style.display = "grid";
    fieldsWrap.style.gridTemplateColumns = "1fr 1fr";
    fieldsWrap.style.gap = "8px";
    fieldsWrap.style.marginBottom = "12px";

    const makeNumberField = (label, initial) => {
      const wrap = fieldsWrap.createDiv();
      const l = wrap.createEl("label", { text: label });
      l.style.display = "block";
      l.style.fontSize = "12px";
      l.style.marginBottom = "4px";
      const input = wrap.createEl("input", { type: "number" });
      input.value = Number.isFinite(initial) ? String(initial) : "";
      input.style.width = "100%";
      return input;
    };

    const kcalInput = makeNumberField("kcal (per 100g)", current?.kcal);
    const proteinInput = makeNumberField("Protein (g)", current?.protein);
    const carbsInput = makeNumberField("Carbs (g)", current?.carbs);
    const fatInput = makeNumberField("Fat (g)", current?.fat);

    const applyEntry = (macros) => {
      kcalInput.value = Number.isFinite(macros.kcal) ? String(macros.kcal) : "";
      proteinInput.value = Number.isFinite(macros.protein) ? String(macros.protein) : "";
      carbsInput.value = Number.isFinite(macros.carbs) ? String(macros.carbs) : "";
      fatInput.value = Number.isFinite(macros.fat) ? String(macros.fat) : "";
    };

    const renderResults = (query) => {
      resultsEl.empty();
      const normalized = normalizeSearchText(query);
      if (!normalized) return;
      const entries = Array.isArray(this.options.entries) ? this.options.entries : [];
      const matches = entries.filter(([pattern]) => pattern.includes(normalized)).slice(0, 20);
      for (const [pattern, macros] of matches) {
        const row = resultsEl.createDiv({ cls: "weekly-meal-shopper-entry-row" });
        row.style.cursor = "pointer";
        row.createEl("span", { text: `${pattern} — ${Math.round(macros.kcal)} kcal`, cls: "weekly-meal-shopper-entry-text" });
        row.addEventListener("click", () => applyEntry(macros));
      }
    };
    searchInput.addEventListener("input", () => renderResults(searchInput.value));

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const saveBtn = buttons.createEl("button", { text: "Save override" });
    saveBtn.addClass("mod-cta");

    const submit = () => {
      const macros = {
        kcal: Number(kcalInput.value) || 0,
        protein: Number(proteinInput.value) || 0,
        carbs: Number(carbsInput.value) || 0,
        fat: Number(fatInput.value) || 0,
      };
      this.submitted = true;
      this.options.onSubmit?.(macros);
      this.close();
    };

    cancelBtn.addEventListener("click", () => {
      this.submitted = true;
      this.options.onCancel?.();
      this.close();
    });
    saveBtn.addEventListener("click", submit);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.submitted) this.options.onCancel?.();
  }
}

class TemplateSetupModal extends Modal {
  constructor(app, options) {
    super(app);
    this.options = options || {};
    this.submitted = false;
  }

  onOpen() {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.options.title || "First-Time Setup");
    contentEl.empty();

    if (this.options.description) {
      contentEl.createEl("p", {
        text: this.options.description,
        cls: "weekly-meal-shopper-help",
      });
    }

    const canvasLabel = contentEl.createEl("label", { text: "Canvas template location" });
    canvasLabel.style.display = "block";
    canvasLabel.style.marginBottom = "6px";

    const canvasInput = contentEl.createEl("input", { type: "text" });
    canvasInput.value = String(this.options.canvasPath || "");
    canvasInput.placeholder = DEFAULT_SETTINGS.mealPrepCanvasTemplateVaultPath;
    canvasInput.style.width = "100%";
    canvasInput.style.marginBottom = "12px";

    const recipeLabel = contentEl.createEl("label", { text: "Recipe template location" });
    recipeLabel.style.display = "block";
    recipeLabel.style.marginBottom = "6px";

    const recipeInput = contentEl.createEl("input", { type: "text" });
    recipeInput.value = String(this.options.recipePath || "");
    recipeInput.placeholder = DEFAULT_SETTINGS.recipeTemplateVaultPath;
    recipeInput.style.width = "100%";
    recipeInput.style.marginBottom = "12px";

    const buttons = contentEl.createDiv();
    buttons.style.display = "flex";
    buttons.style.justifyContent = "flex-end";
    buttons.style.gap = "8px";

    const cancelBtn = buttons.createEl("button", { text: "Cancel" });
    const okBtn = buttons.createEl("button", { text: this.options.submitText || "Save + Populate" });
    okBtn.addClass("mod-cta");

    const submit = () => {
      const canvasPath = String(canvasInput.value || "").trim() || DEFAULT_SETTINGS.mealPrepCanvasTemplateVaultPath;
      const recipePath = String(recipeInput.value || "").trim() || DEFAULT_SETTINGS.recipeTemplateVaultPath;
      this.submitted = true;
      this.options.onSubmit?.({ canvasPath, recipePath });
      this.close();
    };

    const cancel = () => {
      this.submitted = true;
      this.options.onCancel?.();
      this.close();
    };

    const handleKeydown = (event, nextInput = null) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submit();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
          return;
        }
        submit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    };

    cancelBtn.addEventListener("click", cancel);
    okBtn.addEventListener("click", submit);
    canvasInput.addEventListener("keydown", (event) => handleKeydown(event, recipeInput));
    recipeInput.addEventListener("keydown", (event) => handleKeydown(event));

    window.setTimeout(() => {
      canvasInput.focus();
      canvasInput.select();
    }, 0);
  }

  onClose() {
    this.contentEl.empty();
    if (!this.submitted) this.options.onCancel?.();
  }
}

// ── Recipe card helpers (originally from recipe-view-alt) ─────────────────────

const RECIPE_CARD_FRACTION_MAP = {
  "1/2": "1⁄2", "1/3": "1⁄3", "2/3": "2⁄3",
  "1/4": "1⁄4", "3/4": "3⁄4", "1/8": "1⁄8",
};

function recipeCardStripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).replace(/^\n+/, "");
}

function recipeCardSplitSections(markdown) {
  const lines = recipeCardStripFrontmatter(markdown).split(/\r?\n/);
  const sections = [];
  let current = { heading: "", level: 0, lines: [] };
  for (const line of lines) {
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      sections.push(current);
      current = { heading: h[2].trim(), level: h[1].length, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function recipeCardNormalizeComponentKey(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function recipeCardParseComponentPairs(markdown) {
  const lines = recipeCardStripFrontmatter(markdown).split(/\r?\n/);
  let mode = "", sectionLevel = 0, currentKey = "", currentTitle = "";
  const ingMap = new Map(), dirMap = new Map(), titleMap = new Map();
  const ensure = (map, key) => { if (!map.has(key)) map.set(key, []); return map.get(key); };
  const setCurrent = (heading) => {
    const key = recipeCardNormalizeComponentKey(heading);
    currentKey = key || "";
    currentTitle = heading || "";
    if (key && !titleMap.has(key)) titleMap.set(key, heading);
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const norm = recipeCardNormalizeComponentKey(text);
      if (norm === "ingredients") { mode = "ingredients"; sectionLevel = level; currentKey = ""; currentTitle = ""; continue; }
      if (norm === "directions" || norm === "method" || norm === "instructions") { mode = "directions"; sectionLevel = level; currentKey = ""; currentTitle = ""; continue; }
      if (!mode) continue;
      if (level <= sectionLevel) { mode = ""; sectionLevel = 0; currentKey = ""; currentTitle = ""; continue; }
      setCurrent(text); continue;
    }
    if (!mode) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (mode === "ingredients") {
      if (/^[-*+]\s+/.test(trimmed)) { const key = currentKey || "__base"; ensure(ingMap, key).push(trimmed); if (!titleMap.has(key) && currentTitle) titleMap.set(key, currentTitle); }
      continue;
    }
    if (mode === "directions") {
      if (/^\d+\.\s+/.test(trimmed) || /^[-*+]\s+/.test(trimmed) || currentKey) { const key = currentKey || "__base"; ensure(dirMap, key).push(trimmed); if (!titleMap.has(key) && currentTitle) titleMap.set(key, currentTitle); }
    }
  }
  const keys = [...new Set([...ingMap.keys(), ...dirMap.keys()])].filter((k) => k !== "__base");
  const hasStructured = keys.length > 0 && keys.some((k) => ingMap.has(k) && dirMap.has(k));
  if (!hasStructured) return [];
  return keys.map((key) => ({
    key,
    title: titleMap.get(key) || key,
    ingredientsMarkdown: (ingMap.get(key) || []).join("\n"),
    directionsMarkdown: (dirMap.get(key) || []).join("\n"),
  }));
}

function recipeCardMaybeRenderFractions(text, enabled) {
  if (!enabled) return text;
  let out = text;
  for (const [ascii, uni] of Object.entries(RECIPE_CARD_FRACTION_MAP)) {
    out = out.replace(new RegExp(`\\b${ascii.replace("/", "\\/")}\\b`, "g"), uni);
  }
  return out;
}

// Modal-style recipe card with planning toolbar (Add to Weekly Plan, etc.)
class RecipeCardModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.resizeObserver = null;
  }

  async onOpen() {
    this.modalEl.addClass("recipe-view-alt-modal");
    const { contentEl, titleEl } = this;
    titleEl.setText(this.file.basename);
    contentEl.empty();

    const root = contentEl.createDiv({ cls: "recipe-view-alt-root" });
    const toolbar = root.createDiv({ cls: "recipe-view-alt-toolbar" });

    const addBtn = (label, fn, cta = false) => {
      const btn = toolbar.createEl("button", { text: label });
      if (cta) btn.addClass("mod-cta");
      btn.addEventListener("click", fn);
      return btn;
    };

    addBtn("Add To Weekly Plan", async () => this.plugin.addRecipeToCanvas(this.file.path, "default"));
    addBtn("Add As Project", async () => this.plugin.addRecipeToCanvas(this.file.path, "project"));
    addBtn("Add As Hosting", async () => this.plugin.addRecipeToCanvas(this.file.path, "hosting"));
    addBtn("Generate Shopping List", async () => {
      const ok = this.app.commands.executeCommandById("weekly-meal-shopper:generate-weekly-shopping-list-from-canvas");
      if (!ok) new Notice("Generate shopping list command not found.");
    }, true);

    const layout = root.createDiv({ cls: "recipe-view-alt-layout" });
    const side = layout.createDiv({ cls: "recipe-view-alt-col" });
    const main = layout.createDiv({ cls: "recipe-view-alt-col" });

    side.createDiv({ cls: "recipe-view-alt-label", text: "Ingredients / Side" });
    main.createDiv({ cls: "recipe-view-alt-label", text: "Directions / Main" });

    const markdown = await this.app.vault.read(this.file);
    const componentPairs = recipeCardParseComponentPairs(markdown);
    const sections = recipeCardSplitSections(markdown);
    const sideRegex = new RegExp(this.plugin.settings.recipeCardSideColumnRegex || "Ingredients", "i");

    let titleFromH1 = this.file.basename;
    const sideBlocks = [];
    const mainBlocks = [];

    for (const section of sections) {
      const raw = section.lines.join("\n").trim();
      if (!raw) continue;
      if (section.level === 1 && this.plugin.settings.recipeCardTreatH1AsFilename) {
        titleFromH1 = section.heading || titleFromH1;
        continue;
      }
      const block = recipeCardMaybeRenderFractions(raw, this.plugin.settings.recipeCardRenderUnicodeFractions);
      if (section.heading && sideRegex.test(section.heading)) sideBlocks.push(block);
      else mainBlocks.push(block);
    }

    titleEl.setText(titleFromH1);

    const renderBlocks = async (blocks, target) => {
      for (const block of blocks) {
        const wrapper = target.createDiv();
        await MarkdownRenderer.render(this.app, block, wrapper, this.file.path, this.plugin);
      }
    };

    if (componentPairs.length > 0) {
      layout.remove();
      const componentsRoot = root.createDiv({ cls: "recipe-view-alt-components" });
      componentsRoot.createDiv({ cls: "recipe-view-alt-label", text: "Components" });
      for (const pair of componentPairs) {
        const card = componentsRoot.createDiv({ cls: "recipe-view-alt-component" });
        card.createEl("h3", { cls: "recipe-view-alt-component-title", text: pair.title });
        const grid = card.createDiv({ cls: "recipe-view-alt-component-grid" });
        const iCol = grid.createDiv({ cls: "recipe-view-alt-component-col" });
        iCol.createDiv({ cls: "recipe-view-alt-label", text: "Ingredients" });
        const dCol = grid.createDiv({ cls: "recipe-view-alt-component-col" });
        dCol.createDiv({ cls: "recipe-view-alt-label", text: "Directions" });
        await MarkdownRenderer.render(this.app, pair.ingredientsMarkdown || "- (No component ingredients)", iCol, this.file.path, this.plugin);
        await MarkdownRenderer.render(this.app, pair.directionsMarkdown || "- (No component directions)", dCol, this.file.path, this.plugin);
      }
      const applyComponentLayout = () => {
        const grids = componentsRoot.querySelectorAll(".recipe-view-alt-component-grid");
        for (const grid of grids) {
          const single = grid.clientWidth < this.plugin.settings.recipeCardSingleColumnMaxWidth;
          grid.classList.toggle("single-column", single);
        }
      };
      this.resizeObserver = new ResizeObserver(() => applyComponentLayout());
      this.resizeObserver.observe(componentsRoot);
      applyComponentLayout();
      return;
    }

    await renderBlocks(sideBlocks.length ? sideBlocks : ["## Ingredients\n- No ingredients section found"], side);
    await renderBlocks(mainBlocks.length ? mainBlocks : ["## Directions\n- No directions section found"], main);

    const applyLayoutMode = () => {
      const width = layout.clientWidth;
      const single = width < this.plugin.settings.recipeCardSingleColumnMaxWidth;
      layout.toggleClass("single-column", single);
    };
    this.resizeObserver = new ResizeObserver(() => applyLayoutMode());
    this.resizeObserver.observe(layout);
    applyLayoutMode();
  }

  onClose() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.contentEl.empty();
    this.plugin.activeRecipeCardModal = null;
  }
}

class TranscribedIngredientReviewModal extends Modal {
  constructor(app, { title, rawIngredients, onSave, onDiscard }) {
    super(app);
    this.recipeTitle = title;
    this.rawIngredients = [...rawIngredients];
    this.onSave = onSave;
    this.onDiscard = onDiscard;
    this.saved = false;
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: `Review ingredients: ${this.recipeTitle}` });

    const desc = this.contentEl.createEl("p", { cls: "setting-item-description" });
    desc.setText(
      "Check each line before saving — this is the raw AI output before normalisation. " +
      "Edit, delete, or add lines. Press Ctrl+Enter to save, Escape to skip this recipe."
    );

    this.countEl = this.contentEl.createEl("p", { cls: "setting-item-description" });
    this.listContainer = this.contentEl.createDiv();
    this.renderList();

    const btnRow = this.contentEl.createDiv({ cls: "modal-button-container" });
    const discardBtn = btnRow.createEl("button", { text: "Skip recipe (don't save)" });
    discardBtn.setAttribute("title", "Discard this recipe and continue to the next one.");
    discardBtn.addEventListener("click", () => {
      this.saved = false;
      this.close();
    });
    const saveBtn = btnRow.createEl("button", { text: "Save recipe →", cls: "mod-cta" });
    saveBtn.setAttribute("title", "Save ingredients and continue (Ctrl+Enter).");
    saveBtn.addEventListener("click", () => {
      this.saved = true;
      this.close();
    });

    // Ctrl+Enter saves; Escape already closes via Obsidian Modal default.
    this.modalEl.addEventListener("keydown", (evt) => {
      if ((evt.ctrlKey || evt.metaKey) && evt.key === "Enter") {
        evt.preventDefault();
        this.saved = true;
        this.close();
      }
    });
  }

  updateCount() {
    const n = this.rawIngredients.filter((l) => l.trim()).length;
    if (this.countEl) this.countEl.setText(`${n} ingredient${n === 1 ? "" : "s"}`);
  }

  renderList() {
    this.listContainer.empty();
    this.rawIngredients.forEach((line, index) => {
      const row = this.listContainer.createDiv({ cls: "setting-item" });
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      const input = row.createEl("input", { type: "text", cls: "wms-review-input" });
      input.value = line;
      input.style.flex = "1";
      input.addEventListener("input", () => {
        this.rawIngredients[index] = input.value;
        this.updateCount();
      });
      // Tab to next row
      input.addEventListener("keydown", (evt) => {
        if (evt.key === "Tab" && !evt.shiftKey) {
          evt.preventDefault();
          const inputs = this.listContainer.querySelectorAll(".wms-review-input");
          if (index < inputs.length - 1) {
            inputs[index + 1].focus();
          } else {
            // Tab from last input → add new row
            this.rawIngredients.push("");
            this.renderList();
            const newInputs = this.listContainer.querySelectorAll(".wms-review-input");
            if (newInputs.length > 0) newInputs[newInputs.length - 1].focus();
          }
        }
      });
      const deleteBtn = row.createEl("button", { text: "×" });
      deleteBtn.setAttribute("title", "Remove this ingredient line");
      deleteBtn.addEventListener("click", () => {
        this.rawIngredients.splice(index, 1);
        this.renderList();
      });
    });

    const addBtn = this.listContainer.createEl("button", { text: "+ Add ingredient line" });
    addBtn.style.marginTop = "8px";
    addBtn.addEventListener("click", () => {
      this.rawIngredients.push("");
      this.renderList();
      const inputs = this.listContainer.querySelectorAll(".wms-review-input");
      if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });

    this.updateCount();
  }

  onClose() {
    this.contentEl.empty();
    if (this.saved) {
      this.onSave?.(this.rawIngredients.filter((l) => l.trim()));
    } else {
      this.onDiscard?.();
    }
  }
}

class WeeklyMealShopperPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.ensureIngredientCategoryConfigFile();
    await this.ensureUnitDensityConfigFile();
    await this.ensureUnitAliasConfigFile();
    await this.loadUnitDensityConfig();
    await this.loadUnitAliasConfig();
    // Fire-and-forget: this does a network download when macros is already
    // enabled from a previous session — must not block the rest of onload.
    this.ensureDownloadedNutritionDatasetIsActive();

    this.addSettingTab(new WeeklyMealShopperSettingTab(this.app, this));
    this.recipeViewOverlay = null;
    this.activeRecipeCardModal = null;
    this.parsedIngredientCache = new Map();
    this.mealCoveragePanelEl = null;
    this.mealCoverageListEl = null;
    this.activeCoverageCanvasFile = null;
    this.coverageDebounceTimer = null;
    this.coverageWriteInProgress = false;
    this.macroDetailsPanelEl = null;
    this.macroDetailsListEl = null;
    this.activeMacroDetailsCanvasFile = null;
    this.macroDetailsDebounceTimer = null;
    this.macroDetailsPanelCollapsed = false;
    this.macroDetailsCollapsedDays = new Set();
    this.registerMarkdownPostProcessor((element, context) => {
      this.attachShoppingListOverrideLinks(element, context);
    });

    this.addCommand({
      id: "open-recipe-view-in-current-tab",
      name: "Open recipe view in current tab",
      callback: async () => {
        await this.openRecipeViewInCurrentTab();
      },
    });

    this.addCommand({
      id: "create-recipe-note-from-template",
      name: "Create recipe note from template",
      callback: async () => {
        await this.createRecipeFromTemplate();
      },
    });

    this.addCommand({
      id: "populate-editable-recipe-template",
      name: "Populate editable recipe template in vault",
      callback: async () => {
        await this.populateEditableRecipeTemplateInVault();
      },
    });

    this.addCommand({
      id: "populate-editable-meal-prep-canvas-template",
      name: "Populate editable meal-prep canvas template in vault",
      callback: async () => {
        await this.populateEditableMealPrepCanvasTemplateInVault();
      },
    });

    this.addCommand({
      id: "set-active-canvas-as-weekly-plan",
      name: "Set active canvas as meal plan canvas (primary)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "canvas") return false;
        if (!checking) {
          this.settings.weeklyCanvasPath = file.path;
          this.saveSettings();
          new Notice(`Meal plan canvas (primary) set to ${file.path}`);
        }
        return true;
      },
    });

    this.addCommand({
      id: "set-active-canvas-as-second-plan",
      name: "Set active canvas as meal plan canvas (second prep session)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "canvas") return false;
        if (!checking) {
          this.settings.weeklyCanvasPath2 = file.path;
          this.saveSettings();
          new Notice(`Meal plan canvas (second prep session) set to ${file.path}`);
        }
        return true;
      },
    });

    this.addCommand({
      id: "standardize-current-recipe-format",
      name: "Standardize current recipe format",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") {
          new Notice("Open a recipe markdown file first.");
          return;
        }
        await this.standardizeRecipeFile(file, { useOpenAI: true });
      },
    });

    this.addCommand({
      id: "populate-recipe-ingredient-metadata",
      name: "Populate ingredient metadata from recipe section",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") {
          new Notice("Open a recipe markdown file first.");
          return;
        }

        try {
          await this.standardizeRecipeFile(file);
          const parsed = await this.parseIngredientsFromRecipeFile(file);
          await this.saveParsedIngredientsToFrontmatter(file, parsed);
          new Notice(
            `Saved ${parsed.length} parsed ingredients to ${this.settings.parsedIngredientsField} and refreshed direction highlighting.`
          );
        } catch (error) {
          new Notice(error?.message || String(error));
        }
      },
    });

    this.addCommand({
      id: "generate-weekly-shopping-list-from-canvas",
      name: "Generate weekly shopping list from meal-plan canvas",
      callback: async () => {
        await this.generateWeeklyShoppingList({ applyFrozenInventory: false });
      },
    });

    this.addCommand({
      id: "apply-frozen-leftovers-from-canvas",
      name: "Apply frozen leftovers from meal-plan canvas",
      callback: async () => {
        await this.generateWeeklyShoppingList({ applyFrozenInventory: true });
      },
    });

    this.addCommand({
      id: "show-frozen-portions-available",
      name: "Show frozen portions available",
      callback: async () => {
        await this.showFrozenPortionsAvailable();
      },
    });

    this.addCommand({
      id: "manage-frozen-portions-inventory",
      name: "Manage frozen portions inventory",
      callback: () => {
        this.openFrozenInventoryModal();
      },
    });

    this.addCommand({
      id: "validate-recipes",
      name: "Validate recipes (data-quality report)",
      callback: async () => {
        await this.validateRecipes();
      },
    });

    this.addCommand({
      id: "calculate-recipe-macros",
      name: "Calculate recipe macros",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") { new Notice("Open a recipe note first."); return; }
        await this.calculateRecipeMacros(file);
      },
    });

    this.addCommand({
      id: "calculate-macros-for-all-recipes",
      name: "Calculate macros for all recipes",
      callback: async () => {
        await this.calculateMacrosForAllRecipes();
      },
    });

    this.addCommand({
      id: "download-nutrition-dataset",
      name: "Download nutrition dataset (USDA Foundation Foods)",
      callback: async () => {
        await this.downloadNutritionDataset();
      },
    });

    this.addCommand({
      id: "set-nutrition-match-for-ingredient",
      name: "Set nutrition match for ingredient",
      callback: async () => {
        const result = await this.promptTextEntry({
          title: "Set nutrition match",
          label: "Ingredient name",
          submitText: "Next",
        });
        if (result.cancelled) return;
        const ingredient = String(result.value || "").trim();
        if (!ingredient) return;
        await this.openNutritionMatchModal(ingredient);
      },
    });

    this.addCommand({
      id: "create-weekly-meal-prep-canvas",
      name: "Open or create meal plan canvas",
      callback: async () => {
        await this.createWeeklyMealPrepCanvas();
      },
    });

    this.addCommand({
      id: "transcribe-recipe-from-url-entry",
      name: "Transcribe recipe from URL entry (website/YouTube)",
      callback: async () => {
        await this.transcribeRecipeFromUrlEntry();
      },
    });

    this.addCommand({
      id: "transcribe-recipes-from-image-folder",
      name: "Transcribe recipes from image folder",
      callback: async () => {
        await this.transcribeRecipesFromImageFolder();
      },
    });

    this.addCommand({
      id: "add-ingredient-override-from-current-shopping-line",
      name: "Add ingredient override from current shopping list line",
      callback: async () => {
        await this.addIngredientOverrideFromCurrentShoppingLine();
      },
    });

    // Recipe card modal (planning view — add to canvas, fractions, component layout)
    this.addCommand({
      id: "open-recipe-card-modal",
      name: "Open recipe card (planning view)",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") {
          new Notice("Open a markdown recipe note first.");
          return;
        }
        if (this.activeRecipeCardModal) {
          this.activeRecipeCardModal.close();
          return;
        }
        this.activeRecipeCardModal = new RecipeCardModal(this.app, this, file);
        this.activeRecipeCardModal.open();
      },
    });

    this.addCommand({
      id: "add-active-recipe-to-canvas-default",
      name: "Add active recipe to weekly meal plan (default)",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") { new Notice("Open a recipe note first."); return; }
        await this.addRecipeToCanvas(file.path, "default");
      },
    });

    this.addCommand({
      id: "add-active-recipe-to-canvas-project",
      name: "Add active recipe to weekly meal plan (project)",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") { new Notice("Open a recipe note first."); return; }
        await this.addRecipeToCanvas(file.path, "project");
      },
    });

    this.addCommand({
      id: "add-active-recipe-to-canvas-hosting",
      name: "Add active recipe to weekly meal plan (hosting)",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (!(file instanceof TFile) || file.extension !== "md") { new Notice("Open a recipe note first."); return; }
        await this.addRecipeToCanvas(file.path, "hosting");
      },
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => this.handleActiveLeafChangeForCoverage(leaf))
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => this.handleVaultModifyForCoverage(file))
    );
    this.app.workspace.onLayoutReady(() => {
      this.handleActiveLeafChangeForCoverage(this.app.workspace.activeLeaf);
    });
  }

  onunload() {
    if (this.activeRecipeCardModal) this.activeRecipeCardModal.close();
    this.closeRecipeViewOverlay({ restoreLivePreview: false });
    this.teardownMealCoverageOverlay();
    if (this.coverageDebounceTimer) clearTimeout(this.coverageDebounceTimer);
    this.teardownMacroDetailsOverlay();
    if (this.macroDetailsDebounceTimer) clearTimeout(this.macroDetailsDebounceTimer);
  }

  // Adds a recipe file node to the weekly meal-plan canvas.
  // section: "default" | "project" | "hosting"
  async addRecipeToCanvas(filePath, section = "default") {
    const canvasPath = normalizePath(this.settings.weeklyCanvasPath || DEFAULT_SETTINGS.weeklyCanvasPath);
    const target = this.app.vault.getAbstractFileByPath(canvasPath);
    if (!(target instanceof TFile) || target.extension !== "canvas") {
      new Notice(`Meal plan canvas not found: ${canvasPath}`);
      return false;
    }

    let canvas;
    try {
      canvas = JSON.parse(await this.app.vault.read(target));
    } catch {
      new Notice("Could not parse meal plan canvas JSON.");
      return false;
    }

    if (!Array.isArray(canvas.nodes)) canvas.nodes = [];
    if (!Array.isArray(canvas.edges)) canvas.edges = [];

    const normalizedFile = normalizePath(filePath);
    const alreadyPresent = canvas.nodes.find((n) => n && n.type === "file" && n.file === normalizedFile);
    if (alreadyPresent) {
      new Notice("Recipe already exists on the meal plan canvas.");
      return false;
    }

    let x = 100;
    let y = 100;

    const groups = canvas.nodes.filter((n) => n && n.type === "group");
    const labelPattern =
      section === "project" ? /project/i :
      section === "hosting" ? /hosting/i :
      null;
    const group = labelPattern ? groups.find((g) => labelPattern.test(String(g.label || ""))) : null;

    if (group) {
      const inGroup = canvas.nodes.filter((n) => {
        if (!n || n.type === "group") return false;
        const cx = (Number(n.x) || 0) + (Number(n.width) || 0) / 2;
        const cy = (Number(n.y) || 0) + (Number(n.height) || 0) / 2;
        return (
          cx >= (Number(group.x) || 0) &&
          cx <= (Number(group.x) || 0) + (Number(group.width) || 0) &&
          cy >= (Number(group.y) || 0) &&
          cy <= (Number(group.y) || 0) + (Number(group.height) || 0)
        );
      });
      x = (Number(group.x) || 0) + 24;
      y = (Number(group.y) || 0) + 24 + inGroup.length * 34;
    } else {
      const maxX = canvas.nodes.reduce((m, n) => Math.max(m, Number(n?.x) || 0), 0);
      y = 100 + canvas.nodes.filter((n) => n && n.type !== "group").length * 24;
      x = maxX + 120;
    }

    const nodeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    canvas.nodes.push({ id: nodeId, type: "file", file: normalizedFile, x, y, width: 380, height: 280 });

    await this.app.vault.modify(target, `${JSON.stringify(canvas, null, 2)}\n`);
    const basename = normalizedFile.split("/").pop()?.replace(/\.md$/, "") || normalizedFile;
    new Notice(`Added ${basename} to meal plan canvas (${section}).`);
    return true;
  }

  async loadSettings() {
    const savedSettings = await this.loadData() || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings);
    delete this.settings.workflowPreset;
    delete this.settings.featureBasicEnabled;
    delete this.settings.featureMealPrepEnabled;
    this.settings.excludedIngredientsExact = normalizeExactExclusionList(this.settings.excludedIngredientsExact);
    this.settings.ingredientOverrides = normalizeExactExclusionList(this.settings.ingredientOverrides);
    this.settings.mealPrepCanvasFolder = String(this.settings.mealPrepCanvasFolder || "Utility").trim() || "Utility";
    this.settings.mealPrepCanvasNameTemplate = String(
      this.settings.mealPrepCanvasNameTemplate || DEFAULT_SETTINGS.mealPrepCanvasNameTemplate
    ).trim() || DEFAULT_SETTINGS.mealPrepCanvasNameTemplate;
    this.settings.transcriptionImageFolder = String(this.settings.transcriptionImageFolder || "").trim()
      || "Utility/Recipe Image Inbox";
    this.settings.deleteTranscribedImages = this.settings.deleteTranscribedImages !== false;
    this.settings.recipeTemplateVaultPath = String(
      this.settings.recipeTemplateVaultPath || DEFAULT_SETTINGS.recipeTemplateVaultPath
    ).trim() || DEFAULT_SETTINGS.recipeTemplateVaultPath;
    this.settings.mealPrepCanvasTemplateVaultPath = String(
      this.settings.mealPrepCanvasTemplateVaultPath || DEFAULT_SETTINGS.mealPrepCanvasTemplateVaultPath
    ).trim() || DEFAULT_SETTINGS.mealPrepCanvasTemplateVaultPath;
    this.settings.recipeFolder = String(
      this.settings.recipeFolder || this.settings.transcriptionOutputFolder || "pages/Food and Drink/Recipes"
    ).trim() || "pages/Food and Drink/Recipes";
    delete this.settings.transcriptionOutputFolder;
    this.settings.measurementPreset = String(this.settings.measurementPreset || "vault_standard").trim().toLowerCase();
    if (
      !Object.prototype.hasOwnProperty.call(MEASUREMENT_PRESETS, this.settings.measurementPreset)
      && this.settings.measurementPreset !== "custom"
    ) {
      this.settings.measurementPreset = "vault_standard";
    }
    this.settings.cupMl = Number.isFinite(Number(this.settings.cupMl)) ? Number(this.settings.cupMl) : 250;
    this.settings.tbspMl = Number.isFinite(Number(this.settings.tbspMl)) ? Number(this.settings.tbspMl) : 15;
    this.settings.tspMl = Number.isFinite(Number(this.settings.tspMl)) ? Number(this.settings.tspMl) : 5;
    this.settings.measurementPreference = normalizeMeasurementPreference(this.settings.measurementPreference);
    this.settings.convertLiquidVolumeMeasuresToWeight = this.settings.convertLiquidVolumeMeasuresToWeight !== false;
    this.settings.energyUnit = normalizeEnergyUnit(this.settings.energyUnit);
    this.settings.macrosEnabled = this.settings.macrosEnabled === true;
    this.settings.nutritionLiveLookupEnabled = this.settings.nutritionLiveLookupEnabled === true;
    this.settings.nutritionLiveLookupProvider = normalizeNutritionLiveLookupProvider(this.settings.nutritionLiveLookupProvider);
    this.settings.usdaApiKey = String(this.settings.usdaApiKey || "").trim();
    this.settings.householdSize = positiveNumberOr(this.settings.householdSize, 1);
    this.settings.mealCoverageEnabled = this.settings.mealCoverageEnabled !== false;
    this.settings.macroDetailsEnabled = this.settings.macroDetailsEnabled === true;
    this.settings.weekStartDay = normalizeWeekStartDay(this.settings.weekStartDay);
    this.settings.coverageAcknowledgedShort = this.settings.coverageAcknowledgedShort && typeof this.settings.coverageAcknowledgedShort === "object"
      ? this.settings.coverageAcknowledgedShort
      : {};
    delete this.settings.cupShorthand;
    delete this.settings.tbspShorthand;
    delete this.settings.tspShorthand;
    this.settings.ingredientStorageSeparator = normalizeIngredientStorageSeparator(
      this.settings.ingredientStorageSeparator
    );
    this.settings.recipeViewIngredientDisplayTemplate = normalizeRecipeViewIngredientDisplayTemplate(
      savedSettings.recipeViewIngredientDisplayTemplate || savedSettings.ingredientLineTemplate
    );
    delete this.settings.ingredientLineTemplate;
    this.settings.transcriptionMetricOutput = this.settings.transcriptionMetricOutput !== false;
    if (typeof savedSettings.showRecipeUsageInShoppingList === "boolean") {
      this.settings.showRecipeUsageInShoppingList = savedSettings.showRecipeUsageInShoppingList;
    } else if (typeof savedSettings.showCategoryReasonsInShoppingList === "boolean") {
      this.settings.showRecipeUsageInShoppingList = savedSettings.showCategoryReasonsInShoppingList;
    } else {
      this.settings.showRecipeUsageInShoppingList = DEFAULT_SETTINGS.showRecipeUsageInShoppingList !== false;
    }
    delete this.settings.showCategoryReasonsInShoppingList;
    this.settings.includeOverrideLinksInShoppingList = this.settings.includeOverrideLinksInShoppingList === true;
    // Recipe card settings (merged from recipe-view-alt)
    this.settings.recipeCardSideColumnRegex = String(
      this.settings.recipeCardSideColumnRegex || DEFAULT_SETTINGS.recipeCardSideColumnRegex
    ).trim() || DEFAULT_SETTINGS.recipeCardSideColumnRegex;
    this.settings.recipeCardTreatH1AsFilename = this.settings.recipeCardTreatH1AsFilename === true;
    this.settings.recipeCardRenderUnicodeFractions = this.settings.recipeCardRenderUnicodeFractions !== false;
    this.settings.recipeCardSingleColumnMaxWidth = Number.isFinite(Number(this.settings.recipeCardSingleColumnMaxWidth))
      ? Number(this.settings.recipeCardSingleColumnMaxWidth)
      : DEFAULT_SETTINGS.recipeCardSingleColumnMaxWidth;
    delete this.settings.settingsImportExportPath;
    const sectionState = this.settings.settingsSectionState && typeof this.settings.settingsSectionState === "object"
      ? this.settings.settingsSectionState
      : {};
    this.settings.settingsSectionState = {
      firstTimeSetupCollapsed: !!sectionState.firstTimeSetupCollapsed,
      mealPrepSetupCollapsed: !!sectionState.mealPrepSetupCollapsed,
      recipeSetupCollapsed: !!sectionState.recipeSetupCollapsed,
      recipeCardCollapsed: !!sectionState.recipeCardCollapsed,
      ingredientFormatCollapsed: !!sectionState.ingredientFormatCollapsed,
      recipeTranscriptionCollapsed: !!sectionState.recipeTranscriptionCollapsed,
      shoppingCategoriesCollapsed: !!sectionState.shoppingCategoriesCollapsed,
      excludeIngredientsCollapsed: !!sectionState.excludeIngredientsCollapsed,
      ingredientOverridesCollapsed: !!sectionState.ingredientOverridesCollapsed,
      nutritionSectionCollapsed: !!sectionState.nutritionSectionCollapsed,
    };
    this.settings.transcriptionApiKey = String(this.settings.transcriptionApiKey || "").trim();
    if (typeof this.settings.useStoredTranscriptionApiKey !== "boolean") {
      this.settings.useStoredTranscriptionApiKey = !!this.normalizeApiKey(this.settings.transcriptionApiKey);
    }
    this.settings.transcriptionModel = String(this.settings.transcriptionModel || "gpt-4.1-mini").trim()
      || "gpt-4.1-mini";
    setActiveMeasurementProfile(this.settings);
    setActiveIngredientStorageSeparator(this.settings.ingredientStorageSeparator);
    setActiveRecipeViewIngredientDisplayTemplate(this.settings.recipeViewIngredientDisplayTemplate);
  }

  async saveSettings() {
    const legacyIngredientDisplayTemplate = this.settings.ingredientLineTemplate;
    delete this.settings.workflowPreset;
    delete this.settings.featureBasicEnabled;
    delete this.settings.featureMealPrepEnabled;
    delete this.settings.transcriptionOutputFolder;
    delete this.settings.showCategoryReasonsInShoppingList;
    delete this.settings.cupShorthand;
    delete this.settings.tbspShorthand;
    delete this.settings.tspShorthand;
    delete this.settings.ingredientLineTemplate;
    delete this.settings.settingsImportExportPath;
    if (this.settings.settingsSectionState && typeof this.settings.settingsSectionState === "object") {
      delete this.settings.settingsSectionState.workflowModeCollapsed;
      delete this.settings.settingsSectionState.settingsImportExportCollapsed;
    }
    this.settings.showRecipeUsageInShoppingList = this.settings.showRecipeUsageInShoppingList !== false;
    this.settings.ingredientStorageSeparator = normalizeIngredientStorageSeparator(this.settings.ingredientStorageSeparator);
    this.settings.recipeViewIngredientDisplayTemplate = normalizeRecipeViewIngredientDisplayTemplate(
      this.settings.recipeViewIngredientDisplayTemplate || legacyIngredientDisplayTemplate
    );
    this.settings.energyUnit = normalizeEnergyUnit(this.settings.energyUnit);
    this.settings.macrosEnabled = this.settings.macrosEnabled === true;
    this.settings.nutritionLiveLookupEnabled = this.settings.nutritionLiveLookupEnabled === true;
    this.settings.nutritionLiveLookupProvider = normalizeNutritionLiveLookupProvider(this.settings.nutritionLiveLookupProvider);
    this.settings.usdaApiKey = String(this.settings.usdaApiKey || "").trim();
    this.settings.householdSize = positiveNumberOr(this.settings.householdSize, 1);
    this.settings.mealCoverageEnabled = this.settings.mealCoverageEnabled !== false;
    this.settings.macroDetailsEnabled = this.settings.macroDetailsEnabled === true;
    this.settings.weekStartDay = normalizeWeekStartDay(this.settings.weekStartDay);
    setActiveMeasurementProfile(this.settings);
    setActiveIngredientStorageSeparator(this.settings.ingredientStorageSeparator);
    setActiveRecipeViewIngredientDisplayTemplate(this.settings.recipeViewIngredientDisplayTemplate);
    await this.saveData(this.settings);
  }

  getCommandUri(commandId) {
    const vaultName = this.app?.vault?.getName?.() || "";
    const qualified = `${this.manifest?.id || "weekly-meal-shopper"}:${commandId}`;
    return `obsidian://command?vault=${encodeURIComponent(vaultName)}&command=${encodeURIComponent(qualified)}`;
  }

  async ensureFolderPathExists(folderPath) {
    const normalized = normalizePath(String(folderPath || "").trim());
    if (!normalized) return;

    const segments = normalized.split("/").filter(Boolean);
    let current = "";
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.app.vault.createFolder(current);
        continue;
      }
      if (!(existing instanceof TFolder)) {
        throw new Error(`Cannot create folder "${normalized}" because "${current}" is a file.`);
      }
    }
  }

  buildMealPrepCanvasFilename(date = new Date()) {
    const template = String(
      this.settings.mealPrepCanvasNameTemplate || DEFAULT_SETTINGS.mealPrepCanvasNameTemplate
    );
    const isoDate = this.formatLocalIsoDate(date);
    const weekInfo = getIsoWeekInfo(date);
    const resolved = template
      .replace(/{{\s*date\s*}}/gi, isoDate)
      .replace(/{{\s*week\s*}}/gi, String(weekInfo.week))
      .replace(/{{\s*weekPadded\s*}}/gi, weekInfo.weekPadded)
      .replace(/{{\s*year\s*}}/gi, String(weekInfo.isoYear))
      .trim();
    if (!resolved) return `⛑️ Weekly Meal Plan Week ${weekInfo.week} ${weekInfo.isoYear}.canvas`;
    return resolved.endsWith(".canvas") ? resolved : `${resolved}.canvas`;
  }

  async createWeeklyMealPrepCanvas() {
    const canvasPath = normalizePath(this.settings.weeklyCanvasPath || DEFAULT_SETTINGS.weeklyCanvasPath);
    const parts = canvasPath.split("/");
    const folder = parts.slice(0, -1).join("/") || ".";
    await this.ensureFolderPathExists(folder);

    const existing = this.app.vault.getAbstractFileByPath(canvasPath);
    if (existing instanceof TFile && existing.extension === "canvas") {
      await this.app.workspace.getLeaf(true).openFile(existing);
      new Notice(`Opened meal plan canvas: ${existing.path}`);
      return existing;
    }

    let templateContent = "";
    try {
      templateContent = await this.readEditableVaultTemplate(
        this.getEditableMealPrepCanvasTemplatePath(),
        "Editable meal-prep canvas template not found. Run template setup in First-Time Setup first."
      );
    } catch (error) {
      new Notice(error?.message || String(error));
      return null;
    }
    templateContent = applyWeekStartDayToCanvasTemplate(templateContent, this.settings.weekStartDay);
    const created = await this.app.vault.create(
      canvasPath,
      templateContent.endsWith("\n") ? templateContent : `${templateContent}\n`
    );
    await this.app.workspace.getLeaf(true).openFile(created);
    new Notice(`Created meal plan canvas: ${created.path}`);
    return created;
  }

  attachShoppingListOverrideLinks(containerEl, context) {
    const sourcePath = normalizePath(context?.sourcePath || "");
    const shoppingListPath = normalizePath(this.settings.shoppingListOutputPath || "");
    if (!sourcePath || !shoppingListPath || sourcePath !== shoppingListPath) return;

    const anchors = containerEl?.querySelectorAll?.(`a[href^="${SHOPPING_OVERRIDE_LINK_PREFIX}"]`) || [];
    for (const anchor of anchors) {
      if (anchor?.dataset?.weeklyMealShopperOverrideBound === "true") continue;
      if (anchor?.dataset) anchor.dataset.weeklyMealShopperOverrideBound = "true";
      anchor.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ingredient = parseIngredientOverrideHref(anchor.getAttribute("href") || "");
        if (!ingredient) {
          new Notice("Could not determine the ingredient override target.");
          return;
        }
        void this.openIngredientOverrideModal(ingredient);
      });
    }
  }

  extractIngredientNameFromShoppingLine(line) {
    let text = String(line || "").trim();
    if (!text) return "";
    if (/^\s*[-*+]\s+\[\[/.test(text)) return "";
    text = text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "").trim();
    text = text.replace(/^\(([^)]+)\)\s*/, "").trim();
    text = text.replace(/\s+_\(why:[^)]+\)_\s*$/i, "").trim();
    text = text.replace(/\s+\[(?:override|why)\]\([^)]+\)\s*$/i, "").trim();
    return text;
  }

  getIngredientOverrideSeedFromEditor(editor) {
    if (!editor) return "";
    const selected = String(editor.getSelection?.() || "").trim();
    if (selected) return this.extractIngredientNameFromShoppingLine(selected);

    let lineNumber = Number(editor.getCursor?.().line || 0);
    let line = String(editor.getLine?.(lineNumber) || "");
    if (/^\s*-\s+\[\[/.test(line.trim()) && lineNumber > 0) {
      lineNumber -= 1;
      line = String(editor.getLine?.(lineNumber) || "");
    }
    return this.extractIngredientNameFromShoppingLine(line);
  }

  async saveExcludedIngredientEntry({ ingredient, category = "" }) {
    const value = cleanIngredientName(String(ingredient || ""));
    if (!value) return "";
    const map = parseExcludedIngredients(this.settings.excludedIngredientsExact);
    map.set(normalizeSearchText(value), {
      ingredient: value,
      category: String(category || "").trim(),
    });
    this.settings.excludedIngredientsExact = [...map.values()].map(
      (entry) => `${entry.ingredient} | ${entry.category || ""}`
    );
    await this.saveSettings();
    return value;
  }

  async saveIngredientOverrideEntry({ ingredient, category, unit }) {
    const value = cleanIngredientName(String(ingredient || ""));
    if (!value) return "";
    const nextMap = new Map();
    for (const entry of parseIngredientOverrideEntries(this.settings.ingredientOverrides)) {
      nextMap.set(entry.ingredient, entry);
    }
    nextMap.set(value, {
      ingredient: value,
      category: String(category || "").trim(),
      unit: String(unit || "").trim(),
    });
    this.settings.ingredientOverrides = [...nextMap.values()].map(
      (entry) => `${entry.ingredient} | ${entry.category} | ${entry.unit || ""}`
    );
    await this.saveSettings();
    return value;
  }

  async openIngredientOverrideModal(initialIngredient = "", options = {}) {
    const categoryConfig = await this.loadIngredientCategoryConfig();
    const categories = getSelectableIngredientCategories(categoryConfig);
    new IngredientEntryModal(this.app, {
      title: "Add ingredient override",
      ingredientLabel: "Ingredient (exact match)",
      unitLabel: "Unit override (optional)",
      includeUnit: true,
      categories,
      initialIngredient,
      initialCategory: String(options.initialCategory || categoryConfig.defaultCategory || "").trim(),
      submitText: "Save",
      onSubmit: async ({ ingredient, category, unit }) => {
        const savedIngredient = await this.saveIngredientOverrideEntry({ ingredient, category, unit });
        if (savedIngredient) {
          new Notice(`Override saved for ${savedIngredient}.`);
          await options.onSubmitComplete?.(savedIngredient);
        }
      },
    }).open();
  }

  async addIngredientOverrideFromCurrentShoppingLine() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) {
      new Notice("Open the shopping list note in a markdown editor first.");
      return;
    }
    const editor = view.editor;
    const ingredient = this.getIngredientOverrideSeedFromEditor(editor);
    if (!ingredient) {
      new Notice("Could not detect an ingredient name on the current line.");
      return;
    }
    await this.openIngredientOverrideModal(ingredient);
  }

  async exportSettingsToJson(pathOverride = "") {
    const path = normalizePath(pathOverride || this.settings.settingsImportExportPath || ".obsidian/plugins/weekly-meal-shopper/settings-export.json");
    const folder = path.split("/").slice(0, -1).join("/");
    if (folder) await this.ensureFolderPathExists(folder);
    const payload = {
      pluginId: this.manifest?.id || "weekly-meal-shopper",
      exportedAt: new Date().toISOString(),
      settings: this.settings,
    };
    await this.app.vault.adapter.write(path, `${JSON.stringify(payload, null, 2)}\n`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(true).openFile(file);
    return path;
  }

  async importSettingsFromJson(pathOverride = "") {
    const path = normalizePath(pathOverride || this.settings.settingsImportExportPath || ".obsidian/plugins/weekly-meal-shopper/settings-export.json");
    const exists = await this.app.vault.adapter.exists(path);
    if (!exists) throw new Error(`Settings JSON not found: ${path}`);
    const raw = await this.app.vault.adapter.read(path);
    const parsed = JSON.parse(raw);
    const incoming = parsed && typeof parsed === "object" && parsed.settings ? parsed.settings : parsed;
    if (!incoming || typeof incoming !== "object") throw new Error("Invalid settings JSON format.");
    this.settings = Object.assign({}, this.settings, incoming);
    await this.saveSettings();
    await this.loadUnitDensityConfig();
    await this.loadUnitAliasConfig();
    return path;
  }

  async promptPositiveNumber(message, defaultValue) {
    return await new Promise((resolve) => {
      const modal = new PositiveNumberPromptModal(
        this.app,
        message,
        defaultValue,
        (value) => resolve({ value }),
        () => resolve({ cancelled: true })
      );
      modal.open();
    });
  }

  async promptTextEntry(options = {}) {
    return await new Promise((resolve) => {
      const modal = new TextEntryModal(this.app, {
        ...options,
        onSubmit: (result) => {
          if (result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "value")) {
            resolve(result);
            return;
          }
          resolve({ value: result });
        },
        onCancel: () => resolve({ cancelled: true }),
      });
      modal.open();
    });
  }

  async promptTemplateSetup(options = {}) {
    return await new Promise((resolve) => {
      const modal = new TemplateSetupModal(this.app, {
        ...options,
        onSubmit: (value) => resolve(value),
        onCancel: () => resolve({ cancelled: true }),
      });
      modal.open();
    });
  }

  async showTranscribedIngredientReview(title, rawIngredients) {
    return new Promise((resolve) => {
      const modal = new TranscribedIngredientReviewModal(this.app, {
        title,
        rawIngredients,
        onSave: (lines) => resolve(lines),
        onDiscard: () => resolve(null),
      });
      modal.open();
    });
  }

  formatLocalIsoDate(inputDate = new Date()) {
    const date = new Date(inputDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async readPluginTemplate(templatePath) {
    const path = normalizePath(templatePath);
    const exists = await this.app.vault.adapter.exists(path);
    if (!exists) {
      const bundledDefault = getBundledTemplateDefault(templatePath);
      if (bundledDefault === null) {
        throw new Error(`Plugin template not found: ${path}`);
      }
      const parentFolder = path.split("/").slice(0, -1).join("/");
      if (parentFolder && !(await this.app.vault.adapter.exists(parentFolder))) {
        await this.app.vault.adapter.mkdir(parentFolder);
      }
      await this.app.vault.adapter.write(path, bundledDefault);
      return bundledDefault;
    }
    return await this.app.vault.adapter.read(path);
  }

  getEditableRecipeTemplatePath() {
    return normalizePath(this.settings.recipeTemplateVaultPath || DEFAULT_SETTINGS.recipeTemplateVaultPath);
  }

  getEditableMealPrepCanvasTemplatePath() {
    return normalizePath(this.settings.mealPrepCanvasTemplateVaultPath || DEFAULT_SETTINGS.mealPrepCanvasTemplateVaultPath);
  }

  getParentFolderPath(filePath) {
    return normalizePath(String(filePath || "").trim()).split("/").slice(0, -1).join("/");
  }

  async ensureParentFolderForFilePath(filePath) {
    const folder = this.getParentFolderPath(filePath);
    if (folder) await this.ensureFolderPathExists(folder);
  }

  async openVaultFileByPath(filePath, missingMessage = "Vault file not found.") {
    const path = normalizePath(filePath);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(missingMessage);
      return null;
    }
    await this.app.workspace.getLeaf(true).openFile(file);
    return file;
  }

  async readEditableVaultTemplate(templatePath, missingMessage) {
    const path = normalizePath(templatePath);
    const exists = await this.app.vault.adapter.exists(path);
    if (!exists) {
      throw new Error(missingMessage || `Editable template not found: ${path}`);
    }
    return await this.app.vault.adapter.read(path);
  }

  async populateVaultTemplateFromBundledBase({
    bundledTemplatePath,
    targetPath,
    label,
    openTargetFile = true,
    showNotice = true,
  }) {
    const normalizedTarget = normalizePath(String(targetPath || "").trim());
    if (!normalizedTarget) {
      throw new Error(`Set a target path for ${label.toLowerCase()} first.`);
    }

    await this.ensureParentFolderForFilePath(normalizedTarget);
    const existing = this.app.vault.getAbstractFileByPath(normalizedTarget);
    if (existing instanceof TFile) {
      if (openTargetFile) await this.app.workspace.getLeaf(true).openFile(existing);
      if (showNotice) new Notice(`${label} already exists: ${existing.path}`);
      return existing;
    }
    if (existing) {
      throw new Error(`Cannot create ${label.toLowerCase()} because ${normalizedTarget} is not a file path.`);
    }

    const templateContent = await this.readPluginTemplate(bundledTemplatePath);
    const created = await this.app.vault.create(
      normalizedTarget,
      templateContent.endsWith("\n") ? templateContent : `${templateContent}\n`
    );
    if (openTargetFile) await this.app.workspace.getLeaf(true).openFile(created);
    if (showNotice) new Notice(`${label} created: ${created.path}`);
    return created;
  }

  async populateEditableRecipeTemplateInVault({ openFile = true, showNotice = true } = {}) {
    return await this.populateVaultTemplateFromBundledBase({
      bundledTemplatePath: RECIPE_TEMPLATE_PATH,
      targetPath: this.getEditableRecipeTemplatePath(),
      label: "Editable recipe template",
      openTargetFile: openFile,
      showNotice,
    });
  }

  async populateEditableMealPrepCanvasTemplateInVault({ openFile = true, showNotice = true } = {}) {
    return await this.populateVaultTemplateFromBundledBase({
      bundledTemplatePath: MEAL_PREP_CANVAS_TEMPLATE_PATH,
      targetPath: this.getEditableMealPrepCanvasTemplatePath(),
      label: "Editable meal-prep canvas template",
      openTargetFile: openFile,
      showNotice,
    });
  }

  async runFirstTimeTemplateSetup() {
    const result = await this.promptTemplateSetup({
      title: "First-Time Setup",
      description: "Choose where the editable canvas and recipe templates should live in your vault. The plugin will create both files from its bundled base templates.",
      canvasPath: this.getEditableMealPrepCanvasTemplatePath(),
      recipePath: this.getEditableRecipeTemplatePath(),
      submitText: "Save + Populate",
    });
    if (result?.cancelled) return null;

    this.settings.mealPrepCanvasTemplateVaultPath = normalizePath(
      String(result.canvasPath || "").trim() || DEFAULT_SETTINGS.mealPrepCanvasTemplateVaultPath
    );
    this.settings.recipeTemplateVaultPath = normalizePath(
      String(result.recipePath || "").trim() || DEFAULT_SETTINGS.recipeTemplateVaultPath
    );
    await this.saveSettings();

    const canvasFile = await this.populateEditableMealPrepCanvasTemplateInVault({
      openFile: false,
      showNotice: false,
    });
    const recipeFile = await this.populateEditableRecipeTemplateInVault({
      openFile: false,
      showNotice: false,
    });

    new Notice("First-Time Setup complete. Your editable canvas and recipe templates are ready.");
    return { canvasFile, recipeFile };
  }

  getRecipeTemplateFolder() {
    return normalizePath(this.settings.recipeFolder || "pages/Food and Drink/Recipes");
  }

  buildUniqueVaultFilePath(folder, baseName, extension = "md") {
    const ext = String(extension || "md").replace(/^\./, "") || "md";
    let outputPath = normalizePath(`${folder}/${baseName}.${ext}`);
    let counter = 2;
    while (this.app.vault.getAbstractFileByPath(outputPath)) {
      outputPath = normalizePath(`${folder}/${baseName} ${counter}.${ext}`);
      counter += 1;
    }
    return outputPath;
  }

  async createRecipeFromTemplate() {
    const result = await this.promptTextEntry({
      title: "Create recipe from template",
      label: "Recipe file name",
      submitText: "Create",
      emptyError: "Please enter a recipe name.",
    });
    if (result?.cancelled) return null;

    const folder = this.getRecipeTemplateFolder();
    await this.ensureFolderPathExists(folder);

    const baseName = this.sanitizeRecipeFilename(result.value);
    const outputPath = this.buildUniqueVaultFilePath(folder, baseName, "md");
    let templateContent = "";
    try {
      templateContent = await this.readEditableVaultTemplate(
        this.getEditableRecipeTemplatePath(),
        "Editable recipe template not found. Run template setup in First-Time Setup first."
      );
    } catch (error) {
      new Notice(error?.message || String(error));
      return null;
    }
    const created = await this.app.vault.create(
      outputPath,
      templateContent.endsWith("\n") ? templateContent : `${templateContent}\n`
    );
    await this.app.workspace.getLeaf(true).openFile(created);
    new Notice(`Recipe template created: ${created.path}`);
    return created;
  }

  normalizeApiKey(rawValue) {
    let value = String(rawValue || "").trim();
    if (!value) return "";
    value = value.replace(/^['"]|['"]$/g, "").trim();
    value = value.replace(/^Bearer\s+/i, "").trim();
    return value;
  }

  async resolveTranscriptionApiKey() {
    const candidates = [];

    if (this.settings?.useStoredTranscriptionApiKey) {
      candidates.push(
        this.settings?.transcriptionApiKey,
        this.settings?.openaiApiKey,
        this.settings?.openAIApiKey,
        this.settings?.apiKey
      );

      if (typeof this.loadData === "function") {
        try {
          const persisted = await this.loadData();
          if (persisted && typeof persisted === "object") {
            candidates.push(
              persisted.transcriptionApiKey,
              persisted.openaiApiKey,
              persisted.openAIApiKey,
              persisted.apiKey
            );
          }
        } catch {
          // Fall through to the remaining candidates.
        }
      }
    }

    if (typeof process !== "undefined" && process?.env?.OPENAI_API_KEY) {
      candidates.push(process.env.OPENAI_API_KEY);
    }

    for (const candidate of candidates) {
      const normalized = this.normalizeApiKey(candidate);
      if (normalized) return normalized;
    }
    return "";
  }

  extractFirstJsonObject(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    const candidates = [
      raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
    ];

    const objectStart = raw.indexOf("{");
    const objectEnd = raw.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd !== -1 && objectEnd >= objectStart) {
      candidates.push(raw.slice(objectStart, objectEnd + 1).trim());
    }

    const arrayStart = raw.indexOf("[");
    const arrayEnd = raw.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd >= arrayStart) {
      candidates.push(raw.slice(arrayStart, arrayEnd + 1).trim());
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        // keep scanning
      }
    }
    return "";
  }

  sanitizeRecipeFilename(name) {
    const clean = String(name || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return clean || `Transcribed Recipe ${new Date().toISOString().slice(0, 10)}`;
  }

  stripHtmlForPrompt(html) {
    const text = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 18000);
  }

  buildUrlTranscriptionContext({
    url = "",
    rawHtml = "",
    transcriptText = "",
    sourceTitle = "",
    descriptionText = "",
  } = {}) {
    const youtube = isYouTubeUrl(url);
    const normalizedTranscript = String(transcriptText || "").trim();
    return assembleUrlTranscriptionContext({
      url,
      pageText: this.stripHtmlForPrompt(rawHtml),
      transcriptText: normalizedTranscript,
      sourceType: youtube ? "YouTube video" : "Web page",
      sourceTitle: sourceTitle || extractSourceTitleFromHtml(rawHtml),
      descriptionText: descriptionText || (youtube ? extractYouTubeShortDescriptionFromHtml(rawHtml) : ""),
      includePageText: !(youtube && normalizedTranscript),
    });
  }

  async fetchYouTubeTranscriptFromHtml(html, fetchImpl = requestUrl) {
    const tracks = extractYouTubeCaptionTracksFromHtml(html);
    const selectedTrack = selectPreferredYouTubeCaptionTrack(tracks);
    const transcriptUrl = buildYouTubeTranscriptRequestUrl(selectedTrack);
    if (!transcriptUrl) return "";

    try {
      const response = await fetchImpl({ url: transcriptUrl, method: "GET" });
      return parseYouTubeTranscriptText(response?.text || "");
    } catch (error) {
      console.warn("[weekly-meal-shopper] Could not fetch YouTube transcript:", error);
      return "";
    }
  }

  getImageMimeType(ext) {
    const e = String(ext || "").toLowerCase();
    const typeByExt = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      jfif: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      bmp: "image/bmp",
      heic: "image/heic",
      heif: "image/heif",
      tif: "image/tiff",
      tiff: "image/tiff",
      avif: "image/avif",
    };
    return typeByExt[e] || "image/jpeg";
  }

  async deleteSourceImageFile(file) {
    if (!file) return;
    if (typeof this.app.vault.trash === "function") {
      await this.app.vault.trash(file, false);
      return;
    }
    await this.app.vault.adapter.remove(file.path);
  }

  parseRetryAfterMs(response, fallbackMs) {
    const headerValue = response?.headers?.["retry-after"] || response?.headers?.["Retry-After"] || "";
    const asNumber = Number(headerValue);
    if (Number.isFinite(asNumber) && asNumber > 0) return Math.round(asNumber * 1000);
    const asDateMs = Date.parse(String(headerValue || ""));
    if (Number.isFinite(asDateMs) && asDateMs > Date.now()) {
      return Math.max(500, asDateMs - Date.now());
    }
    return fallbackMs;
  }

  async requestOpenAIResponsesWithRetry({ apiKey, model, input }) {
    const maxAttempts = 4;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await requestUrl({
          url: "https://api.openai.com/v1/responses",
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, input }),
        });
      } catch (error) {
        const status = Number(error?.status || error?.statusCode || 0);
        const retryable = status === 429 || (status >= 500 && status <= 599);
        lastError = error;
        if (!retryable || attempt === maxAttempts) break;
        const waitMs = this.parseRetryAfterMs(error, 600 * (2 ** (attempt - 1)));
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    const status = Number(lastError?.status || lastError?.statusCode || 0);
    if (status === 429) {
      throw new Error("OpenAI rate limit reached (HTTP 429). Please retry in a moment.");
    }
    if (status === 401 || status === 403) {
      throw new Error(`OpenAI authentication failed (HTTP ${status}). Check your API key and permissions.`);
    }
    if (status >= 400 && status <= 499) {
      throw new Error(`OpenAI request was rejected (HTTP ${status}). Check model and payload settings.`);
    }
    if (status >= 500 && status <= 599) {
      throw new Error(`OpenAI server error (HTTP ${status}). Please retry in a moment.`);
    }
    throw new Error(`OpenAI transcription request failed: ${lastError?.message || "Unknown network error"}`);
  }

  normalizeTranscribedRecipeData(raw, fallbackTitle) {
    const title = firstStringValue(raw?.title) || normalizeSingleLineText(fallbackTitle) || "Transcribed Recipe";
    const ingredients = normalizeStringArray(Array.isArray(raw?.ingredients) ? raw.ingredients : []);
    const directions = normalizeStringArray(Array.isArray(raw?.directions) ? raw.directions : []);
    const notes = normalizeStringArray(Array.isArray(raw?.notes) ? raw.notes : []);
    return {
      title,
      ingredients,
      directions,
      notes,
      prepTime: normalizeDurationText(raw?.prepTime || raw?.prep_time || raw?.prep),
      cookTime: normalizeDurationText(raw?.cookTime || raw?.cook_time || raw?.cook),
      portions: firstStringValue(raw?.portions || raw?.servings || raw?.recipeYield || raw?.yield),
      link: firstStringValue(raw?.link || raw?.url),
      cover: extractImageUrl(raw?.cover || raw?.image || raw?.thumbnail),
    };
  }

  normalizeTranscribedRecipeCollection(raw, fallbackTitle) {
    const candidates = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.recipes)
        ? raw.recipes
        : raw && typeof raw === "object"
          ? [raw]
          : [];

    return candidates
      .map((candidate, index) => this.normalizeTranscribedRecipeData(
        candidate,
        candidates.length > 1 ? `${fallbackTitle} ${index + 1}` : fallbackTitle
      ))
      .filter((recipe) => (
        recipe.title
        || recipe.ingredients.length > 0
        || recipe.directions.length > 0
        || recipe.notes.length > 0
        || recipe.link
        || recipe.cover
      ));
  }

  normalizeTranscribedIngredientLines(ingredientLines, { metricMode = true } = {}) {
    const cleaned = normalizeStringArray(ingredientLines)
      .map((line) => normalizeLegacyIngredientText(String(line).replace(/^[-*+]\s+/, "").trim()))
      .map((line) => normalizeNutIngredientTerms(line))
      .filter((line) => line && !looksLikeIngredientSubheadingLine(line));
    const lines = [];
    for (const line of cleaned) {
      const parsed = parseIngredientLine(`- ${line}`, ACTIVE_UNIT_MAP, { allowLegacy: true });
      const normalizedParsed = parsed
        ? {
          ...parsed,
          name: normalizeNutIngredientTerms(parsed.name),
        }
        : (() => {
          const split = splitIngredientNameAndPreparation(normalizeNutIngredientTerms(line));
          const ingredientName = split.ingredientName || normalizeNutIngredientTerms(line);
          return {
            name: ingredientName,
            preparation: split.preparation,
            amount: 1,
            unit: "",
            unitExplicit: false,
            quantityUnknown: true,
            amountMetric: 0,
            unitMetric: "unit",
            canonicalName: canonicalIngredientName(ingredientName),
          };
        })();
      const formatted = formatStructuredIngredientLineFromParsed(normalizedParsed, {
        metricMode,
        outputLabels: ACTIVE_MEASUREMENT_PROFILE.labels,
        measurementPreference: metricMode ? "weight" : this.settings.measurementPreference,
        separator: this.settings.ingredientStorageSeparator,
      });
      lines.push(String(formatted).replace(/^[-*+]\s+/, "").trim());
    }
    return normalizeStringArray(lines);
  }

  normalizeTranscribedDirectionLines(directionLines, ingredientLines) {
    const cleaned = normalizeStringArray(directionLines).map((line) => String(line).replace(/^\d+\.\s*/, "").trim());
    const preferredNutPhrase = detectPreferredNutPhraseFromIngredientLines(ingredientLines);
    const aligned = cleaned.map((line) => alignDirectionIngredientReferences(line, { preferredNutPhrase }));
    const converted = aligned.map((line) => convertDirectionTemperaturesToMetric(line));
    const ingredientBullets = normalizeStringArray(ingredientLines).map(
      (line) => `- ${String(line).replace(/^[-*+]\s+/, "").trim()}`
    );
    const bolded = normalizeDirectionsSectionLines(converted, ingredientBullets);
    return normalizeStringArray(
      bolded.map((line) => normalizeSingleLineText(String(line).replace(/^\d+\.\s*/, "")))
    );
  }

  async requestOpenAIJsonResponse({ content, missingJsonMessage = "Model response did not include valid JSON output." }) {
    const apiKey = await this.resolveTranscriptionApiKey();
    if (!apiKey) {
      throw new Error("Set an OpenAI API key in plugin settings (or OPENAI_API_KEY env var).");
    }

    const model = String(this.settings.transcriptionModel || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const response = await this.requestOpenAIResponsesWithRetry({
      apiKey,
      model,
      input: [{ role: "user", content }],
    });

    const data = response.json || {};
    const outputText = String(
      data.output_text
      || data?.output?.[0]?.content?.[0]?.text
      || data?.output?.[0]?.content?.[0]?.value
      || ""
    );
    const jsonText = this.extractFirstJsonObject(outputText);
    if (!jsonText) {
      throw new Error(missingJsonMessage);
    }

    try {
      return JSON.parse(jsonText);
    } catch {
      throw new Error("Could not parse JSON from model response.");
    }
  }

  normalizeDiscoveredRecipeTargets(raw) {
    const candidates = Array.isArray(raw?.recipes)
      ? raw.recipes
      : Array.isArray(raw)
        ? raw
        : [];
    const seen = new Set();
    const targets = [];
    for (const candidate of candidates) {
      const title = normalizeSingleLineText(
        typeof candidate === "string"
          ? candidate
          : candidate?.title
      );
      const evidence = normalizeSingleLineText(
        typeof candidate === "object" && candidate
          ? candidate.evidence
          : ""
      );
      const key = normalizeSearchText(title);
      if (!title || !key || seen.has(key)) continue;
      seen.add(key);
      targets.push({ title, evidence });
    }
    return targets;
  }

  async discoverRecipeTargetsWithOpenAI({ sourceLabel, textContext = "", expectedRecipeCount = 0 }) {
    const instruction = [
      "Identify every distinct recipe explicitly taught in the source.",
      "Return only JSON with this shape:",
      "{\"recipes\":[{\"title\":\"...\",\"evidence\":\"...\"}]}",
      "A recipe counts only if the source explicitly teaches how to make it with its own ingredients, steps, or a clearly separate preparation sequence.",
      "Component recipes like almond milk, sauces, broths, spice mixes, and curry pastes count only when the source actually explains how to make them.",
      "Do not invent recipes.",
      "Do not include serving suggestions, substitutions, toppings, asides, or passing mentions as recipes.",
      "evidence must be a short exact phrase or sentence fragment from the source proving the recipe exists.",
      expectedRecipeCount > 1
        ? `The source metadata suggests ${expectedRecipeCount} recipe variations. If the transcript clearly presents them as separate ways, return ${expectedRecipeCount} items.`
        : "If there is only one explicit recipe, return one item.",
    ].join(" ");
    const content = [
      { type: "input_text", text: instruction },
      { type: "input_text", text: `Source: ${sourceLabel}` },
    ];
    if (textContext) content.push({ type: "input_text", text: `Content:\n${textContext}` });
    const parsed = await this.requestOpenAIJsonResponse({
      content,
      missingJsonMessage: "Model response did not include valid JSON recipe discovery output.",
    });
    return this.normalizeDiscoveredRecipeTargets(parsed);
  }

  async transcribeNamedRecipeWithOpenAI({ sourceLabel, textContext = "", recipeTitle = "", recipeEvidence = "" }) {
    const recipeShape = "{\"title\":\"...\",\"ingredients\":[\"...\"],\"directions\":[\"...\"],\"notes\":[\"...\"],\"prepTime\":\"...\",\"cookTime\":\"...\",\"portions\":\"...\",\"cover\":\"...\",\"link\":\"...\"}";
    const instruction = [
      "Transcribe exactly one recipe into structured JSON.",
      "Return only JSON with this shape:",
      recipeShape,
      "Transcribe only the named target recipe.",
      "Ignore other recipes in the source.",
      "Keep ingredient and direction text concise and clean.",
      "Ingredient strings should stay close to 'amount unit ingredient, preparation' when a preparation detail is clear.",
      "Keep explicit countable units like can, clove, clove(s), piece, and egg when they are present.",
      "For fresh herbs (parsley, coriander, basil, cilantro, mint, dill, chives, sage, rosemary, thyme, oregano), use 'bunch' or 'cup' as the unit — never grams or millilitres.",
      "For liquid condiments (soy sauce, fish sauce, vinegar, sriracha, tamari, Worcestershire), use tablespoon or teaspoon (tbsp / tsp) — not grams or ml.",
      "Directions should explicitly reference ingredient names so each listed ingredient can be matched in steps.",
      "Prefer specific ingredient terms over generic ones (example: use 'pecan nuts' rather than only 'nuts').",
      "Use only information explicitly present in the source content.",
      "Do not invent recipes, ingredients, quantities, timings, or steps from context clues or general cooking knowledge.",
      "Do not turn passing mentions, serving ideas, substitutions, or unrelated chatter into standalone recipes.",
      "Preserve any component recipes or preparatory sub-recipes taught in the source (example: homemade almond milk, sauces, broths, curry pastes, spice mixes).",
      "Only create a separate component recipe when the source explicitly explains how to make that component.",
      "If a component is mentioned but not actually taught, keep it inside the parent recipe as an ingredient or note instead of creating a new recipe.",
      "Do not replace a described homemade component with a store-bought shortcut unless the source itself does.",
      "If details are missing, leave them blank or keep the wording partial; do not fill gaps by guessing.",
      "For YouTube transcripts, ignore introductions, sponsorships, jokes, and unrelated conversation.",
    ].join(" ");
    const content = [
      { type: "input_text", text: instruction },
      { type: "input_text", text: `Source: ${sourceLabel}` },
      { type: "input_text", text: `Target recipe: ${recipeTitle}` },
    ];
    if (recipeEvidence) content.push({ type: "input_text", text: `Evidence: ${recipeEvidence}` });
    if (textContext) content.push({ type: "input_text", text: `Content:\n${textContext}` });
    const parsed = await this.requestOpenAIJsonResponse({
      content,
      missingJsonMessage: "Model response did not include valid JSON recipe output.",
    });
    return this.normalizeTranscribedRecipeData(parsed, recipeTitle || sourceLabel);
  }

  async transcribeWithOpenAI({ sourceLabel, textContext = "", imageDataUrl = "", allowMultipleRecipes = false }) {
    if (allowMultipleRecipes && isYouTubeUrl(sourceLabel) && textContext) {
      const sourceTitle = extractContextSingleLineValue(textContext, "Source title");
      const descriptionText = extractContextSection(textContext, "Description");
      const transcriptText = extractContextSection(textContext, "Transcript");
      const explicitTargets = extractRecipeTargetsFromDescription(descriptionText);
      if (explicitTargets.length > 1) {
        const recipes = [];
        for (const target of explicitTargets.slice(0, 12)) {
          const recipe = await this.transcribeNamedRecipeWithOpenAI({
            sourceLabel,
            textContext,
            recipeTitle: target.title,
            recipeEvidence: target.evidence,
          });
          recipes.push(recipe);
        }
        if (recipes.length > 0) return recipes;
      }
      const expectedRecipeCount = extractRecipeCountHint(sourceTitle);
      const targets = await this.discoverRecipeTargetsWithOpenAI({
        sourceLabel,
        textContext,
        expectedRecipeCount,
      });
      if (targets.length > 1) {
        const recipes = [];
        for (const target of targets.slice(0, 12)) {
          const recipe = await this.transcribeNamedRecipeWithOpenAI({
            sourceLabel,
            textContext,
            recipeTitle: target.title,
            recipeEvidence: target.evidence,
          });
          if (
            recipe.title
            || recipe.ingredients.length > 0
            || recipe.directions.length > 0
            || recipe.notes.length > 0
          ) {
            recipes.push(recipe);
          }
        }
        if (recipes.length > 0) return recipes;
      }
      const transcriptSegments = segmentTranscriptByWayMarkers(
        transcriptText,
        expectedRecipeCount,
        sourceTitle
      );
      if (transcriptSegments.length > 1) {
        const recipes = [];
        for (const segment of transcriptSegments) {
          const segmentContext = assembleUrlTranscriptionContext({
            url: sourceLabel,
            sourceType: "YouTube video",
            sourceTitle,
            descriptionText,
            transcriptText: segment.transcriptText,
            includePageText: false,
          });
          const recipe = await this.transcribeNamedRecipeWithOpenAI({
            sourceLabel,
            textContext: segmentContext,
            recipeTitle: segment.title,
            recipeEvidence: segment.evidence,
          });
          recipes.push(recipe);
        }
        if (recipes.length > 0) return recipes;
      }
    }

    const recipeShape = "{\"title\":\"...\",\"ingredients\":[\"...\"],\"directions\":[\"...\"],\"notes\":[\"...\"],\"prepTime\":\"...\",\"cookTime\":\"...\",\"portions\":\"...\",\"cover\":\"...\",\"link\":\"...\"}";
    const instruction = [
      allowMultipleRecipes
        ? "Transcribe one or more recipes into structured JSON."
        : "Transcribe a recipe into structured JSON.",
      "Return only JSON with this shape:",
      allowMultipleRecipes
        ? `{"recipes":[${recipeShape}]}`
        : recipeShape,
      "Keep ingredient and direction text concise and clean.",
      "Ingredient strings should stay close to 'amount unit ingredient, preparation' when a preparation detail is clear.",
      "Keep explicit countable units like can, clove, clove(s), piece, and egg when they are present.",
      // Unit preference rules
      "For fresh herbs (parsley, coriander, basil, cilantro, mint, dill, chives, sage, rosemary, thyme, oregano), use 'bunch' or 'cup' as the unit — never grams or millilitres.",
      "For flour, sugar, butter, and dry baking ingredients: if the source gives cups, keep cups; if the source gives weight, keep weight.",
      "For canned goods, use 'can' as the unit with the can size in the preparation field (example: '1 can whole tomatoes, 400g').",
      "For liquid condiments and sauces (soy sauce, fish sauce, vinegar, sriracha, miso, tamari, Worcestershire), use tablespoon or teaspoon (tbsp / tsp) — not grams or ml.",
      "Do not express dried spices, ground spices, or small seasoning amounts in ml.",
      "Directions should explicitly reference ingredient names so each listed ingredient can be matched in steps.",
      "Prefer specific ingredient terms over generic ones (example: use 'pecan nuts' rather than only 'nuts').",
      "Use only information explicitly present in the source content.",
      "Do not invent recipes, ingredients, quantities, timings, or steps from context clues or general cooking knowledge.",
      "Do not turn passing mentions, serving ideas, substitutions, or unrelated chatter into standalone recipes.",
      "Preserve any component recipes or preparatory sub-recipes taught in the source (example: homemade almond milk, sauces, broths, curry pastes, spice mixes).",
      "Only create a separate component recipe when the source explicitly explains how to make that component.",
      "If a component is mentioned but not actually taught, keep it inside the parent recipe as an ingredient or note instead of creating a new recipe.",
      "Do not replace a described homemade component with a store-bought shortcut unless the source itself does.",
      "If details are missing, leave them blank or keep the wording partial; do not fill gaps by guessing.",
      "For YouTube transcripts, ignore introductions, sponsorships, jokes, and unrelated conversation.",
      allowMultipleRecipes
        ? "If the source contains multiple distinct recipes, include each one in the recipes array. If only one recipe is present, return a single-item recipes array."
        : "",
    ].join(" ");

    const content = [
      { type: "input_text", text: instruction },
      { type: "input_text", text: `Source: ${sourceLabel}` },
    ];
    if (textContext) content.push({ type: "input_text", text: `Content:\n${textContext}` });
    if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl });

    const parsed = await this.requestOpenAIJsonResponse({
      content,
      missingJsonMessage: "Model response did not include valid JSON recipe output.",
    });
    const recipes = this.normalizeTranscribedRecipeCollection(parsed, sourceLabel);
    if (recipes.length === 0) {
      throw new Error("Model response did not include any usable recipe output.");
    }
    return allowMultipleRecipes ? recipes : recipes[0];
  }

  async alignRecipeSectionsWithOpenAI({ title = "", ingredients = [], directions = [], notes = [] } = {}) {
    const apiKey = await this.resolveTranscriptionApiKey();
    if (!apiKey) {
      throw new Error("Set an OpenAI API key in plugin settings (or OPENAI_API_KEY env var).");
    }

    const model = String(this.settings.transcriptionModel || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const instruction = [
      "Normalize an existing recipe's ingredients and directions into cleaner structured text.",
      "Return only JSON with this shape:",
      "{\"ingredients\":[\"...\"],\"directions\":[\"...\"]}",
      "Preserve the recipe's meaning, ingredient list, and overall quantities.",
      "Do not invent ingredients, steps, or measurements.",
      "Rewrite ingredient lines so the ingredient name is explicit and preparation is expressed clearly.",
      "Use explicit count units like can, clove, piece, egg, or orange when appropriate.",
      "For fresh herbs (parsley, coriander, basil, cilantro, mint, dill, chives, sage, rosemary, thyme, oregano), use 'bunch' or 'cup' as the unit — never grams or millilitres.",
      "For liquid condiments (soy sauce, fish sauce, vinegar, sriracha, tamari, Worcestershire), use tablespoon or teaspoon (tbsp / tsp) — not grams or ml.",
      "If a source ingredient combines multiple actions, rewrite it into parser-friendly text. Example: 'zest and juice of 1 orange' becomes '1 orange, zested and juiced'.",
      "Rewrite directions so they explicitly mention the ingredient names used in the ingredient list, which helps the recipe-view step highlighting match them reliably.",
      "Keep directions concise and preserve the original step order.",
    ].join(" ");

    const payload = [
      { type: "input_text", text: instruction },
      { type: "input_text", text: `Recipe title: ${normalizeSingleLineText(title) || "Untitled Recipe"}` },
      { type: "input_text", text: `Ingredients:\n${normalizeOrderedStringArray(ingredients).map(stripListMarkerText).join("\n")}` },
      { type: "input_text", text: `Directions:\n${normalizeOrderedStringArray(directions).map(stripListMarkerText).join("\n")}` },
    ];
    if (Array.isArray(notes) && notes.length > 0) {
      payload.push({
        type: "input_text",
        text: `Notes:\n${normalizeOrderedStringArray(notes).join("\n")}`,
      });
    }

    const response = await this.requestOpenAIResponsesWithRetry({
      apiKey,
      model,
      input: [{ role: "user", content: payload }],
    });

    const data = response.json || {};
    const outputText = String(
      data.output_text
      || data?.output?.[0]?.content?.[0]?.text
      || data?.output?.[0]?.content?.[0]?.value
      || ""
    );
    const jsonText = this.extractFirstJsonObject(outputText);
    if (!jsonText) {
      throw new Error("Model response did not include valid JSON recipe output.");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Could not parse JSON from model response.");
    }

    const ingredientLines = normalizeOrderedStringArray(Array.isArray(parsed?.ingredients) ? parsed.ingredients : [])
      .map(stripListMarkerText)
      .filter(Boolean);
    const directionLines = normalizeOrderedStringArray(Array.isArray(parsed?.directions) ? parsed.directions : [])
      .map(stripListMarkerText)
      .filter(Boolean);
    if (ingredientLines.length === 0 || directionLines.length === 0) {
      throw new Error("Model response did not return both ingredients and directions.");
    }

    return {
      ingredients: ingredientLines,
      directions: directionLines,
    };
  }

  buildTranscribedRecipeNoteContent(recipe) {
    const ingredientsLines = recipe.ingredients.length > 0
      ? recipe.ingredients.map((line) => `- ${String(line).replace(/^[-*+]\s+/, "").trim()}`)
      : [`- ${ACTIVE_INGREDIENT_STORAGE_SEPARATOR} ${ACTIVE_INGREDIENT_STORAGE_SEPARATOR} ${ACTIVE_INGREDIENT_STORAGE_SEPARATOR}`];
    const directionLines = recipe.directions.length > 0
      ? recipe.directions.map((line, idx) => `${idx + 1}. ${String(line).replace(/^\d+\.\s*/, "")}`)
      : ["1. "];
    const notesLines = recipe.notes.length > 0 ? recipe.notes.map((line) => `- ${line}`) : [""];

    return [
      "---",
      "tags:",
      "  - 🧠/🍽️/📄",
      `CookTime: ${yamlQuoted(recipe.cookTime || "")}`,
      `PrepTime: ${yamlQuoted(recipe.prepTime || "")}`,
      `Portions: ${yamlQuoted(recipe.portions || "")}`,
      "IngredientRecipes: []",
      "IngredientsParsed: []",
      "Cost:",
      "RecipeRating: 3",
      "MealPrep: false",
      "WeekDay: false",
      "FrozenPortionsAvailable: 0",
      "UseFrozenFirst: true",
      "TrackMacros: false",
      "type: Recipe",
      "FoodType: Meal Item",
      "Collection: []",
      `Cover: ${yamlQuoted(recipe.cover || "")}`,
      `Link: ${yamlQuoted(recipe.link || "")}`,
      "Day:",
      "Time:",
      "---",
      "### Ingredients",
      ...ingredientsLines,
      "---",
      "### Directions",
      ...directionLines,
      "---",
      "### Notes",
      ...notesLines,
      "---",
      "### Nutrition",
      "",
      "---",
      "### Log",
      "```dataview",
      "TASK",
      "WHERE icontains(text, this.file.name)",
      "GROUP BY file.name",
      "SORT file.link DESC",
      "```",
      "---",
      "### Tags",
      "",
    ].join("\n");
  }

  async saveTranscribedRecipeNote(recipe, { openFile = true, useOpenAIStandardization = false, showReview = false } = {}) {
    const normalized = this.normalizeTranscribedRecipeData(recipe, recipe?.title || "Transcribed Recipe");
    const metricMode = this.settings.transcriptionMetricOutput !== false;

    let rawIngredients = normalized.ingredients;
    if (showReview) {
      const reviewed = await this.showTranscribedIngredientReview(normalized.title, rawIngredients);
      if (reviewed === null) return null;
      rawIngredients = reviewed;
    }

    const ingredientLines = this.normalizeTranscribedIngredientLines(rawIngredients, { metricMode });
    const directionLines = this.normalizeTranscribedDirectionLines(normalized.directions, ingredientLines);
    const noteRecipe = {
      ...normalized,
      ingredients: ingredientLines,
      directions: directionLines,
      notes: normalizeStringArray(normalized.notes),
    };

    const folder = normalizePath(this.settings.recipeFolder || "pages/Food and Drink/Recipes");
    await this.ensureFolderPathExists(folder);
    const baseName = this.sanitizeRecipeFilename(noteRecipe.title);
    const outputPath = this.buildUniqueVaultFilePath(folder, baseName, "md");

    const content = this.buildTranscribedRecipeNoteContent(noteRecipe);
    const created = await this.app.vault.create(outputPath, content);
    await this.standardizeRecipeFile(created, { useOpenAI: useOpenAIStandardization });
    const parsed = await this.parseIngredientsFromRecipeFile(created);
    await this.saveParsedIngredientsToFrontmatter(created, parsed);
    if (openFile) await this.app.workspace.getLeaf(true).openFile(created);
    return created;
  }

  async createFallbackTranscriptionTemplate({ sourceUrl, extractedText = "" }) {
    const stub = {
      title: sourceUrl,
      ingredients: [],
      directions: [],
      notes: [
        "Transcription failed. This template was created as a safe fallback.",
        sourceUrl ? `Source: ${sourceUrl}` : "",
        extractedText ? `Extracted context (truncated): ${String(extractedText).slice(0, 600)}` : "",
      ].filter(Boolean),
      prepTime: "",
      cookTime: "",
      portions: "",
      link: sourceUrl,
      cover: "",
    };
    return this.saveTranscribedRecipeNote(stub);
  }

  async transcribeRecipeFromUrlEntry() {
    const result = await this.promptTextEntry({
      title: "Transcribe Recipe from Link",
      label: "Website or YouTube URL",
      checkboxLabel: "Input contains multiple recipes",
      submitText: "Transcribe",
    });
    if (result.cancelled) return;

    const url = String(result.value || "").trim();
    const allowMultipleRecipes = result.checkboxValue === true;
    if (!/^https?:\/\//i.test(url)) {
      new Notice("Please enter a valid http(s) URL.");
      return;
    }

    let textContext = `URL: ${url}`;
    let fetchedRawText = "";
    let seed = extractRecipeSeedFromHtml("", url);
    try {
      const fetched = await requestUrl({ url, method: "GET" });
      const raw = fetched?.text || "";
      if (raw) {
        fetchedRawText = raw;
        seed = extractRecipeSeedFromHtml(raw, url);
        const transcriptText = isYouTubeUrl(url)
          ? await this.fetchYouTubeTranscriptFromHtml(raw)
          : "";
        textContext = this.buildUrlTranscriptionContext({
          url,
          rawHtml: raw,
          transcriptText,
        });
      }
    } catch (error) {
      // If fetch fails, still send URL context to the model.
      console.warn("[weekly-meal-shopper] Could not fetch URL content for transcription:", error);
    }

    try {
      const transcribed = await this.transcribeWithOpenAI({
        sourceLabel: url,
        textContext,
        allowMultipleRecipes,
      });
      const recipes = Array.isArray(transcribed) ? transcribed : [transcribed];
      const seedFallback = recipes.length > 1
        ? {
          link: firstStringValue(seed?.link || url),
          cover: firstStringValue(seed?.cover),
        }
        : seed;
      const files = [];
      for (let index = 0; index < recipes.length; index += 1) {
        const merged = mergeTranscribedRecipeData(recipes[index], seedFallback, url);
        const file = await this.saveTranscribedRecipeNote(merged, {
          openFile: index === recipes.length - 1,
          showReview: true,
        });
        if (file === null) continue;
        files.push(file);
      }
      if (files.length === 0) return;
      if (files.length === 1) {
        new Notice(`Recipe transcribed from URL and saved to ${files[0].path}.`);
      } else {
        new Notice(`${files.length} recipes transcribed from URL and saved to the recipe folder.`);
      }
    } catch (error) {
      console.error("[weekly-meal-shopper] URL transcription failed:", error);
      try {
        const fallback = await this.createFallbackTranscriptionTemplate({
          sourceUrl: url,
          extractedText: fetchedRawText,
        });
        new Notice(
          `Transcription failed (${error?.message || String(error)}). Fallback template created: ${fallback.path}`
        );
      } catch (fallbackError) {
        console.error("[weekly-meal-shopper] Failed to create fallback transcription template:", fallbackError);
        new Notice(`URL transcription failed: ${error?.message || String(error)}`);
      }
    }
  }

  async transcribeRecipesFromImageFolder() {
    const folderPath = normalizePath(this.settings.transcriptionImageFolder || "");
    if (!folderPath) {
      new Notice("Set an image folder path in plugin settings first.");
      return;
    }

    const imageExt = new Set(["png", "jpg", "jpeg", "jfif", "webp", "gif", "bmp", "heic", "heif", "tif", "tiff", "avif"]);
    const files = this.app.vault.getFiles()
      .filter((file) => file.path.startsWith(`${folderPath}/`) || file.path === folderPath)
      .filter((file) => imageExt.has(String(file.extension || "").toLowerCase()));

    if (files.length === 0) {
      new Notice(`No image files found in ${folderPath}.`);
      return;
    }

    let processedImages = 0;
    let createdRecipes = 0;
    let failures = 0;
    const failed = [];
    let deleted = 0;
    let deleteFailures = 0;
    const failedDeletes = [];
    for (const file of files) {
      try {
        const binary = await this.app.vault.adapter.readBinary(file.path);
        const base64 = Buffer.from(binary).toString("base64");
        const mime = this.getImageMimeType(file.extension);
        const transcribed = await this.transcribeWithOpenAI({
          sourceLabel: file.basename,
          imageDataUrl: `data:${mime};base64,${base64}`,
          allowMultipleRecipes: true,
        });
        const recipes = Array.isArray(transcribed) ? transcribed : [transcribed];
        if (recipes.length === 0) {
          throw new Error("Model response did not include any usable recipe output.");
        }
        for (const recipe of recipes) {
          await this.saveTranscribedRecipeNote(recipe, {
            openFile: false,
            useOpenAIStandardization: true,
            showReview: true,
          });
        }
        processedImages += 1;
        createdRecipes += recipes.length;
        if (this.settings.deleteTranscribedImages) {
          try {
            await this.deleteSourceImageFile(file);
            deleted += 1;
          } catch (deleteError) {
            deleteFailures += 1;
            failedDeletes.push(`${file.basename}: ${deleteError?.message || String(deleteError)}`);
            console.error(`[weekly-meal-shopper] Could not delete transcribed image ${file.path}:`, deleteError);
          }
        }
      } catch (error) {
        failures += 1;
        failed.push(`${file.basename}: ${error?.message || String(error)}`);
        console.error(`[weekly-meal-shopper] Image transcription failed for ${file.path}:`, error);
      }
    }

    if (failures > 0 || deleteFailures > 0) {
      const deletedText = this.settings.deleteTranscribedImages
        ? ` ${deleted}/${processedImages} source images deleted.`
        : "";
      const deleteErrorText = deleteFailures > 0
        ? ` ${deleteFailures} delete failed. First delete error: ${failedDeletes[0]}`
        : "";
      new Notice(
        `Image transcription complete: ${processedImages}/${files.length} images processed, ${createdRecipes} recipes created, ${failures} failed.${deletedText}${deleteErrorText}${failures > 0 ? ` First transcription error: ${failed[0]}` : ""}`
      );
    } else {
      const deletedText = this.settings.deleteTranscribedImages
        ? ` ${deleted} source images deleted.`
        : "";
      new Notice(`Image transcription complete: ${processedImages}/${files.length} images processed, ${createdRecipes} recipes created.${deletedText}`);
    }
  }

  isRecipeFile(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    const classValue = String(fm.Class || fm.class || "").toLowerCase();
    const typeValue = String(fm.type || "").toLowerCase();
    return classValue === "recipe" || typeValue === "recipe";
  }

  closeRecipeViewOverlay({ restoreLivePreview = true } = {}) {
    const overlay = this.recipeViewOverlay;
    if (!overlay) return;
    const rightPane = overlay.querySelector(".weekly-meal-shopper-recipe-main-pane");
    const cleanup = rightPane?._wmsCleanup;
    if (typeof cleanup === "function") cleanup();
    const container = overlay.parentElement;
    overlay.remove();
    this.recipeViewOverlay = null;
    if (!restoreLivePreview) return;
    if (container instanceof HTMLElement) container.focus?.();
  }

  async openRecipeViewInCurrentTab() {
    const leaf = this.app.workspace.activeLeaf;
    const file = this.app.workspace.getActiveFile();
    if (!leaf || !file || file.extension !== "md") {
      new Notice("Open a recipe note first.");
      return;
    }
    if (!this.isRecipeFile(file)) {
      new Notice("This command works on recipe notes only.");
      return;
    }

    let parsedIngredients = [];
    try {
      parsedIngredients = await this.parseIngredientsFromRecipeFile(file);
    } catch (error) {
      new Notice(error?.message || String(error));
      return;
    }

    this.closeRecipeViewOverlay({ restoreLivePreview: false });

    const viewContainer = leaf.view?.containerEl?.querySelector(".view-content");
    if (!(viewContainer instanceof HTMLElement)) {
      new Notice("Could not open recipe view in this tab.");
      return;
    }
    if (getComputedStyle(viewContainer).position === "static") {
      viewContainer.style.position = "relative";
    }

    const markdown = await this.app.vault.read(file);
    const overlay = document.createElement("div");
    overlay.className = "weekly-meal-shopper-recipe-overlay";
    overlay.tabIndex = -1;

    const shell = document.createElement("div");
    shell.className = "weekly-meal-shopper-recipe-overlay-shell";
    const header = document.createElement("div");
    header.className = "weekly-meal-shopper-recipe-overlay-header";
    const title = document.createElement("div");
    title.className = "weekly-meal-shopper-recipe-overlay-title";
    title.textContent = file.basename;
    const closeBtn = document.createElement("button");
    closeBtn.className = "weekly-meal-shopper-recipe-overlay-close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", "Close recipe view");
    closeBtn.addEventListener("click", () => {
      this.closeRecipeViewOverlay({ restoreLivePreview: true });
    });
    header.appendChild(title);
    header.appendChild(closeBtn);

    const content = document.createElement("div");
    content.className = "weekly-meal-shopper-recipe-overlay-content markdown-rendered";
    shell.appendChild(header);
    shell.appendChild(content);
    overlay.appendChild(shell);
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeRecipeViewOverlay({ restoreLivePreview: true });
      }
    });

    viewContainer.appendChild(overlay);
    this.recipeViewOverlay = overlay;
    await MarkdownRenderer.render(this.app, markdown, content, file.path, this);
    this.applyRecipeSplitView(content, { sourcePath: file.path, parsedIngredients });
    overlay.focus();

    const rightPane = overlay.querySelector(".weekly-meal-shopper-recipe-main-pane");
    if (rightPane instanceof HTMLElement) rightPane.focus();
  }

  applyRecipeSplitView(el, ctx) {
    if (!el || el.getAttribute("data-weekly-meal-shopper-split") === "true") return;
    if (!ctx?.sourcePath) return;
    const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile) || file.extension !== "md") return;
    if (!this.isRecipeFile(file)) return;

    const headings = [...el.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const ingredientHeading = headings.find((heading) => /^ingredients$/i.test(heading.textContent?.trim() || ""));
    if (!ingredientHeading) return;

    const rootChildren = [...el.children];
    const ingredientHeadingIndex = rootChildren.indexOf(ingredientHeading);
    if (ingredientHeadingIndex === -1) return;

    const ingredientHeadingLevel = Number(ingredientHeading.tagName.slice(1)) || 3;
    let ingredientEndIndex = rootChildren.length;
    for (let i = ingredientHeadingIndex + 1; i < rootChildren.length; i += 1) {
      const node = rootChildren[i];
      if (!(node instanceof HTMLElement)) continue;
      const match = node.tagName.match(/^H([1-6])$/);
      if (!match) continue;
      const level = Number(match[1]);
      if (level <= ingredientHeadingLevel) {
        ingredientEndIndex = i;
        break;
      }
    }

    const ingredientSectionNodes = rootChildren.slice(ingredientHeadingIndex, ingredientEndIndex);
    if (ingredientSectionNodes.length === 0) return;

    const splitRoot = document.createElement("div");
    splitRoot.className = "weekly-meal-shopper-recipe-view";
    const leftPane = document.createElement("aside");
    leftPane.className = "weekly-meal-shopper-recipe-ingredients-pane";
    const rightPane = document.createElement("section");
    rightPane.className = "weekly-meal-shopper-recipe-main-pane";
    rightPane.tabIndex = 0;
    rightPane.setAttribute("aria-label", "Recipe directions pane");

    for (const node of rootChildren) {
      if (ingredientSectionNodes.includes(node)) continue;
      rightPane.appendChild(node);
    }
    for (const node of ingredientSectionNodes) {
      leftPane.appendChild(node);
    }

    splitRoot.appendChild(leftPane);
    splitRoot.appendChild(rightPane);
    el.empty();
    el.appendChild(splitRoot);
    el.setAttribute("data-weekly-meal-shopper-split", "true");

    this.renderRecipeViewIngredientPane(leftPane, ctx?.parsedIngredients || []);
    this.enableIngredientChecklist(file, leftPane);
    this.enableRecipeSectionSync(leftPane, rightPane);
    this.enableRecipeVimNavigation(rightPane);
    this.enableStepIngredientEmphasis(leftPane, rightPane);
  }

  renderRecipeViewIngredientPane(leftPane, parsedIngredients) {
    if (!leftPane) return;
    const ingredientItems = [...leftPane.querySelectorAll("li")];
    if (ingredientItems.length === 0) return;

    const items = Array.isArray(parsedIngredients) ? parsedIngredients : [];
    let parsedIndex = 0;
    for (const li of ingredientItems) {
      const parsed = items[parsedIndex];
      if (!parsed) continue;
      parsedIndex += 1;
      const displayText = formatRecipeViewIngredientDisplay(parsed, {
        template: this.settings.recipeViewIngredientDisplayTemplate,
        outputLabels: ACTIVE_MEASUREMENT_PROFILE.labels,
      });
      li.textContent = displayText;
      li.dataset.wmsIngredientName = normalizeSingleLineText(parsed.name);
      li.dataset.wmsIngredientPreparation = normalizeSingleLineText(parsed.preparation || "");
      li.dataset.wmsIngredientDisplay = displayText;
    }
  }

  enableRecipeVimNavigation(rightPane) {
    if (!rightPane) return;
    const isEditableTarget = (target) =>
      target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const steps = this.collectDirectionSteps(rightPane);
    if (typeof rightPane._wmsCleanup === "function") rightPane._wmsCleanup();
    rightPane._wmsCleanup = this.ensureDirectionFreeScrollSpacers(rightPane, steps);
    let activeIndex = -1;

    const setActive = (index, { center = true } = {}) => {
      if (steps.length === 0) return;
      const nextIndex = Math.max(0, Math.min(index, steps.length - 1));
      activeIndex = nextIndex;
      steps.forEach((stepEl, idx) => {
        const isActive = idx === nextIndex;
        stepEl.classList.toggle("weekly-meal-shopper-direction-step-active", isActive);
      });
      if (center) {
        const target = steps[nextIndex];
        const centeredTop = target.offsetTop - (rightPane.clientHeight / 2) + (target.clientHeight / 2);
        rightPane.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
      }
      const activeStep = steps[nextIndex];
      rightPane.dispatchEvent(
        new CustomEvent("wms-direction-step-active", {
          detail: {
            stepOffsetTop: activeStep?.offsetTop ?? 0,
            stepText: String(activeStep?.textContent || ""),
          },
        })
      );
    };

    if (steps.length > 0) {
      setActive(0, { center: false });
      steps.forEach((stepEl, idx) => {
        stepEl.classList.add("weekly-meal-shopper-direction-step");
        stepEl.addEventListener("click", () => {
          setActive(idx, { center: true });
          rightPane.focus();
        });
      });
    }

    const move = (delta) => {
      if (steps.length > 0) {
        const start = activeIndex === -1 ? 0 : activeIndex;
        setActive(start + delta, { center: true });
        return;
      }
      const fallbackStep = 56 * delta;
      rightPane.scrollBy({ top: fallbackStep, behavior: "smooth" });
    };

    rightPane.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        move(1);
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        move(-1);
      }
    });
  }

  collectDirectionSteps(rightPane) {
    if (!rightPane) return [];
    const headings = [...rightPane.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const directionsHeading = headings.find(
      (heading) => normalizeHeadingKey(heading.textContent || "") === "directions"
    );
    if (!directionsHeading) return [];

    const sectionLevel = Number(directionsHeading.tagName.slice(1)) || 3;
    const children = [...rightPane.children];
    const headingIdx = children.indexOf(directionsHeading);
    if (headingIdx === -1) return [];

    const steps = [];
    for (let i = headingIdx + 1; i < children.length; i += 1) {
      const node = children[i];
      if (!(node instanceof HTMLElement)) continue;
      const headingMatch = node.tagName.match(/^H([1-6])$/);
      if (headingMatch && Number(headingMatch[1]) <= sectionLevel) break;
      if (node.matches("ol, ul")) {
        steps.push(...[...node.querySelectorAll(":scope > li")]);
      } else if (node.matches("p")) {
        const text = String(node.textContent || "").trim();
        if (text) steps.push(node);
      }
    }

    return steps.filter((step) => String(step.textContent || "").trim().length > 0);
  }

  ensureDirectionFreeScrollSpacers(rightPane, steps) {
    if (!rightPane || !Array.isArray(steps) || steps.length === 0) return () => {};
    const firstStep = steps[0];
    const lastStep = steps[steps.length - 1];
    if (!(firstStep instanceof HTMLElement) || !(lastStep instanceof HTMLElement)) return () => {};

    const topSpacer = document.createElement("div");
    topSpacer.className = "weekly-meal-shopper-direction-free-scroll-spacer";
    topSpacer.setAttribute("aria-hidden", "true");

    const bottomSpacer = document.createElement("div");
    bottomSpacer.className = "weekly-meal-shopper-direction-free-scroll-spacer";
    bottomSpacer.setAttribute("aria-hidden", "true");

    firstStep.before(topSpacer);
    lastStep.after(bottomSpacer);

    const update = () => {
      const h = Math.max(120, Math.floor(rightPane.clientHeight * 0.42));
      topSpacer.style.height = `${h}px`;
      bottomSpacer.style.height = `${h}px`;
    };
    update();

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => update());
      resizeObserver.observe(rightPane);
    }

    return () => {
      resizeObserver?.disconnect();
      topSpacer.remove();
      bottomSpacer.remove();
    };
  }

  enableIngredientChecklist(file, leftPane) {
    if (!file || !leftPane) return;
    const ingredientItems = [...leftPane.querySelectorAll("li")];
    ingredientItems.forEach((li, index) => {
      const ingredientId = `${index}:${normalizeSearchText(li.textContent || "")}`;
      li.classList.add("weekly-meal-shopper-ingredient-item");
      li.setAttribute("tabindex", "0");
      li.setAttribute("role", "button");
      li.dataset.wmsIngredientId = ingredientId;
      let checked = false;

      const applyCheckedState = (checked) => {
        li.classList.toggle("weekly-meal-shopper-ingredient-used", checked);
        li.setAttribute("aria-pressed", checked ? "true" : "false");
      };

      applyCheckedState(false);

      const toggle = () => {
        checked = !checked;
        applyCheckedState(checked);
      };

      li.addEventListener("click", () => {
        toggle();
      });
      li.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle();
        }
      });
    });
  }

  enableStepIngredientEmphasis(leftPane, rightPane) {
    if (!leftPane || !rightPane) return;
    const ingredientItems = [...leftPane.querySelectorAll("li")];
    if (ingredientItems.length === 0) return;
    const ingredientLines = ingredientItems.map((li) => {
      const name = normalizeSingleLineText(li.dataset?.wmsIngredientName || "");
      const preparation = normalizeSingleLineText(li.dataset?.wmsIngredientPreparation || "");
      if (!name) return `- ${String(li.textContent || "").trim()}`;
      return `- ${name}${preparation ? `, ${preparation}` : ""}`;
    });
    const sharedGenericWords = collectSharedGenericIngredientWords(ingredientLines);

    const entries = ingredientItems.map((li) => {
      const datasetName = normalizeSingleLineText(li.dataset?.wmsIngredientName || "");
      const baseName = datasetName
        ? stripPreparationPhrases(datasetName)
        : stripPreparationPhrases(String(li.textContent || ""));
      const mentionPhrases = buildIngredientMentionPhrases([`- ${baseName}`], { sharedGenericWords });
      return { li, mentionPhrases };
    });

    const applyForStepText = (stepText) => {
      for (const entry of entries) {
        const matched = entry.mentionPhrases.some((phrase) => containsNormalizedPhrase(stepText, phrase));
        entry.li.classList.toggle("weekly-meal-shopper-ingredient-mentioned", matched);
      }
    };

    rightPane.addEventListener("wms-direction-step-active", (event) => {
      applyForStepText(String(event?.detail?.stepText || ""));
    });

    const activeStep = rightPane.querySelector(".weekly-meal-shopper-direction-step-active");
    if (activeStep instanceof HTMLElement) {
      applyForStepText(String(activeStep.textContent || ""));
    }
  }

  collectSubheadingGroups(container, sectionHeadingText) {
    if (!container) return [];
    const allHeadings = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const sectionHeading = allHeadings.find(
      (heading) => normalizeHeadingKey(heading.textContent || "") === normalizeHeadingKey(sectionHeadingText)
    );
    if (!sectionHeading) return [];

    const sectionLevel = Number(sectionHeading.tagName.slice(1)) || 3;
    const children = [...container.children];
    const sectionIdx = children.indexOf(sectionHeading);
    if (sectionIdx === -1) return [];

    const groups = [];
    let active = null;
    for (let i = sectionIdx + 1; i < children.length; i += 1) {
      const node = children[i];
      if (!(node instanceof HTMLElement)) continue;
      const headingMatch = node.tagName.match(/^H([1-6])$/);
      if (headingMatch) {
        const level = Number(headingMatch[1]);
        if (level <= sectionLevel) break;
        if (level !== 4) continue;
        const key = normalizeHeadingKey(node.textContent || "");
        active = { key, heading: node };
        groups.push(active);
      }
    }

    return groups.filter((group) => !!group.key);
  }

  wrapIngredientSubgroups(leftPane, ingredientHeading) {
    if (!leftPane || !ingredientHeading) return new Map();
    const children = [...leftPane.children];
    const baseLevel = Number(ingredientHeading.tagName.slice(1)) || 3;
    const headingIdx = children.indexOf(ingredientHeading);
    if (headingIdx === -1) return new Map();

    const map = new Map();
    let idx = headingIdx + 1;
    while (idx < children.length) {
      const node = children[idx];
      if (!(node instanceof HTMLElement)) {
        idx += 1;
        continue;
      }
      const headingMatch = node.tagName.match(/^H([1-6])$/);
      if (!headingMatch || Number(headingMatch[1]) !== 4) {
        idx += 1;
        continue;
      }

      const key = normalizeHeadingKey(node.textContent || "");
      const wrapper = document.createElement("div");
      wrapper.className = "weekly-meal-shopper-ingredient-group";
      wrapper.dataset.groupKey = key;

      const toMove = [node];
      let j = idx + 1;
      while (j < children.length) {
        const next = children[j];
        if (!(next instanceof HTMLElement)) {
          toMove.push(next);
          j += 1;
          continue;
        }
        const nextHeadingMatch = next.tagName.match(/^H([1-6])$/);
        if (nextHeadingMatch) {
          const nextLevel = Number(nextHeadingMatch[1]);
          if (nextLevel <= baseLevel) break;
          if (nextLevel === 4) break;
        }
        toMove.push(next);
        j += 1;
      }

      node.before(wrapper);
      for (const moving of toMove) wrapper.appendChild(moving);
      map.set(key, wrapper);
      idx = j;
    }

    return map;
  }

  enableRecipeSectionSync(leftPane, rightPane) {
    if (!leftPane || !rightPane) return;

    const ingredientHeadings = [...leftPane.querySelectorAll("h1, h2, h3, h4, h5, h6")];
    const ingredientHeading = ingredientHeadings.find(
      (heading) => normalizeHeadingKey(heading.textContent || "") === "ingredients"
    );
    if (!ingredientHeading) return;

    const ingredientGroups = this.wrapIngredientSubgroups(leftPane, ingredientHeading);
    if (ingredientGroups.size === 0) return;

    const directionGroups = this.collectSubheadingGroups(rightPane, "directions");
    if (directionGroups.length === 0) return;

    let lastActiveKey = "";

    const centerIngredientGroupInPane = (groupEl) => {
      if (!(groupEl instanceof HTMLElement)) return;
      const paneHeight = leftPane.clientHeight || 0;
      const groupTop = groupEl.offsetTop;
      const groupHeight = groupEl.offsetHeight || 0;
      if (paneHeight <= 0) return;

      let targetTop = groupTop - (paneHeight / 2) + (groupHeight / 2);
      // If the section is larger than the pane, anchor near top to keep it readable.
      if (groupHeight > paneHeight * 0.9) {
        targetTop = groupTop - 12;
      }
      leftPane.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    };

    const getDirectionKeyForOffset = (offsetTop) => {
      let key = "";
      for (const group of directionGroups) {
        if (group.heading.offsetTop <= offsetTop + 1) key = group.key;
        else break;
      }
      return key;
    };

    const applyActiveDirectionKey = (key) => {
      const hasMatch = key && ingredientGroups.has(key);
      for (const [groupKey, el] of ingredientGroups.entries()) {
        el.classList.toggle("weekly-meal-shopper-ingredient-group-active", !!hasMatch && groupKey === key);
        el.classList.toggle("weekly-meal-shopper-ingredient-group-dimmed", !!hasMatch && groupKey !== key);
      }
      if (hasMatch && key !== lastActiveKey) {
        centerIngredientGroupInPane(ingredientGroups.get(key));
      }
      lastActiveKey = key || "";
    };

    const updateFromScroll = () => {
      const markerY = rightPane.scrollTop + Math.max(24, rightPane.clientHeight / 2);
      const activeKey = getDirectionKeyForOffset(markerY);
      applyActiveDirectionKey(activeKey);
    };

    rightPane.addEventListener("wms-direction-step-active", (event) => {
      const markerY = Number(event?.detail?.stepOffsetTop || 0);
      const activeKey = getDirectionKeyForOffset(markerY);
      applyActiveDirectionKey(activeKey);
    });
    rightPane.addEventListener("scroll", updateFromScroll, { passive: true });
    updateFromScroll();
  }

  cloneParsedIngredients(items) {
    return Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  }

  getRecipeParseSignature(file) {
    const mtime = Number(file?.stat?.mtime || 0);
    const size = Number(file?.stat?.size || 0);
    return `${mtime}:${size}`;
  }

  invalidateRecipeParseCache(filePath) {
    if (!this.parsedIngredientCache) this.parsedIngredientCache = new Map();
    if (!filePath) return;
    this.parsedIngredientCache.delete(filePath);
  }

  getLegacyRecipeIngredientNotice(file) {
    const fileLabel = file?.basename ? `"${file.basename}"` : "this recipe";
    return `${fileLabel} still uses the old free-text ingredient format. Run 'Weekly Meal Shopper: Standardize current recipe format' first.`;
  }

  async parseIngredientsFromRecipeFile(file, { force = false, allowLegacy = false } = {}) {
    if (!this.parsedIngredientCache) this.parsedIngredientCache = new Map();
    const signature = this.getRecipeParseSignature(file);
    const cached = this.parsedIngredientCache.get(file.path);
    if (!force && !allowLegacy && cached && cached.signature === signature) {
      return this.cloneParsedIngredients(cached.items);
    }

    const content = await this.app.vault.read(file);
    const lines = extractIngredientsSection(content);
    if (!allowLegacy && !recipeIngredientLinesAreStructured(lines)) {
      throw new Error(this.getLegacyRecipeIngredientNotice(file));
    }
    const parsed = [];
    for (const line of lines) {
      if (!isMeaningfulIngredientLine(line)) continue;
      const item = parseIngredientLine(line, ACTIVE_UNIT_MAP, { allowLegacy });
      if (!item && !allowLegacy) {
        throw new Error(this.getLegacyRecipeIngredientNotice(file));
      }
      if (!item) continue;
      parsed.push(applyMeasurementPreferenceToParsedItem(item));
    }

    if (!allowLegacy) {
      this.parsedIngredientCache.set(file.path, {
        signature,
        items: this.cloneParsedIngredients(parsed),
      });
    }
    return parsed;
  }

  async saveParsedIngredientsToFrontmatter(file, parsedIngredients) {
    const field = this.settings.parsedIngredientsField;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.type = frontmatter.type || "Recipe";
      frontmatter[field] = parsedIngredients.map((item) => ({
        name: item.name,
        preparation: item.preparation || "",
        amount: item.amount,
        unit: item.unit,
        quantityUnknown: !!item.quantityUnknown,
        amountMetric: item.amountMetric,
        unitMetric: item.unitMetric,
      }));
    });
    this.invalidateRecipeParseCache(file.path);
  }

  async standardizeRecipeFile(file, { useOpenAI = false } = {}) {
    const original = await this.app.vault.read(file);

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.tags = frontmatter.tags || ["🧠/🍽️/📄"];
      frontmatter.CookTime = frontmatter.CookTime ?? "";
      frontmatter.PrepTime = frontmatter.PrepTime ?? "";
      if (!Object.prototype.hasOwnProperty.call(frontmatter, "Portions")) {
        frontmatter.Portions = frontmatter.Servings ?? "";
      }
      frontmatter.IngredientRecipes = frontmatter.IngredientRecipes ?? [];
      frontmatter[this.settings.parsedIngredientsField] = frontmatter[this.settings.parsedIngredientsField] ?? [];
      frontmatter.Cost = frontmatter.Cost ?? "";
      frontmatter.RecipeRating = frontmatter.RecipeRating ?? 3;
      frontmatter.MealPrep = frontmatter.MealPrep ?? false;
      frontmatter.WeekDay = frontmatter.WeekDay ?? false;
      frontmatter.FrozenPortionsAvailable = frontmatter.FrozenPortionsAvailable ?? 0;
      frontmatter.UseFrozenFirst = frontmatter.UseFrozenFirst ?? true;
      frontmatter.type = "Recipe";
      delete frontmatter.Class;
      delete frontmatter.class;
      frontmatter.FoodType = frontmatter.FoodType ?? "Meal Item";
      frontmatter.Collection = frontmatter.Collection ?? [];
      frontmatter.Cover = frontmatter.Cover ?? "";
      frontmatter.Link = frontmatter.Link ?? "";
      frontmatter.Day = frontmatter.Day ?? "";
      frontmatter.Time = frontmatter.Time ?? "";
    });

    const updated = await this.app.vault.read(file);
    const split = splitFrontmatter(updated);
    const sectionMap = parseSections(split.body);
    const canSafelyRewriteIngredients = useOpenAI || recipeIngredientLinesAreStructured(sectionMap.ingredients);
    if (!canSafelyRewriteIngredients) {
      if (updated !== original) {
        this.invalidateRecipeParseCache(file.path);
        return true;
      }
      return false;
    }
    let usedOpenAI = false;

    if (useOpenAI) {
      try {
        const aligned = await this.alignRecipeSectionsWithOpenAI({
          title: file.basename,
          ingredients: sectionMap.ingredients,
          directions: sectionMap.directions,
          notes: sectionMap.notes,
        });
        if (aligned?.ingredients?.length) {
          sectionMap.ingredients = aligned.ingredients.map((line) => `- ${stripListMarkerText(line)}`);
        }
        if (aligned?.directions?.length) {
          sectionMap.directions = aligned.directions.map((line, index) => `${index + 1}. ${stripListMarkerText(line)}`);
        }
        usedOpenAI = true;
      } catch (error) {
        new Notice(`API-assisted recipe cleanup skipped: ${error?.message || String(error)}. Using local standardization instead.`);
      }
    }
    sectionMap.ingredients = normalizeIngredientsSectionLines(
      sectionMap.ingredients,
      ACTIVE_UNIT_MAP,
      ACTIVE_MEASUREMENT_PROFILE.labels,
      this.settings.ingredientStorageSeparator,
      this.settings.measurementPreference
    );
    sectionMap.directions = normalizeDirectionsSectionLines(sectionMap.directions, sectionMap.ingredients);
    const standardizedBody = buildStandardBody(sectionMap);

    const rewritten = `${split.frontmatterRaw}\n\n${standardizedBody}`;
    if (rewritten === original) return false;

    await this.app.vault.modify(file, rewritten);
    this.invalidateRecipeParseCache(file.path);

    const parsedIngredients = await this.parseIngredientsFromRecipeFile(file, { force: true });
    await this.saveParsedIngredientsToFrontmatter(file, parsedIngredients);

    if (usedOpenAI) {
      new Notice(`Standardized ${file.basename} with API-assisted ingredient and direction alignment.`);
    }

    return true;
  }

  extractParsedIngredientsFromFrontmatter(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    const fieldValue = fm[this.settings.parsedIngredientsField];

    if (!Array.isArray(fieldValue) || fieldValue.length === 0) {
      return [];
    }

    const parsed = [];
    for (let i = 0; i < fieldValue.length; i += 1) {
      const raw = fieldValue[i];
      if (!raw || typeof raw !== "object") continue;
      const name = cleanIngredientName(String(raw.name || ""));
      const unitMetric = String(raw.unitMetric || raw.unit || "unit").trim();
      const quantityUnknown = !!raw.quantityUnknown;
      const amountMetric = Number(raw.amountMetric);

      if (!name || (Number.isNaN(amountMetric) && !quantityUnknown)) continue;

      parsed.push({
        name,
        canonicalName: canonicalIngredientName(name),
        unitMetric,
        amountMetric: Number.isNaN(amountMetric) ? 0 : amountMetric,
        quantityUnknown,
        sourceRecipePath: file.path,
        sourceIndex: i,
      });
    }

    return parsed;
  }

  async getRecipeIngredients(file) {
    return this.getRecipeIngredientsRecursive(file, new Set());
  }

  getLinkedRecipeFilesFromIngredientRecipes(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    const ingredientList = Array.isArray(fm.IngredientRecipes) ? fm.IngredientRecipes : [];
    const linked = [];
    const seen = new Set();

    for (const raw of ingredientList) {
      const linkpath = extractWikiLinkpath(raw);
      if (!linkpath) continue;

      let target = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
      if (!(target instanceof TFile)) {
        const byPath = this.app.vault.getAbstractFileByPath(normalizePath(linkpath));
        if (byPath instanceof TFile) target = byPath;
      }
      if (!(target instanceof TFile) || target.extension !== "md") continue;
      if (!this.isRecipeFile(target)) continue;
      if (target.path === file.path) continue;
      if (seen.has(target.path)) continue;

      seen.add(target.path);
      linked.push(target);
    }

    return linked;
  }

  async getRecipeIngredientsRecursive(file, visited) {
    if (visited.has(file.path)) return [];
    visited.add(file.path);

    const extracted = await this.parseIngredientsFromRecipeFile(file);
    const currentParsedFrontmatter = this.extractParsedIngredientsFromFrontmatter(file);
    const hasSuspiciousParsedNames = currentParsedFrontmatter.some((item) => looksLikePreparationOnlyName(item.name));
    if (
      extracted.length > 0
      && (
        currentParsedFrontmatter.length !== extracted.length
        || hasSuspiciousParsedNames
      )
    ) {
      await this.saveParsedIngredientsToFrontmatter(file, extracted);
    }

    let parsed = extracted.map((item, idx) => ({
      name: item.name,
      canonicalName: item.canonicalName,
      unitMetric: item.unitMetric,
      amountMetric: item.amountMetric,
      quantityUnknown: !!item.quantityUnknown,
      sourceRecipePath: file.path,
      sourceIndex: idx,
    }));

    const linkedRecipes = this.getLinkedRecipeFilesFromIngredientRecipes(file);
    for (const linkedFile of linkedRecipes) {
      const nested = await this.getRecipeIngredientsRecursive(linkedFile, visited);
      if (nested.length > 0) parsed.push(...nested);
    }

    return parsed;
  }

  getRecipePlanningProfile(file, plannedInstances) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    const portionsPerCook = Math.max(1, parseNumberLike(fm.Portions ?? fm.Servings, 1));
    // Optional per-recipe frontmatter override: how many portions ONE
    // planned instance of this specific recipe needs. Defaults to the global
    // household size when absent, so most recipes need no override at all —
    // only set this on a recipe where a planned instance genuinely needs
    // more or less than a full household-size portion (e.g. a side of fruit
    // where each person only really eats half a normal serving: household 4
    // -> set PortionsPerMeal: 2 directly, no separate multiplier to reason about).
    const portionsPerMeal = positiveNumberOr(fm.PortionsPerMeal, positiveNumberOr(this.settings?.householdSize, 1));
    const frozenAvailable = Math.max(0, parseNumberLike(fm.FrozenPortionsAvailable, 0));
    const useFrozenFirst = parseBooleanLike(fm.UseFrozenFirst, true);

    return computePlanningProfile({ portionsPerCook, portionsPerMeal, frozenAvailable, useFrozenFirst, plannedInstances });
  }

  // Coverage for the "Meal Coverage" canvas overlay: for every recipe card in
  // the plain weekly-plan section of the given canvas (not Projects/Hosting,
  // which already have their own explicit serving-target prompts), how many
  // times it's planned this week vs. how many cook batches that requires.
  async computeMealCoverageForCanvas(canvasFile) {
    let canvasText = "";
    try {
      canvasText = await this.app.vault.read(canvasFile);
    } catch {
      return [];
    }

    const entries = parseCanvasRecipeEntries(canvasText);
    const counts = new Map();
    for (const entry of entries) {
      if (entry.section !== "default") continue;
      let file = this.app.vault.getAbstractFileByPath(normalizePath(entry.rawPath));
      if (!(file instanceof TFile)) {
        const linkDest = this.app.metadataCache.getFirstLinkpathDest(entry.rawPath, canvasFile.path);
        if (linkDest) file = linkDest;
      }
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      if (!this.isRecipeFile(file)) continue;

      const existing = counts.get(file.path) || { file, defaultCount: 0 };
      existing.defaultCount += 1;
      counts.set(file.path, existing);
    }

    // Second, geometric pass over `type: "file"` nodes only, used purely for
    // the "cook again before <day> <meal>" callout and chronological sort —
    // text-node-embedded recipe links don't get a day/meal instance.
    const instancesByPath = new Map();
    let canvasJson = null;
    try {
      canvasJson = JSON.parse(canvasText);
    } catch {
      canvasJson = null;
    }
    if (canvasJson && Array.isArray(canvasJson.nodes)) {
      const groups = canvasJson.nodes.filter((n) => n && n.type === "group");
      for (const node of canvasJson.nodes) {
        if (!node || node.type !== "file" || typeof node.file !== "string") continue;
        if (sectionForNode(node, groups) !== "default") continue;
        const path = normalizePath(node.file);
        if (!instancesByPath.has(path)) instancesByPath.set(path, []);
        instancesByPath.get(path).push({
          day: findContainingWeekdayLabel(node, groups),
          mealType: findContainingMealTypeLabel(node, groups),
        });
      }
    }

    const startDay = this.settings?.weekStartDay;
    const householdSize = positiveNumberOr(this.settings?.householdSize, 1);
    const acknowledged = new Set((this.settings?.coverageAcknowledgedShort || {})[canvasFile.path] || []);
    const staleAcknowledged = [];

    const rows = [];
    for (const { file, defaultCount } of counts.values()) {
      const recipePortions = this.getRecipePortions(file);
      const profile = this.getRecipePlanningProfile(file, defaultCount);
      const rawStatus = classifyMealCoverageStatus(profile);

      const instances = [...(instancesByPath.get(file.path) || [])]
        .sort((a, b) => weekdayRank(a.day, startDay) - weekdayRank(b.day, startDay));

      const coveragePerBatch = Math.floor(recipePortions / householdSize);
      const nextCookInstance = rawStatus === "short" && instances.length > coveragePerBatch
        ? instances[coveragePerBatch] || null
        : null;

      let status;
      if (rawStatus === "covered") {
        status = "green";
        if (acknowledged.has(file.path)) staleAcknowledged.push(file.path);
      } else {
        status = acknowledged.has(file.path) ? "yellow" : "red";
      }

      rows.push({
        file,
        plannedInstances: defaultCount,
        recipePortions,
        householdSize,
        cooksNeeded: profile.cooksNeeded,
        status,
        nextCookInstance,
        earliestDayRank: instances.length > 0 ? weekdayRank(instances[0].day, startDay) : 999,
      });
    }

    if (staleAcknowledged.length > 0) {
      await this.clearCoverageAcknowledgments(canvasFile, staleAcknowledged);
    }

    rows.sort((a, b) => {
      const statusDiff = COVERAGE_STATUS_ORDER[a.status] - COVERAGE_STATUS_ORDER[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.earliestDayRank - b.earliestDayRank;
    });

    return rows;
  }

  // Per-day macro breakdown for the canvas's Macro Details overlay — a
  // SEPARATE panel from Meal Coverage (different question: "how much am I
  // eating each day" vs "do I have enough batches cooked"). One entry per
  // weekday (ordered per weekStartDay, always all 7 so empty days still show
  // up), each with day totals plus a per-meal breakdown. Only counts
  // `type: "file"` cards sitting inside a recognizable day column in the
  // "default" section (same geometric pass as the coverage overlay's
  // "cook again" detection) — text-node-embedded recipe links and
  // Project/Hosting cards are day-agnostic/out of scope here. A card whose
  // recipe hasn't had macros calculated yet (TrackMacros off or never run)
  // is counted in `uncalculatedCount` rather than silently treated as 0, so
  // the panel can say "N meal(s) not yet calculated" instead of understating
  // the day's total.
  async computeMacroDetailsForCanvas(canvasFile) {
    let canvasText = "";
    try {
      canvasText = await this.app.vault.read(canvasFile);
    } catch {
      return [];
    }

    let canvasJson = null;
    try {
      canvasJson = JSON.parse(canvasText);
    } catch {
      canvasJson = null;
    }
    if (!canvasJson || !Array.isArray(canvasJson.nodes)) return [];

    const groups = canvasJson.nodes.filter((n) => n && n.type === "group");
    const orderedDays = getOrderedWeekdays(this.settings?.weekStartDay);
    const byDay = new Map(
      orderedDays.map((day) => [
        day,
        { day, displayName: WEEKDAY_DISPLAY_NAMES[day], totalKcal: 0, totalProtein: 0, totalCarbs: 0, totalFat: 0, meals: [], uncalculatedCount: 0 },
      ])
    );

    for (const node of canvasJson.nodes) {
      if (!node || node.type !== "file" || typeof node.file !== "string") continue;
      if (sectionForNode(node, groups) !== "default") continue;

      const day = findContainingWeekdayLabel(node, groups);
      if (!day || !byDay.has(day)) continue;

      let file = this.app.vault.getAbstractFileByPath(normalizePath(node.file));
      if (!(file instanceof TFile)) {
        const linkDest = this.app.metadataCache.getFirstLinkpathDest(node.file, canvasFile.path);
        if (linkDest) file = linkDest;
      }
      if (!(file instanceof TFile) || file.extension !== "md") continue;

      const bucket = byDay.get(day);
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      const kcal = Number(fm.MacroKcalPerServing);
      if (fm.TrackMacros !== true || !Number.isFinite(kcal)) {
        bucket.uncalculatedCount += 1;
        continue;
      }

      const protein = Number(fm.MacroProteinGPerServing) || 0;
      const carbs = Number(fm.MacroCarbsGPerServing) || 0;
      const fat = Number(fm.MacroFatGPerServing) || 0;
      bucket.totalKcal += kcal;
      bucket.totalProtein += protein;
      bucket.totalCarbs += carbs;
      bucket.totalFat += fat;
      bucket.meals.push({ name: file.basename, mealType: findContainingMealTypeLabel(node, groups), kcal, protein, carbs, fat });
    }

    return orderedDays.map((day) => byDay.get(day));
  }

  // Adds/removes recipePath from the acknowledged ("red -> yellow") set for
  // this canvas and persists it.
  async toggleCoverageAcknowledgment(canvasFile, recipePath) {
    const map = { ...(this.settings.coverageAcknowledgedShort || {}) };
    const set = new Set(map[canvasFile.path] || []);
    if (set.has(recipePath)) set.delete(recipePath); else set.add(recipePath);
    map[canvasFile.path] = [...set];
    this.settings.coverageAcknowledgedShort = map;
    await this.saveSettings();
  }

  // Drops stale acknowledgment entries once a recipe is fully covered again,
  // so a future short-again occurrence starts back at red.
  async clearCoverageAcknowledgments(canvasFile, recipePaths) {
    const map = { ...(this.settings.coverageAcknowledgedShort || {}) };
    const set = new Set(map[canvasFile.path] || []);
    for (const path of recipePaths) set.delete(path);
    map[canvasFile.path] = [...set];
    this.settings.coverageAcknowledgedShort = map;
    await this.saveSettings();
  }

  // Writes green/red onto each plain-weekly-section recipe card's `color`
  // field so coverage status is visible directly on the card, not just in the
  // overlay list. Only touches nodes whose color actually needs to change, so
  // once in sync this is a no-op — that's what keeps the vault "modify"
  // listener from looping against its own writes.
  async syncCanvasCardColorsToCoverage(canvasFile, rows) {
    let canvasText = "";
    try {
      canvasText = await this.app.vault.read(canvasFile);
    } catch {
      return;
    }
    let canvas;
    try {
      canvas = JSON.parse(canvasText);
    } catch {
      return;
    }
    if (!Array.isArray(canvas.nodes)) return;

    // Obsidian canvas preset colors: "1" red, "3" yellow, "4" green.
    const COVERAGE_NODE_COLOR = { red: "1", yellow: "3", green: "4" };
    const statusByPath = new Map(rows.map((r) => [r.file.path, r.status]));
    const groups = canvas.nodes.filter((n) => n && n.type === "group");

    let changed = false;
    for (const node of canvas.nodes) {
      if (!node || node.type !== "file" || typeof node.file !== "string") continue;
      if (sectionForNode(node, groups) !== "default") continue;
      const status = statusByPath.get(normalizePath(node.file));
      const desiredColor = COVERAGE_NODE_COLOR[status];
      if (!desiredColor) continue;
      if (node.color !== desiredColor) {
        node.color = desiredColor;
        changed = true;
      }
    }

    if (!changed) return;
    this.coverageWriteInProgress = true;
    try {
      await this.app.vault.modify(canvasFile, `${JSON.stringify(canvas, null, 2)}\n`);
    } finally {
      this.coverageWriteInProgress = false;
    }
  }

  // Injects the floating "Meal Coverage" overlay directly into the canvas
  // view's own DOM (the same layer Obsidian's built-in zoom/undo toolbar
  // uses) — not an Obsidian sidebar pane. Torn down whenever the active leaf
  // stops being this canvas.
  handleActiveLeafChangeForCoverage(leaf) {
    this.teardownMealCoverageOverlay();
    if (this.settings?.mealCoverageEnabled !== false) {
      const file = leaf?.view?.file;
      if (file instanceof TFile && file.extension === "canvas") {
        this.activeCoverageCanvasFile = file;
        this.setupMealCoverageOverlay(leaf);
        this.refreshMealCoverageOverlay();
      }
    }

    this.teardownMacroDetailsOverlay();
    if (this.settings?.macroDetailsEnabled === true) {
      const file = leaf?.view?.file;
      if (file instanceof TFile && file.extension === "canvas") {
        this.activeMacroDetailsCanvasFile = file;
        this.setupMacroDetailsOverlay(leaf);
        this.refreshMacroDetailsOverlay();
      }
    }
  }

  setupMealCoverageOverlay(leaf) {
    const containerEl = leaf?.view?.containerEl;
    if (!containerEl) return;
    const panel = containerEl.createDiv({ cls: "weekly-meal-shopper-coverage-panel" });
    panel.createDiv({ cls: "weekly-meal-shopper-coverage-title", text: "Meal Coverage" });
    const list = panel.createDiv({ cls: "weekly-meal-shopper-coverage-list" });
    this.mealCoveragePanelEl = panel;
    this.mealCoverageListEl = list;
  }

  teardownMealCoverageOverlay() {
    this.mealCoveragePanelEl?.remove();
    this.mealCoveragePanelEl = null;
    this.mealCoverageListEl = null;
    this.activeCoverageCanvasFile = null;
  }

  // Debounced so rapid canvas edits (dragging cards around) don't trigger a
  // recompute + rewrite on every intermediate frame.
  handleVaultModifyForCoverage(file) {
    if (!(file instanceof TFile) || file.extension !== "canvas") return;

    if (!this.coverageWriteInProgress && this.activeCoverageCanvasFile && file.path === this.activeCoverageCanvasFile.path) {
      if (this.coverageDebounceTimer) clearTimeout(this.coverageDebounceTimer);
      this.coverageDebounceTimer = setTimeout(() => this.refreshMealCoverageOverlay(), 400);
    }

    if (this.activeMacroDetailsCanvasFile && file.path === this.activeMacroDetailsCanvasFile.path) {
      if (this.macroDetailsDebounceTimer) clearTimeout(this.macroDetailsDebounceTimer);
      this.macroDetailsDebounceTimer = setTimeout(() => this.refreshMacroDetailsOverlay(), 400);
    }
  }

  // Macro Details is a floating panel on the canvas view, positioned
  // opposite Meal Coverage (top-right vs top-left) so the two read as
  // clearly separate blocks rather than one combined panel. The whole panel
  // collapses/expands (macroDetailsPanelCollapsed), and each day within it
  // collapses independently (macroDetailsCollapsedDays) — both are in-memory
  // UI state only, reset on reopening the canvas, same as recipeViewOverlay.
  setupMacroDetailsOverlay(leaf) {
    const containerEl = leaf?.view?.containerEl;
    if (!containerEl) return;
    const panel = containerEl.createDiv({ cls: "weekly-meal-shopper-macro-details-panel" });
    const header = panel.createDiv({ cls: "weekly-meal-shopper-macro-details-header" });
    header.createDiv({ cls: "weekly-meal-shopper-macro-details-title", text: "Macro Details" });
    const indicator = header.createDiv({ cls: "weekly-meal-shopper-collapse-indicator", text: "▸" });
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    const toggle = () => {
      this.macroDetailsPanelCollapsed = !this.macroDetailsPanelCollapsed;
      this.renderMacroDetailsPanel(this.lastMacroDetailsDays || []);
    };
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
    });
    const list = panel.createDiv({ cls: "weekly-meal-shopper-macro-details-list" });
    this.macroDetailsPanelEl = panel;
    this.macroDetailsListEl = list;
    this.macroDetailsCollapseIndicatorEl = indicator;
  }

  teardownMacroDetailsOverlay() {
    this.macroDetailsPanelEl?.remove();
    this.macroDetailsPanelEl = null;
    this.macroDetailsListEl = null;
    this.macroDetailsCollapseIndicatorEl = null;
    this.activeMacroDetailsCanvasFile = null;
    this.lastMacroDetailsDays = null;
  }

  async refreshMacroDetailsOverlay() {
    if (!this.activeMacroDetailsCanvasFile || !this.macroDetailsListEl) return;
    const canvasFile = this.activeMacroDetailsCanvasFile;
    const days = await this.computeMacroDetailsForCanvas(canvasFile);
    // The active canvas may have changed while the above await was in flight.
    if (this.activeMacroDetailsCanvasFile !== canvasFile || !this.macroDetailsListEl) return;
    this.renderMacroDetailsPanel(days);
  }

  renderMacroDetailsPanel(days) {
    this.lastMacroDetailsDays = days;
    const listEl = this.macroDetailsListEl;
    if (!listEl) return;

    if (this.macroDetailsCollapseIndicatorEl) {
      this.macroDetailsCollapseIndicatorEl.textContent = this.macroDetailsPanelCollapsed ? "▸" : "▾";
    }
    this.macroDetailsPanelEl?.toggleClass?.("is-collapsed", this.macroDetailsPanelCollapsed);
    listEl.style.display = this.macroDetailsPanelCollapsed ? "none" : "";
    if (this.macroDetailsPanelCollapsed) return;

    listEl.empty();
    const unit = normalizeEnergyUnit(this.settings?.energyUnit);
    const roundEnergy = (kcal) => Math.round(convertKcalToDisplayEnergy(kcal, unit));
    const activeDays = (Array.isArray(days) ? days : []).filter((d) => d.meals.length > 0 || d.uncalculatedCount > 0);

    if (activeDays.length === 0) {
      listEl.createDiv({ cls: "weekly-meal-shopper-macro-details-empty", text: "No recipes planned this week yet." });
      return;
    }

    for (const day of days) {
      if (day.meals.length === 0 && day.uncalculatedCount === 0) continue;
      const dayCollapsed = this.macroDetailsCollapsedDays.has(day.day);

      const dayEl = listEl.createDiv({ cls: "weekly-meal-shopper-macro-day" });
      const dayHeader = dayEl.createDiv({ cls: "weekly-meal-shopper-macro-day-header" });
      dayHeader.setAttribute("role", "button");
      dayHeader.setAttribute("tabindex", "0");
      dayHeader.createDiv({ cls: "weekly-meal-shopper-collapse-indicator", text: dayCollapsed ? "▸" : "▾" });
      dayHeader.createDiv({ cls: "weekly-meal-shopper-macro-day-name", text: day.displayName });
      dayHeader.createDiv({ cls: "weekly-meal-shopper-macro-day-total", text: `${roundEnergy(day.totalKcal)} ${unit}` });
      const toggleDay = () => {
        if (this.macroDetailsCollapsedDays.has(day.day)) this.macroDetailsCollapsedDays.delete(day.day);
        else this.macroDetailsCollapsedDays.add(day.day);
        this.renderMacroDetailsPanel(this.lastMacroDetailsDays || []);
      };
      dayHeader.addEventListener("click", toggleDay);
      dayHeader.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleDay(); }
      });

      if (dayCollapsed) continue;

      const dayBody = dayEl.createDiv({ cls: "weekly-meal-shopper-macro-day-body" });
      dayBody.createDiv({
        cls: "weekly-meal-shopper-macro-day-macros",
        text: `Protein ${Math.round(day.totalProtein)}g · Carbs ${Math.round(day.totalCarbs)}g · Fat ${Math.round(day.totalFat)}g`,
      });
      for (const meal of day.meals) {
        const mealEl = dayBody.createDiv({ cls: "weekly-meal-shopper-macro-meal-row" });
        const label = meal.mealType ? `${meal.name} (${meal.mealType})` : meal.name;
        mealEl.createDiv({ cls: "weekly-meal-shopper-macro-meal-name", text: label });
        mealEl.createDiv({ cls: "weekly-meal-shopper-macro-meal-kcal", text: `${roundEnergy(meal.kcal)} ${unit}` });
      }
      if (day.uncalculatedCount > 0) {
        const note = day.uncalculatedCount === 1 ? "1 meal not yet calculated" : `${day.uncalculatedCount} meals not yet calculated`;
        dayBody.createDiv({ cls: "weekly-meal-shopper-macro-day-note", text: note });
      }
    }
  }

  async refreshMealCoverageOverlay() {
    if (!this.activeCoverageCanvasFile || !this.mealCoverageListEl) return;
    const canvasFile = this.activeCoverageCanvasFile;
    const rows = await this.computeMealCoverageForCanvas(canvasFile);
    // The active canvas may have changed while the above awaits were in flight.
    if (this.activeCoverageCanvasFile !== canvasFile || !this.mealCoverageListEl) return;
    this.renderMealCoverageList(rows);
    await this.syncCanvasCardColorsToCoverage(canvasFile, rows);
  }

  renderMealCoverageList(rows) {
    const listEl = this.mealCoverageListEl;
    if (!listEl) return;
    listEl.empty();

    if (rows.length === 0) {
      listEl.createDiv({ cls: "weekly-meal-shopper-coverage-empty", text: "No recipes planned this week yet." });
      return;
    }

    const canvasFile = this.activeCoverageCanvasFile;
    for (const row of rows) {
      const clickable = row.status !== "green";
      const rowEl = listEl.createDiv({
        cls: `weekly-meal-shopper-coverage-row is-${row.status}${clickable ? " is-clickable" : ""}`,
      });
      rowEl.createDiv({ cls: "weekly-meal-shopper-coverage-dot" });
      const textEl = rowEl.createDiv({ cls: "weekly-meal-shopper-coverage-text" });
      textEl.createDiv({ cls: "weekly-meal-shopper-coverage-name", text: row.file.basename });
      if (clickable) {
        const dayLabel = row.nextCookInstance?.day ? WEEKDAY_DISPLAY_NAMES[row.nextCookInstance.day] : null;
        const cookAgainText = dayLabel ? `Cook again: ${dayLabel}` : "Cook again";
        textEl.createDiv({ cls: "weekly-meal-shopper-coverage-detail weekly-meal-shopper-coverage-cook-again", text: cookAgainText });
      }

      if (clickable && canvasFile) {
        rowEl.setAttribute("role", "button");
        rowEl.setAttribute("tabindex", "0");
        rowEl.setAttribute(
          "aria-label",
          row.status === "yellow" ? "Click to unacknowledge" : "Click to acknowledge — needs cooking again, but that's fine"
        );
        const activate = async () => {
          await this.toggleCoverageAcknowledgment(canvasFile, row.file.path);
          await this.refreshMealCoverageOverlay();
        };
        rowEl.addEventListener("click", activate);
        rowEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
          }
        });
      }
    }
  }

  async showFrozenPortionsAvailable() {
    const allRecipes = this.app.vault.getMarkdownFiles().filter((file) => this.isRecipeFile(file));
    let withFrozenCount = 0;

    for (const file of allRecipes) {
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter || {};
      const frozen = Math.max(0, parseNumberLike(fm.FrozenPortionsAvailable, 0));
      if (frozen <= 0) continue;
      withFrozenCount += 1;
    }

    const content = [
      "views:",
      "  - type: table",
      "    name: Frozen Portions Inventory",
      "    filters:",
      "      and:",
      "        - FrozenPortionsAvailable > 0",
      "    order:",
      "      - file.name",
      "      - FrozenPortionsAvailable",
      "",
    ].join("\n");

    const outputPath = normalizePath("Utility/🧊 Frozen Portions Inventory.base");
    const existing = this.app.vault.getAbstractFileByPath(outputPath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      await this.app.workspace.getLeaf(true).openFile(existing);
    } else {
      const created = await this.app.vault.create(outputPath, content);
      await this.app.workspace.getLeaf(true).openFile(created);
    }

    new Notice(`Frozen portions base opened for ${withFrozenCount} recipes.`);
  }

  async setRecipeFrozenPortions(file, value) {
    const clamped = clampFrozenPortionValue(value);
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.FrozenPortionsAvailable = clamped;
      frontmatter.LastFrozenInventoryUpdate = new Date().toISOString();
    });
    return clamped;
  }

  openFrozenInventoryModal() {
    new FrozenInventoryModal(this.app, this).open();
  }

  async validateRecipes() {
    const categoryConfig = await this.loadIngredientCategoryConfig();
    const recipes = this.app.vault.getMarkdownFiles().filter((file) => this.isRecipeFile(file));

    const reports = [];
    for (const file of recipes) {
      let content = "";
      try {
        content = await this.app.vault.read(file);
      } catch (error) {
        reports.push({ name: file.basename, link: `[[${file.path}|${file.basename}]]`, findings: [{ severity: "error", type: "read", message: `Could not read file: ${error?.message || error}` }] });
        continue;
      }
      const ingredientLines = Array.from(extractIngredientsSection(content));
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      const portions = fm.Portions ?? fm.Servings ?? null;
      const findings = validateRecipeData({ ingredientLines, portions, categoryConfig });
      if (findings.length > 0) {
        reports.push({ name: file.basename, link: `[[${file.path}|${file.basename}]]`, findings });
      }
    }

    const generated = buildRecipeValidationReport(reports, recipes.length);
    const outputPath = normalizePath("Utility/🩺 Recipe Validation Report.md");
    const existing = this.app.vault.getAbstractFileByPath(outputPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, generated);
      await this.app.workspace.getLeaf(true).openFile(existing);
    } else {
      const created = await this.app.vault.create(outputPath, generated);
      await this.app.workspace.getLeaf(true).openFile(created);
    }
    new Notice(`Validated ${recipes.length} recipe(s); ${reports.length} with findings.`);
  }

  // Computes and caches per-serving macros for one recipe (frontmatter fields
  // MacroKcalPerServing/MacroProteinGPerServing/MacroCarbsGPerServing/
  // MacroFatGPerServing/MacrosLastCalculated, plus a rendered table in the
  // recipe's ### Nutrition section). Guards on the global macrosEnabled
  // setting, then the per-recipe TrackMacros frontmatter toggle. Pass
  // { silent: true } when calling from a batch loop to suppress per-file
  // Notices — findings are returned either way.
  async calculateRecipeMacros(file, { silent = false } = {}) {
    if (!this.settings.macrosEnabled) {
      if (!silent) new Notice("Enable macro tracking in settings first.");
      return null;
    }

    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    if (fm.TrackMacros !== true) {
      // Running this command IS the opt-in — flip the frontmatter for this
      // recipe automatically rather than requiring a separate manual step.
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter.TrackMacros = true;
      });
    }

    let ingredients = [];
    try {
      ingredients = await this.getRecipeIngredients(file);
    } catch (error) {
      const message = error?.message || String(error);
      if (!silent) new Notice(message);
      return { perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, findings: [{ severity: "error", type: "read", message }] };
    }

    const portions = this.getRecipePortions(file);
    await this.loadNutritionConfig();
    // Pre-warms NUTRITION_ENTRIES for anything not found locally, so the pure
    // computeRecipeMacros call below can resolve it without knowing live
    // lookup exists. If a live lookup fails, computeRecipeMacros will still
    // raise its own "no-nutrition-data" finding for that ingredient — the two
    // findings together tell the full story (not found locally, and the live
    // fallback also came up empty) rather than one being suppressed.
    const liveLookupFindings = await this.resolveMissingIngredientsViaLiveLookup(ingredients);
    const { perServing, findings } = computeRecipeMacros(ingredients, portions);
    findings.push(...liveLookupFindings);

    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter.MacroKcalPerServing = Number(perServing.kcal.toFixed(1));
      frontmatter.MacroProteinGPerServing = Number(perServing.protein.toFixed(1));
      frontmatter.MacroCarbsGPerServing = Number(perServing.carbs.toFixed(1));
      frontmatter.MacroFatGPerServing = Number(perServing.fat.toFixed(1));
      frontmatter.MacrosLastCalculated = new Date().toISOString();
    });

    try {
      const content = await this.app.vault.read(file);
      const tableMarkdown = formatMacroTableMarkdown(perServing, this.settings.energyUnit);
      const updated = replaceMarkdownSectionBody(content, "Nutrition", tableMarkdown);
      if (updated !== null && updated !== content) {
        await this.app.vault.modify(file, updated);
      }
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to render Nutrition section:", error);
    }

    if (!silent) {
      if (findings.length > 0) {
        new Notice(`Calculated macros for ${file.basename} with ${findings.length} finding(s) (see console).`);
        console.warn("[weekly-meal-shopper] Macro findings for", file.basename, findings);
      } else {
        new Notice(`Calculated macros for ${file.basename}.`);
      }
    }

    return { perServing, findings };
  }

  // Batch variant of calculateRecipeMacros: runs it (silently) over every
  // recipe with TrackMacros: true and writes an aggregate findings report,
  // mirroring validateRecipes()'s report-writing shape.
  async calculateMacrosForAllRecipes() {
    if (!this.settings.macrosEnabled) {
      new Notice("Enable macro tracking in settings first.");
      return;
    }

    const recipes = this.app.vault.getMarkdownFiles().filter((file) => {
      if (!this.isRecipeFile(file)) return false;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      return fm.TrackMacros === true;
    });

    const reports = [];
    for (const file of recipes) {
      const result = await this.calculateRecipeMacros(file, { silent: true });
      if (result && result.findings.length > 0) {
        reports.push({ name: file.basename, link: `[[${file.path}|${file.basename}]]`, findings: result.findings });
      }
    }

    const generated = buildMacroCalculationReport(reports, recipes.length);
    const outputPath = normalizePath("Utility/🥗 Macro Calculation Report.md");
    const existing = this.app.vault.getAbstractFileByPath(outputPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, generated);
      await this.app.workspace.getLeaf(true).openFile(existing);
    } else {
      const created = await this.app.vault.create(outputPath, generated);
      await this.app.workspace.getLeaf(true).openFile(created);
    }
    new Notice(`Calculated macros for ${recipes.length} recipe(s); ${reports.length} with findings.`);
  }

  getRecipePortions(file) {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter || {};
    return Math.max(1, parseNumberLike(fm.Portions ?? fm.Servings, 1));
  }

  async ensureIngredientCategoryConfigFile() {
    const configPath = normalizePath(INGREDIENT_CATEGORY_CONFIG_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;

    await this.app.vault.adapter.write(
      configPath,
      `${JSON.stringify(DEFAULT_INGREDIENT_CATEGORY_CONFIG, null, 2)}\n`
    );
  }

  async loadIngredientCategoryConfig() {
    const configPath = normalizePath(INGREDIENT_CATEGORY_CONFIG_PATH);
    await this.ensureIngredientCategoryConfigFile();
    try {
      const raw = await this.app.vault.adapter.read(configPath);
      return normalizeCategoryConfig(JSON.parse(raw));
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to parse ingredient category config:", error);
      new Notice("Ingredient category config is invalid JSON. Using built-in defaults.");
      return normalizeCategoryConfig(null);
    }
  }

  async saveIngredientCategoryConfig(config) {
    const configPath = normalizePath(INGREDIENT_CATEGORY_CONFIG_PATH);
    const normalized = normalizeCategoryConfig(config);
    await this.app.vault.adapter.write(configPath, `${JSON.stringify(normalized, null, 2)}\n`);
  }

  async ensureUnitDensityConfigFile() {
    const configPath = normalizePath(UNIT_DENSITY_CONFIG_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;
    await this.app.vault.adapter.write(
      configPath,
      `${JSON.stringify(DEFAULT_UNIT_DENSITY_CONFIG, null, 2)}\n`
    );
  }

  async loadUnitDensityConfig() {
    await this.ensureUnitDensityConfigFile();
    const configPath = normalizePath(UNIT_DENSITY_CONFIG_PATH);
    try {
      const raw = await this.app.vault.adapter.read(configPath);
      const parsed = JSON.parse(raw);
      const densities = parsed && typeof parsed === "object" ? parsed.densities : null;
      WEIGHT_DENSITY_ENTRIES = buildDensityEntries(densities);
      return densities;
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to parse unit-density config:", error);
      WEIGHT_DENSITY_ENTRIES = buildDensityEntries(WEIGHT_DENSITY_G_PER_ML);
      new Notice("Unit-density config is invalid JSON. Using built-in defaults.");
      return WEIGHT_DENSITY_G_PER_ML;
    }
  }

  async ensureNutritionConfigFile() {
    const configPath = normalizePath(NUTRITION_CONFIG_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;
    await this.app.vault.adapter.write(
      configPath,
      `${JSON.stringify(DEFAULT_NUTRITION_CONFIG, null, 2)}\n`
    );
  }

  async ensureLiveNutritionCacheFile() {
    const configPath = normalizePath(LIVE_NUTRITION_CACHE_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;
    await this.app.vault.adapter.write(configPath, `${JSON.stringify({ entries: {} }, null, 2)}\n`);
  }

  async loadLiveNutritionCacheEntries() {
    await this.ensureLiveNutritionCacheFile();
    const configPath = normalizePath(LIVE_NUTRITION_CACHE_PATH);
    try {
      const raw = await this.app.vault.adapter.read(configPath);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.entries === "object" && parsed.entries ? parsed.entries : {};
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to parse live nutrition cache:", error);
      return {};
    }
  }

  async ensureNutritionOverridesFile() {
    const configPath = normalizePath(NUTRITION_OVERRIDES_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;
    await this.app.vault.adapter.write(configPath, `${JSON.stringify({ entries: {} }, null, 2)}\n`);
  }

  async loadNutritionOverrideEntries() {
    await this.ensureNutritionOverridesFile();
    const configPath = normalizePath(NUTRITION_OVERRIDES_PATH);
    try {
      const raw = await this.app.vault.adapter.read(configPath);
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed.entries === "object" && parsed.entries ? parsed.entries : {};
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to parse nutrition overrides:", error);
      return {};
    }
  }

  // Sets (or replaces) a manual ingredient->macro match, taking priority over
  // every other source next time loadNutritionConfig runs.
  async saveNutritionOverride(name, macros) {
    const key = normalizeSearchText(name);
    if (!key) return;
    const entries = await this.loadNutritionOverrideEntries();
    entries[key] = macros;
    await this.app.vault.adapter.write(normalizePath(NUTRITION_OVERRIDES_PATH), `${JSON.stringify({ entries }, null, 2)}\n`);
  }

  async removeNutritionOverride(name) {
    const key = normalizeSearchText(name);
    const entries = await this.loadNutritionOverrideEntries();
    delete entries[key];
    await this.app.vault.adapter.write(normalizePath(NUTRITION_OVERRIDES_PATH), `${JSON.stringify({ entries }, null, 2)}\n`);
  }

  // Opens the manual-match modal for one ingredient, pre-filled with
  // whatever it currently resolves to (if anything). Resolves with the saved
  // macros, or null if cancelled.
  async openNutritionMatchModal(ingredient) {
    await this.loadNutritionConfig();
    const currentMacros = estimateIngredientMacrosPer100g(ingredient);
    return await new Promise((resolve) => {
      new NutritionMatchModal(this.app, {
        ingredient,
        currentMacros,
        entries: NUTRITION_ENTRIES,
        onSubmit: async (macros) => {
          await this.saveNutritionOverride(ingredient, macros);
          await this.loadNutritionConfig();
          new Notice(`Nutrition match saved for "${ingredient}".`);
          resolve(macros);
        },
        onCancel: () => resolve(null),
      }).open();
    });
  }

  // Always reads the downloaded USDA Foundation Foods dataset — there is no
  // user-facing choice of source anymore (previously "builtin" | "downloaded"
  // | "custom"). Falls back to the small bundled default only when nothing
  // has been downloaded yet or the downloaded file is unreadable, so
  // NUTRITION_ENTRIES is never left completely empty. Merges the live-lookup
  // cache on top (fills gaps only), then manual overrides on top of that
  // (highest priority — wins over both the downloaded set and the cache).
  async loadNutritionConfig() {
    await this.ensureNutritionConfigFile();
    let primaryConfig = null;

    const downloadedPath = normalizePath(DOWNLOADED_NUTRITION_CONFIG_PATH);
    const downloadedExists = await this.app.vault.adapter.exists(downloadedPath);
    if (downloadedExists) {
      try {
        primaryConfig = JSON.parse(await this.app.vault.adapter.read(downloadedPath));
      } catch (error) {
        console.error("[weekly-meal-shopper] Failed to parse downloaded nutrition database:", error);
        new Notice("Downloaded nutrition database is invalid JSON. Using built-in defaults.");
      }
    }

    if (!primaryConfig) {
      const configPath = normalizePath(NUTRITION_CONFIG_PATH);
      try {
        primaryConfig = JSON.parse(await this.app.vault.adapter.read(configPath));
      } catch (error) {
        console.error("[weekly-meal-shopper] Failed to parse nutrition database config:", error);
        new Notice("Nutrition database config is invalid JSON. Using built-in defaults.");
        primaryConfig = DEFAULT_NUTRITION_CONFIG;
      }
    }

    const cacheEntries = await this.loadLiveNutritionCacheEntries();
    const overrideEntries = await this.loadNutritionOverrideEntries();
    const primaryEntries = primaryConfig && typeof primaryConfig.entries === "object" ? primaryConfig.entries : {};
    NUTRITION_ENTRIES = buildNutritionEntries({ entries: { ...cacheEntries, ...primaryEntries, ...overrideEntries } });
    return primaryConfig;
  }

  // Fetches the USDA Foundation Foods bulk JSON dataset, extracts it from its
  // ZIP wrapper, and writes it to DOWNLOADED_NUTRITION_CONFIG_PATH. Desktop
  // only — ZIP decompression needs Node's zlib, unavailable on mobile.
  async downloadNutritionDataset() {
    if (Platform.isMobileApp) {
      new Notice("Downloading bulk nutrition datasets isn't available on mobile. Use live lookup or a custom database file instead.");
      return;
    }

    new Notice("Downloading USDA Foundation Foods dataset…");
    let response;
    try {
      response = await requestUrl({ url: FOUNDATION_FOODS_ZIP_URL });
    } catch (error) {
      new Notice(`Download failed: ${error?.message || error}`);
      return;
    }

    let jsonText;
    try {
      const zipBuffer = Buffer.from(response.arrayBuffer);
      jsonText = extractFirstFileFromZip(zipBuffer).toString("utf8");
    } catch (error) {
      new Notice(`Could not read the downloaded ZIP file: ${error?.message || error}`);
      return;
    }

    let config;
    try {
      config = parseUsdaBulkDatasetToNutritionConfig(JSON.parse(jsonText));
    } catch (error) {
      new Notice(`Could not parse the downloaded dataset: ${error?.message || error}`);
      return;
    }

    const entryCount = Object.keys(config.entries).length;
    if (entryCount === 0) {
      new Notice("Downloaded dataset parsed but contained no usable entries — the USDA JSON format may have changed.");
      return;
    }

    await this.app.vault.adapter.write(
      normalizePath(DOWNLOADED_NUTRITION_CONFIG_PATH),
      `${JSON.stringify(config, null, 2)}\n`
    );
    new Notice(`Downloaded nutrition dataset saved (${entryCount} ingredients).`);
  }

  // Macro tracking always uses the USDA dataset — there's no source choice
  // to make, so just make sure it's actually been downloaded. Called
  // whenever macrosEnabled turns on (settings toggle) and once at startup
  // for anyone who already had it on. No-ops quietly if already downloaded,
  // on mobile (downloadNutritionDataset handles that Notice itself), or
  // macros is off.
  async ensureDownloadedNutritionDatasetIsActive() {
    if (!this.settings.macrosEnabled) return;
    if (Platform.isMobileApp) return;

    const downloadedPath = normalizePath(DOWNLOADED_NUTRITION_CONFIG_PATH);
    const alreadyDownloaded = await this.app.vault.adapter.exists(downloadedPath);
    if (!alreadyDownloaded) {
      await this.downloadNutritionDataset();
    }
  }

  // Dispatches to whichever provider settings.nutritionLiveLookupProvider
  // selects. Returns null on any failure — see the individual provider
  // functions for their own null-on-failure contract.
  async lookupIngredientMacrosLive(name) {
    const provider = normalizeNutritionLiveLookupProvider(this.settings.nutritionLiveLookupProvider);
    if (provider === "openfoodfacts") return lookupIngredientMacrosFromOpenFoodFacts(name);
    return lookupIngredientMacrosFromUsda(name, this.settings.usdaApiKey);
  }

  // Persists one live-lookup result to nutrition-live-cache.json AND merges
  // it into the in-memory NUTRITION_ENTRIES immediately, so the rest of the
  // current calculation (and every one after, without a repeat network call)
  // can resolve it via the normal estimateIngredientMacrosPer100g path.
  async cacheLiveNutritionEntry(name, macros) {
    const key = normalizeSearchText(name);
    if (!key) return;

    const cacheEntries = await this.loadLiveNutritionCacheEntries();
    cacheEntries[key] = macros;
    await this.app.vault.adapter.write(
      normalizePath(LIVE_NUTRITION_CACHE_PATH),
      `${JSON.stringify({ entries: cacheEntries }, null, 2)}\n`
    );

    // Re-sort so the newly added (possibly longer/more specific) pattern is
    // checked at the right point relative to existing entries.
    NUTRITION_ENTRIES = [...NUTRITION_ENTRIES, [key, macros]]
      .sort((a, b) => b[0].length - a[0].length);
  }

  // For every ingredient not already resolvable from the active local
  // dataset, tries a live lookup (if enabled) and caches the result. Returns
  // findings for lookups that came up empty — never throws, so one bad
  // ingredient never aborts the rest of the recipe's macro calculation.
  async resolveMissingIngredientsViaLiveLookup(ingredients) {
    if (!this.settings.nutritionLiveLookupEnabled) return [];

    const findings = [];
    const items = Array.isArray(ingredients) ? ingredients : [];
    for (const item of items) {
      if (item?.quantityUnknown) continue;
      if (estimateIngredientMacrosPer100g(item.name)) continue;

      let macros = null;
      try {
        macros = await this.lookupIngredientMacrosLive(item.name);
      } catch (error) {
        console.error("[weekly-meal-shopper] Live nutrition lookup failed:", error);
      }

      if (macros) {
        await this.cacheLiveNutritionEntry(item.name, macros);
      } else {
        findings.push({
          severity: "warning",
          type: "live-lookup-failed",
          message: `Live lookup found no match for "${item.name}".`,
        });
      }
    }
    return findings;
  }

  async ensureUnitAliasConfigFile() {
    const configPath = normalizePath(UNIT_ALIAS_CONFIG_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;
    await this.app.vault.adapter.write(
      configPath,
      `${JSON.stringify(DEFAULT_UNIT_ALIAS_CONFIG, null, 2)}\n`
    );
  }

  // Opens the unit-aliases.json config for editing. It lives under
  // .obsidian/plugins/ (outside the indexed vault), so prefer Obsidian's
  // default-app / reveal-in-folder helpers and fall back to showing the path.
  async revealUnitAliasConfigFile() {
    await this.ensureUnitAliasConfigFile();
    const configPath = normalizePath(UNIT_ALIAS_CONFIG_PATH);
    try {
      if (typeof this.app.openWithDefaultApp === "function") {
        await this.app.openWithDefaultApp(configPath);
        return;
      }
      if (typeof this.app.showInFolder === "function") {
        await this.app.showInFolder(configPath);
        return;
      }
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to open unit alias config:", error);
    }
    new Notice(`Edit unit aliases at: ${configPath}`);
  }

  async loadUnitAliasConfig() {
    await this.ensureUnitAliasConfigFile();
    const configPath = normalizePath(UNIT_ALIAS_CONFIG_PATH);
    try {
      const raw = await this.app.vault.adapter.read(configPath);
      const parsed = JSON.parse(raw);
      ACTIVE_EXTRA_UNIT_ALIASES = normalizeUnitAliasConfig(parsed);
      setActiveMeasurementProfile(this.settings);
      return ACTIVE_EXTRA_UNIT_ALIASES;
    } catch (error) {
      console.error("[weekly-meal-shopper] Failed to parse unit-alias config:", error);
      ACTIVE_EXTRA_UNIT_ALIASES = normalizeUnitAliasConfig(DEFAULT_UNIT_ALIAS_CONFIG);
      setActiveMeasurementProfile(this.settings);
      new Notice("Unit alias config is invalid JSON. Using built-in defaults.");
      return ACTIVE_EXTRA_UNIT_ALIASES;
    }
  }

  async generateWeeklyShoppingList({ applyFrozenInventory = false } = {}) {
    const active = this.app.workspace.getActiveFile();
    let canvasFiles = [];

    if (active && active.extension === "canvas") {
      canvasFiles = [active];
    } else {
      const configured1 = normalizePath(this.settings.weeklyCanvasPath);
      const found1 = this.app.vault.getAbstractFileByPath(configured1);
      if (found1 instanceof TFile && found1.extension === "canvas") canvasFiles.push(found1);

      const path2 = String(this.settings.weeklyCanvasPath2 || "").trim();
      if (path2) {
        const configured2 = normalizePath(path2);
        const found2 = this.app.vault.getAbstractFileByPath(configured2);
        if (found2 instanceof TFile && found2.extension === "canvas") {
          canvasFiles.push(found2);
        } else {
          new Notice(`Second meal plan canvas not found: ${path2}`);
        }
      }
    }

    if (canvasFiles.length === 0) {
      new Notice("Meal plan canvas not found. Set it in plugin settings or open a canvas first.");
      return;
    }

    const taggedEntries = [];
    for (const canvasFile of canvasFiles) {
      const canvasText = await this.app.vault.read(canvasFile);
      const entries = parseCanvasRecipeEntries(canvasText);
      for (const entry of entries) taggedEntries.push({ ...entry, sourceCanvas: canvasFile });
    }

    if (taggedEntries.length === 0) {
      new Notice("No recipe files found on the selected canvas(es).");
      return;
    }

    const recipes = new Map();
    for (const entry of taggedEntries) {
      const rawPath = entry.rawPath;
      let file = this.app.vault.getAbstractFileByPath(normalizePath(rawPath));
      if (!(file instanceof TFile)) {
        const linkDest = this.app.metadataCache.getFirstLinkpathDest(rawPath, entry.sourceCanvas.path);
        if (linkDest) file = linkDest;
      }
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      if (!this.isRecipeFile(file)) continue;
      let existing = recipes.get(file.path);
      if (!existing) {
        existing = {
          file,
          defaultCount: 0,
          projectCount: 0,
          hostingCount: 0,
          // Card count contributed by each source canvas, used to split the
          // ingredient list per canvas when splitShoppingListByCanvas is on.
          cardsByCanvas: new Map(),
        };
        recipes.set(file.path, existing);
      }
      if (entry.section === "project") existing.projectCount += 1;
      else if (entry.section === "hosting") existing.hostingCount += 1;
      else existing.defaultCount += 1;
      const canvasPath = entry.sourceCanvas?.path || "";
      existing.cardsByCanvas.set(canvasPath, (existing.cardsByCanvas.get(canvasPath) || 0) + 1);
    }

    if (recipes.size === 0) {
      new Notice("No recipe markdown notes detected on the canvas.");
      return;
    }

    const projectServingsTargets = new Map();
    let hostingPeopleNeeded = 0;
    const hasHostingRecipes = [...recipes.values()].some((r) => r.hostingCount > 0);

    if (hasHostingRecipes) {
      const result = await this.promptPositiveNumber("Hosting: how many people are you hosting for?", 6);
      if (result.cancelled) return;
      if (result.error) {
        new Notice(result.error);
        return;
      }
      hostingPeopleNeeded = result.value;
    }

    for (const { file, projectCount } of recipes.values()) {
      const recipePortions = this.getRecipePortions(file);

      if (projectCount > 0) {
        const defaultProjectServings = recipePortions * projectCount;
        const prompt = [
          `Projects: total servings needed for "${file.basename}"?`,
          `(recipe makes ${formatMetricAmount(recipePortions)} serving(s) per batch`,
          projectCount > 1 ? `, ${projectCount} project card(s)` : "",
          ")",
        ].join("");
        const result = await this.promptPositiveNumber(prompt, defaultProjectServings);
        if (result.error) {
          new Notice(result.error);
          return;
        }
        // If cancelled, fall back to the default rather than aborting the whole list
        projectServingsTargets.set(file.path, result.cancelled ? defaultProjectServings : result.value);
      }

    }

    const totals = new Map();
    const categoryConfig = await this.loadIngredientCategoryConfig();
    const exactExclusions = parseExcludedIngredients(this.settings.excludedIngredientsExact);
    const ingredientOverrides = parseIngredientOverrides(this.settings.ingredientOverrides);
    const recipePlanLines = [];
    const frozenProjectionLines = [];
    const projectScaleLines = [];
    const hostingScaleLines = [];

    // Per-canvas aggregation only matters when splitting and there is more than
    // one canvas in play. Each canvas gets its own totals map; a recipe's batches
    // are attributed to a canvas in proportion to how many of its cards live there.
    const splitByCanvas = this.settings.splitShoppingListByCanvas === true && canvasFiles.length > 1;
    const totalsByCanvas = new Map();

    // Adds one parsed ingredient * batches into a totals map under the shared
    // aggregation key, preserving category-locking and recipe attribution.
    const accumulateContribution = (targetTotals, item, displayName, classified, categoryLocked, batches, filePath) => {
      if (!(batches > 0)) return;
      const category = classified.category;
      const aggName = normalizedAggregationName(displayName) || item.canonicalName;
      const key = `${aggName}::${item.unitMetric}::${item.quantityUnknown ? "unknown" : "known"}`;
      const existing = targetTotals.get(key) || {
        name: displayName,
        unit: item.unitMetric,
        amount: 0,
        quantityUnknown: false,
        recipes: new Set(),
        category,
        categoryLocked,
        categoryReason: classified.reason,
      };
      existing.amount += item.amountMetric * batches;
      existing.quantityUnknown = existing.quantityUnknown || !!item.quantityUnknown;
      existing.recipes.add(filePath);
      if (!existing.categoryReason && classified.reason) existing.categoryReason = classified.reason;
      if (categoryLocked) {
        existing.category = category;
        existing.categoryLocked = true;
        existing.categoryReason = "manual override";
      } else if ((!existing.category || existing.category === "Other") && category !== "Other") {
        existing.category = category;
        existing.categoryReason = classified.reason;
      }
      targetTotals.set(key, existing);
    };

    for (const { file, defaultCount, projectCount, hostingCount, cardsByCanvas } of recipes.values()) {
      const profile = this.getRecipePlanningProfile(file, defaultCount);
      let ingredients = [];
      try {
        ingredients = await this.getRecipeIngredients(file);
      } catch (error) {
        new Notice(error?.message || String(error));
        return;
      }
      const recipePortions = this.getRecipePortions(file);

      const projectPortionsTotal = projectCount > 0 ? (projectServingsTargets.get(file.path) || 0) : 0;
      const hostingPortionsTotal = hostingCount > 0 ? hostingPeopleNeeded * hostingCount : 0;
      const projectBatches = projectPortionsTotal > 0 ? Math.ceil(projectPortionsTotal / recipePortions) : 0;
      const hostingBatches = hostingPortionsTotal > 0 ? Math.ceil(hostingPortionsTotal / recipePortions) : 0;
      const totalBatches = profile.cooksNeeded + projectBatches + hostingBatches;

      recipePlanLines.push(
        `- [[${file.path}|${file.basename}]] weekly x${defaultCount} (planned ${profile.plannedPortions} portions, frozen used ${profile.frozenUsed}, cook batches ${profile.cooksNeeded})`
      );
      if (projectCount > 0) {
        projectScaleLines.push(
          `- [[${file.path}|${file.basename}]] project cards ${projectCount}: ${formatMetricAmount(projectPortionsTotal)} servings requested => ${projectBatches} batch(es) (recipe makes ${formatMetricAmount(recipePortions)} per batch)`
        );
      }
      if (hostingCount > 0) {
        hostingScaleLines.push(
          `- [[${file.path}|${file.basename}]] hosting cards ${hostingCount}: ${formatMetricAmount(hostingPortionsTotal)} servings requested => ${hostingBatches} batch(es) (recipe makes ${formatMetricAmount(recipePortions)} per batch)`
        );
      }
      frozenProjectionLines.push(
        `- [[${file.path}|${file.basename}]]: frozen ${profile.frozenAvailable} -> projected ${profile.projectedFrozen} portions`
      );

      if (applyFrozenInventory) {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          frontmatter.FrozenPortionsAvailable = Number(profile.projectedFrozen.toFixed(2));
          frontmatter.LastFrozenInventoryUpdate = new Date().toISOString();
        });
      }

      if (totalBatches === 0) continue;

      // Work out each canvas's share of this recipe's batches. A recipe that
      // only appears on one canvas attributes all of its batches there (exact);
      // one spanning both splits proportionally to its card counts.
      const canvasShares = [];
      if (splitByCanvas && cardsByCanvas instanceof Map && cardsByCanvas.size > 0) {
        let totalCards = 0;
        for (const count of cardsByCanvas.values()) totalCards += count;
        if (totalCards > 0) {
          for (const [canvasPath, count] of cardsByCanvas) {
            let canvasTotals = totalsByCanvas.get(canvasPath);
            if (!canvasTotals) {
              canvasTotals = new Map();
              totalsByCanvas.set(canvasPath, canvasTotals);
            }
            canvasShares.push({ totals: canvasTotals, batches: totalBatches * (count / totalCards) });
          }
        }
      }

      for (const item of ingredients) {
        const displayName = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
        if (shouldExcludeIngredientExact(displayName, exactExclusions)) continue;
        const override = ingredientOverrides.get(displayName);
        const overrideCategory = String(override?.category || "").trim();
        const categoryLocked = !!overrideCategory;
        const classified = overrideCategory
          ? { category: overrideCategory, reason: "manual override" }
          : classifyIngredientCategoryWithReason(displayName, categoryConfig);

        accumulateContribution(totals, item, displayName, classified, categoryLocked, totalBatches, file.path);
        for (const share of canvasShares) {
          accumulateContribution(share.totals, item, displayName, classified, categoryLocked, share.batches, file.path);
        }
      }
    }

    const checklistOptions = {
      categoryConfig,
      ingredientOverrides,
      includeRecipeUsage: this.settings.showRecipeUsageInShoppingList !== false,
      includeOverrideLinks: this.settings.includeOverrideLinksInShoppingList === true,
      legumeMode: this.settings.legumeShoppingMode === "dried" ? "dried" : "canned",
      legumeFactors: resolveLegumeFactors(this.settings),
    };
    const emptyChecklistText = "- [ ] (No ingredients needed (covered by frozen leftovers))";

    // Combined list is always produced (used directly when not splitting, and
    // for the summary count either way).
    const combinedChecklistLines = buildGroupedShoppingChecklistLines(totals, checklistOptions);

    let shoppingChecklistBlock;
    if (splitByCanvas) {
      const sectionBlocks = [];
      for (const canvasFile of canvasFiles) {
        const canvasTotals = totalsByCanvas.get(canvasFile.path) || new Map();
        const lines = buildGroupedShoppingChecklistLines(canvasTotals, checklistOptions);
        sectionBlocks.push(`### ${canvasFile.basename}`);
        sectionBlocks.push(lines.join("\n") || emptyChecklistText);
        sectionBlocks.push("");
      }
      shoppingChecklistBlock = sectionBlocks.join("\n").replace(/\n+$/, "");
    } else {
      shoppingChecklistBlock = combinedChecklistLines.join("\n") || emptyChecklistText;
    }

    const aggregatedItemCount = combinedChecklistLines.filter((line) => /^\s*-\s\[ \]/.test(line)).length;

    const generated = [
      "# Weekly Shopping List",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Canvas: ${canvasFiles.map((f) => `[[${f.path}|${f.basename}]]`).join(", ")}`,
      "",
      "## Planned Recipes",
      recipePlanLines.join("\n"),
      "",
      "## Frozen Portion Projection",
      frozenProjectionLines.join("\n"),
      "",
      "## Project Scaling",
      projectScaleLines.join("\n") || "- None",
      "",
      "## Hosting Scaling",
      hostingScaleLines.join("\n") || "- None",
      "",
      "## Shopping Checklist",
      shoppingChecklistBlock,
      "",
    ].join("\n");

    const outputPath = normalizePath(this.settings.shoppingListOutputPath);
    const existing = this.app.vault.getAbstractFileByPath(outputPath);

    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, generated);
      await this.app.workspace.getLeaf(true).openFile(existing);
    } else {
      const file = await this.app.vault.create(outputPath, generated);
      await this.app.workspace.getLeaf(true).openFile(file);
    }

    if (applyFrozenInventory) {
      new Notice(`Shopping list created and frozen leftovers updated for ${recipes.size} recipes.`);
      return;
    }

    new Notice(`Shopping list created with ${aggregatedItemCount} aggregated ingredients.`);
  }
}

class WeeklyMealShopperSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  buildFoldableSection(containerEl, { title, description, searchPlaceholder }) {
    const section = containerEl.createDiv({ cls: "weekly-meal-shopper-list-section weekly-meal-shopper-foldable is-collapsed" });
    const header = section.createDiv({
      cls: "weekly-meal-shopper-foldable-toggle weekly-meal-shopper-heading is-collapsed",
    });
    header.tabIndex = 0;
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", "false");

    const titleRow = header.createDiv({ cls: "weekly-meal-shopper-heading-title-row" });
    titleRow.createSpan({ cls: "weekly-meal-shopper-collapse-indicator", text: "▶" });
    titleRow.createSpan({ cls: "weekly-meal-shopper-heading-title", text: title });

    const body = section.createDiv({ cls: "weekly-meal-shopper-foldable-body" });
    body.style.display = "none";

    let searchWrap = null;
    let searchInput = null;
    if (searchPlaceholder) {
      searchWrap = body.createDiv({ cls: "weekly-meal-shopper-section-search" });
      searchInput = searchWrap.createEl("input", {
        type: "search",
        placeholder: searchPlaceholder || "Search",
      });
      searchInput.addClass("weekly-meal-shopper-search-input");
      searchWrap.style.display = "none";
    }

    const setCollapsed = (collapsed) => {
      section.classList.toggle("is-collapsed", collapsed);
      header.classList.toggle("is-collapsed", collapsed);
      body.style.display = collapsed ? "none" : "";
      if (searchWrap) searchWrap.style.display = collapsed ? "none" : "";
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };

    header.addEventListener("click", () => {
      setCollapsed(body.style.display !== "none");
    });
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setCollapsed(body.style.display !== "none");
      }
    });

    return { section, body, searchInput };
  }

  renderCategoryHeading(containerEl, { title, description = "" }) {
    containerEl.createEl("h3", { text: title });
  }

  // A lighter-weight grouping label for use INSIDE a foldable section's body
  // (e.g. "Live lookup fallback" within the Nutrition & Macros foldable).
  // Deliberately NOT an <h3> — renderCategoryHeading's h3 is reserved for
  // top-level page sections, and reusing it in a nested context makes an
  // inner grouping visually indistinguishable from the next real top-level
  // section that follows once the foldable closes.
  renderSubHeading(containerEl, { title, description = "" }) {
    const wrap = containerEl.createDiv({ cls: "weekly-meal-shopper-subheading" });
    wrap.createDiv({ cls: "weekly-meal-shopper-subheading-title", text: title });
    if (description) wrap.createDiv({ cls: "weekly-meal-shopper-subheading-desc", text: description });
  }

  async display() {
    const { containerEl } = this;
    containerEl.empty();
    const categoryConfig = await this.plugin.loadIngredientCategoryConfig();
    const categories = getSelectableIngredientCategories(categoryConfig);

    containerEl.createEl("h2", {
      text: "Weekly Meal Shopper",
      cls: "weekly-meal-shopper-settings-title",
    });

    this.renderCategoryHeading(containerEl, {
      title: "Meal Prep",
      description: "Weekly canvas creation, naming, and shopping-list output live here.",
    });

    const { body: mealPrepBody } = this.buildFoldableSection(containerEl, {
      stateKey: "mealPrepSetupCollapsed",
      title: "Meal-prep setup",
      description: "Shopping-list output behavior and quick override controls.",
    });

    new Setting(mealPrepBody)
      .setName("Household size")
      .setDesc("How many portions a single planned meal instance needs to feed, by default. Drives weekly batch-scaling and the canvas coverage overlay — e.g. a family of 4 needs 4 portions per planned dinner. Override per-recipe with a PortionsPerMeal frontmatter field on recipes that need more or less (e.g. a side dish).")
      .addText((text) =>
        text
          .setPlaceholder("1")
          .setValue(String(positiveNumberOr(this.plugin.settings.householdSize, 1)))
          .onChange(async (value) => {
            this.plugin.settings.householdSize = positiveNumberOr(value, this.plugin.settings.householdSize);
            await this.plugin.saveSettings();
          })
      );

    new Setting(mealPrepBody)
      .setName("Meal Coverage canvas overlay")
      .setDesc("Shows a live coverage panel directly on the meal-plan canvas (portions vs. household size, cook-again warnings) and colors recipe cards green/yellow/red to match.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mealCoverageEnabled !== false)
          .onChange(async (value) => {
            this.plugin.settings.mealCoverageEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.handleActiveLeafChangeForCoverage(this.app.workspace.activeLeaf);
          })
      );

    new Setting(mealPrepBody)
      .setName("Show recipe usage in shopping list")
      .setDesc("Adds an indented recipe-link line under each generated shopping item.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRecipeUsageInShoppingList !== false)
          .onChange(async (value) => {
            this.plugin.settings.showRecipeUsageInShoppingList = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(mealPrepBody)
      .setName("Add one-click override links")
      .setDesc("Adds an Override link on each shopping item so preview and reading view can save ingredient overrides directly.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.includeOverrideLinksInShoppingList !== false)
          .onChange(async (value) => {
            this.plugin.settings.includeOverrideLinksInShoppingList = value;
            await this.plugin.saveSettings();
          })
      );

    this.renderCategoryHeading(containerEl, {
      title: "Recipes",
      description: "Recipe note creation, metadata, formatting, and transcription settings are grouped here.",
    });

    const { body: recipeSetupBody } = this.buildFoldableSection(containerEl, {
      stateKey: "recipeSetupCollapsed",
      title: "Recipe setup",
      description: "Recipe note output paths and metadata fields used by the recipe commands.",
    });

    new Setting(recipeSetupBody)
      .setName("Recipe folder")
      .setDesc("Used for recipe creation, transcription output, and batch standardization.")
      .addText((text) =>
        text
          .setPlaceholder("pages/Food and Drink/Recipes")
          .setValue(this.plugin.settings.recipeFolder)
          .onChange(async (value) => {
            this.plugin.settings.recipeFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(recipeSetupBody)
      .setName("Parsed ingredient metadata field")
      .setDesc("Frontmatter field that stores standardized amount + unit per ingredient.")
      .addText((text) =>
        text
          .setPlaceholder("IngredientsParsed")
          .setValue(this.plugin.settings.parsedIngredientsField)
          .onChange(async (value) => {
            this.plugin.settings.parsedIngredientsField = value.trim() || "IngredientsParsed";
            await this.plugin.saveSettings();
          })
      );

    const { body: recipeCardBody } = this.buildFoldableSection(containerEl, {
      stateKey: "recipeCardCollapsed",
      title: "Recipe card view",
      description: "Settings for the planning modal — two-column layout, fractions, component recipes.",
    });

    new Setting(recipeCardBody)
      .setName("Side column regex")
      .setDesc("Headings matching this pattern go to the ingredients/side column.")
      .addText((text) =>
        text
          .setPlaceholder("Ingredients|Nutrition")
          .setValue(this.plugin.settings.recipeCardSideColumnRegex)
          .onChange(async (value) => {
            this.plugin.settings.recipeCardSideColumnRegex = value.trim() || DEFAULT_SETTINGS.recipeCardSideColumnRegex;
            await this.plugin.saveSettings();
          })
      );

    new Setting(recipeCardBody)
      .setName("Treat H1 as card title")
      .setDesc("Use the first H1 heading as the card title and omit it from the content.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.recipeCardTreatH1AsFilename).onChange(async (value) => {
          this.plugin.settings.recipeCardTreatH1AsFilename = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(recipeCardBody)
      .setName("Render unicode fractions")
      .setDesc("Replace 1/2, 1/4 etc. with ½, ¼ in the card view.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.recipeCardRenderUnicodeFractions).onChange(async (value) => {
          this.plugin.settings.recipeCardRenderUnicodeFractions = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(recipeCardBody)
      .setName("Single-column breakpoint (px)")
      .setDesc("Below this width the card stacks into one column.")
      .addSlider((slider) =>
        slider
          .setLimits(300, 1400, 10)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.recipeCardSingleColumnMaxWidth)
          .onChange(async (value) => {
            this.plugin.settings.recipeCardSingleColumnMaxWidth = value;
            await this.plugin.saveSettings();
          })
      );

    const { body: ingredientFormatBody } = this.buildFoldableSection(containerEl, {
      stateKey: "ingredientFormatCollapsed",
      title: "Ingredient format + units",
      description: "Measurement presets and ingredient-line formatting used during normalization.",
    });

    new Setting(ingredientFormatBody)
      .setName("Measurement preference")
      .setDesc("Default preferred output style when conversion is applicable.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("weight", "Weight-first (g where appropriate)")
          .addOption("volume", "Volume-first")
          .addOption("both", "Both (original plus converted weight)")
          .setValue(this.plugin.settings.measurementPreference || "weight")
          .onChange(async (value) => {
            this.plugin.settings.measurementPreference = normalizeMeasurementPreference(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(ingredientFormatBody)
      .setName("Measurement preset")
      .setDesc("Choose your standard cup/tablespoon/teaspoon volumes.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("vault_standard", "Vault standard (cup 250 mL, tbsp 15 mL, tsp 5 mL)")
          .addOption("australian", "Australian (cup 250 mL, tbsp 20 mL, tsp 5 mL)")
          .addOption("us_customary", "US customary (cup 236.59 mL, tbsp 14.79 mL, tsp 4.93 mL)")
          .addOption("custom", "Custom values")
          .setValue(this.plugin.settings.measurementPreset || "vault_standard")
          .onChange(async (value) => {
            this.plugin.settings.measurementPreset = value;
            const preset = MEASUREMENT_PRESETS[value];
            if (preset) {
              this.plugin.settings.cupMl = preset.cupMl;
              this.plugin.settings.tbspMl = preset.tbspMl;
              this.plugin.settings.tspMl = preset.tspMl;
            }
            await this.plugin.saveSettings();
            await this.display();
          })
      );

    if (this.plugin.settings.measurementPreset === "custom") {
      new Setting(ingredientFormatBody)
        .setName("Cup volume (mL)")
        .setDesc("Used when parsing and normalizing ingredients.")
        .addText((text) =>
          text
            .setPlaceholder("250")
            .setValue(String(this.plugin.settings.cupMl ?? 250))
            .onChange(async (value) => {
              const n = Number(value);
              this.plugin.settings.cupMl = Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : this.plugin.settings.cupMl;
              this.plugin.settings.measurementPreset = "custom";
              await this.plugin.saveSettings();
            })
        );

      new Setting(ingredientFormatBody)
        .setName("Tablespoon volume (mL)")
        .setDesc("Used when parsing and normalizing ingredients.")
        .addText((text) =>
          text
            .setPlaceholder("15")
            .setValue(String(this.plugin.settings.tbspMl ?? 15))
            .onChange(async (value) => {
              const n = Number(value);
              this.plugin.settings.tbspMl = Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : this.plugin.settings.tbspMl;
              this.plugin.settings.measurementPreset = "custom";
              await this.plugin.saveSettings();
            })
        );

      new Setting(ingredientFormatBody)
        .setName("Teaspoon volume (mL)")
        .setDesc("Used when parsing and normalizing ingredients.")
        .addText((text) =>
          text
            .setPlaceholder("5")
            .setValue(String(this.plugin.settings.tspMl ?? 5))
            .onChange(async (value) => {
              const n = Number(value);
              this.plugin.settings.tspMl = Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : this.plugin.settings.tspMl;
              this.plugin.settings.measurementPreset = "custom";
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(ingredientFormatBody)
      .setName("Convert liquid cup/tbsp/tsp to grams")
      .setDesc("For liquid-style ingredients, prefer whole-gram weight output instead of volume spoon/cup measures.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.convertLiquidVolumeMeasuresToWeight !== false)
          .onChange(async (value) => {
            this.plugin.settings.convertLiquidVolumeMeasuresToWeight = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(ingredientFormatBody)
      .setName("Ingredient storage separator")
      .setDesc("Stored recipe ingredients use fixed slots: Amount, Unit, Ingredient, Preparation.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption(";", ";")
          .addOption(",", ",")
          .addOption(":", ":")
          .addOption("|", "|")
          .setValue(this.plugin.settings.ingredientStorageSeparator || ";")
          .onChange(async (value) => {
            this.plugin.settings.ingredientStorageSeparator = normalizeIngredientStorageSeparator(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(ingredientFormatBody)
      .setName("Recipe view ingredient display template")
      .setDesc("Placeholders: {{Amount}} {{Unit}} {{Ingredient}} {{Preparation}} {{PreparationSuffix}}")
      .addText((text) =>
        text
          .setPlaceholder("{{Amount}} {{Unit}} {{Ingredient}}{{PreparationSuffix}}")
          .setValue(
            this.plugin.settings.recipeViewIngredientDisplayTemplate
            || "{{Amount}} {{Unit}} {{Ingredient}}{{PreparationSuffix}}"
          )
          .onChange(async (value) => {
            this.plugin.settings.recipeViewIngredientDisplayTemplate =
              normalizeRecipeViewIngredientDisplayTemplate(value);
            await this.plugin.saveSettings();
          })
      );

    const { body: transcriptionBody } = this.buildFoldableSection(containerEl, {
      stateKey: "recipeTranscriptionCollapsed",
      title: "Recipe transcription",
      description: "Image-folder transcription, OpenAI settings, and output controls for imported recipes.",
    });

    new Setting(transcriptionBody)
      .setName("Transcribe recipes from image folder")
      .setDesc("Vault folder scanned by the 'Transcribe recipes from image folder' command.")
      .addText((text) =>
        text
          .setPlaceholder("Utility/Recipe Image Inbox")
          .setValue(this.plugin.settings.transcriptionImageFolder || "Utility/Recipe Image Inbox")
          .onChange(async (value) => {
            this.plugin.settings.transcriptionImageFolder = value.trim() || "Utility/Recipe Image Inbox";
            await this.plugin.saveSettings();
          })
      );

    new Setting(transcriptionBody)
      .setName("Delete transcribed source images")
      .setDesc("After a recipe is created successfully, move the source image to Obsidian trash.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteTranscribedImages !== false)
          .onChange(async (value) => {
            this.plugin.settings.deleteTranscribedImages = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(transcriptionBody)
      .setName("API transcription unit mode")
      .setDesc("For API-created recipes, convert ingredient amounts to metric units.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("metric", "Metric (mL / g / unit)")
          .addOption("source", "Keep source units")
          .setValue(this.plugin.settings.transcriptionMetricOutput === false ? "source" : "metric")
          .onChange(async (value) => {
            this.plugin.settings.transcriptionMetricOutput = value !== "source";
            await this.plugin.saveSettings();
          })
      );

    const storedApiKeyWrap = transcriptionBody.createDiv({ cls: "weekly-meal-shopper-inline-reveal" });
    new Setting(storedApiKeyWrap)
      .setName("Use stored API key")
      .setDesc("Toggle this on if you want transcription to use an API key saved in plugin settings instead of relying only on OPENAI_API_KEY.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useStoredTranscriptionApiKey === true)
          .onChange(async (value) => {
            this.plugin.settings.useStoredTranscriptionApiKey = value;
            apiKeyBody.style.display = value ? "" : "none";
            await this.plugin.saveSettings();
          })
      );

    const apiKeyBody = storedApiKeyWrap.createDiv({ cls: "weekly-meal-shopper-inline-reveal-body" });
    apiKeyBody.style.display = this.plugin.settings.useStoredTranscriptionApiKey === true ? "" : "none";

    new Setting(apiKeyBody)
      .setName("Stored OpenAI API key")
      .setDesc("Used for image and URL recipe transcription when the toggle above is on.")
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.transcriptionApiKey || "")
          .onChange(async (value) => {
            this.plugin.settings.transcriptionApiKey = String(value || "").trim();
            await this.plugin.saveSettings();
          });
        text.inputEl.type = "password";
      });

    new Setting(transcriptionBody)
      .setName("Transcription model")
      .setDesc("OpenAI model used for recipe transcription.")
      .addText((text) =>
        text
          .setPlaceholder("gpt-4.1-mini")
          .setValue(this.plugin.settings.transcriptionModel || "gpt-4.1-mini")
          .onChange(async (value) => {
            this.plugin.settings.transcriptionModel = String(value || "").trim() || "gpt-4.1-mini";
            await this.plugin.saveSettings();
          })
      );

    new Setting(transcriptionBody)
      .setName("Transcribe recipe images now")
      .setDesc("Process all image files in the configured folder and create recipe notes.")
      .addButton((btn) =>
        btn.setButtonText("Transcribe Folder Images").setCta().onClick(async () => {
          await this.plugin.transcribeRecipesFromImageFolder();
        })
      );

    this.renderCategoryHeading(containerEl, {
      title: "Ingredient Rules",
      description: "Classification categories, exclusions, and overrides are grouped here.",
    });

    this.renderShoppingCategoriesSection(containerEl, categoryConfig);
    this.renderExcludedIngredientsSection(containerEl, categories);
    this.renderIngredientOverridesSection(containerEl, categories, categoryConfig.defaultCategory);
    this.renderUnitAliasesSection(containerEl);
    this.renderLegumeSettingsSection(containerEl);

    this.renderCategoryHeading(containerEl, {
      title: "Nutrition",
      description: "Macro tracking (protein/carbs/fat/kcal).",
    });

    const nutritionOverrideEntries = await this.plugin.loadNutritionOverrideEntries();
    this.renderNutritionSettingsSection(containerEl, nutritionOverrideEntries);

    this.renderCategoryHeading(containerEl, {
      title: "First-Time Setup",
      description: "Use this once to choose where the editable template copies should live in your vault, then open those files whenever you want to customize them.",
    });

    const { body: firstTimeSetupBody } = this.buildFoldableSection(containerEl, {
      stateKey: "firstTimeSetupCollapsed",
      title: "First-Time Setup",
      description: "The setup popup saves both vault locations and populates both editable templates from the bundled plugin base.",
    });

    new Setting(firstTimeSetupBody)
      .setName("Meal plan canvas (primary)")
      .setDesc("The persistent canvas used for recipe planning. Reuse this each week — edit it in place rather than creating a new one.")
      .addText((text) =>
        text
          .setPlaceholder("Utility/⛑️ Weekly Meal Plan.canvas")
          .setValue(this.plugin.settings.weeklyCanvasPath)
          .onChange(async (value) => {
            this.plugin.settings.weeklyCanvasPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Meal plan canvas (second prep session)")
      .setDesc("Optional. Set a second canvas if you meal prep twice a week. The shopping list will aggregate ingredients from both canvases. Leave blank to use a single canvas.")
      .addText((text) =>
        text
          .setPlaceholder("Utility/⛑️ Weekly Meal Plan 2.canvas")
          .setValue(this.plugin.settings.weeklyCanvasPath2 || "")
          .onChange(async (value) => {
            this.plugin.settings.weeklyCanvasPath2 = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Split shopping list by canvas")
      .setDesc("When using two canvases, output a separate shopping checklist for each canvas (one per prep session) instead of a single merged list. Has no effect with a single canvas.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.splitShoppingListByCanvas === true)
          .onChange(async (value) => {
            this.plugin.settings.splitShoppingListByCanvas = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Frozen staleness warning (days)")
      .setDesc("In 'Manage frozen portions', flag any recipe whose frozen portions were last updated more than this many days ago. Set to 0 to disable.")
      .addText((text) =>
        text
          .setPlaceholder("90")
          .setValue(String(parseNumberLike(this.plugin.settings.frozenStaleWarningDays, 90)))
          .onChange(async (value) => {
            const parsed = parseNumberLike(value, 90);
            this.plugin.settings.frozenStaleWarningDays = Math.max(0, parsed);
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Meal-prep canvas folder")
      .setDesc("Target folder used by the 'Create weekly meal-prep canvas' command.")
      .addText((text) =>
        text
          .setPlaceholder("Utility")
          .setValue(this.plugin.settings.mealPrepCanvasFolder || "Utility")
          .onChange(async (value) => {
            this.plugin.settings.mealPrepCanvasFolder = value.trim() || "Utility";
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Meal-prep canvas name template")
      .setDesc("Use {{week}}, {{year}}, {{weekPadded}}, or {{date}}. Example: ⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas")
      .addText((text) =>
        text
          .setPlaceholder("⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas")
          .setValue(this.plugin.settings.mealPrepCanvasNameTemplate || DEFAULT_SETTINGS.mealPrepCanvasNameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.mealPrepCanvasNameTemplate = value.trim() || DEFAULT_SETTINGS.mealPrepCanvasNameTemplate;
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Week starts on")
      .setDesc("Which day sits at the left edge of a newly created meal-plan canvas, and the reference point for Meal Coverage's chronological sorting and 'cook again before' callouts. Only affects canvases created after changing this — existing canvases are left as-is.")
      .addDropdown((dropdown) => {
        for (const day of WEEKDAY_NAMES) {
          dropdown.addOption(day, WEEKDAY_DISPLAY_NAMES[day]);
        }
        dropdown
          .setValue(normalizeWeekStartDay(this.plugin.settings.weekStartDay))
          .onChange(async (value) => {
            this.plugin.settings.weekStartDay = normalizeWeekStartDay(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(firstTimeSetupBody)
      .setName("Shopping list output note")
      .setDesc("Markdown note path that will be overwritten each generation.")
      .addText((text) =>
        text
          .setPlaceholder("Utility/🛒 Weekly Shopping List.md")
          .setValue(this.plugin.settings.shoppingListOutputPath)
          .onChange(async (value) => {
            this.plugin.settings.shoppingListOutputPath = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(firstTimeSetupBody)
      .setName("Run setup")
      .setDesc("Choose the canvas and recipe template locations in one popup, then populate both files automatically.")
      .addButton((btn) =>
        btn.setButtonText("Run First-Time Setup").setCta().onClick(async () => {
          try {
            await this.plugin.runFirstTimeTemplateSetup();
            await this.display();
          } catch (error) {
            new Notice(error?.message || String(error));
          }
        })
      );

    new Setting(firstTimeSetupBody)
      .setName("Open editable templates")
      .setDesc("After setup, open the editable vault copies to customize the canvas and recipe templates.")
      .addButton((btn) =>
        btn.setButtonText("Open Canvas Template").onClick(async () => {
          await this.plugin.openVaultFileByPath(
            this.plugin.getEditableMealPrepCanvasTemplatePath(),
            "Editable meal-prep canvas template not found. Run First-Time Setup first."
          );
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Open Recipe Template").onClick(async () => {
          await this.plugin.openVaultFileByPath(
            this.plugin.getEditableRecipeTemplatePath(),
            "Editable recipe template not found. Run First-Time Setup first."
          );
        })
      );
  }

  renderUnitAliasesSection(containerEl) {
    const { body } = this.buildFoldableSection(containerEl, {
      title: "Unit aliases",
      description: "Extra spellings recognized for cup, tbsp, and tsp. Built-in aliases are always active; add your own in unit-aliases.json.",
    });

    const list = body.createDiv({ cls: "weekly-meal-shopper-entry-list" });
    for (const { unit, builtIn, custom } of buildUnitAliasSummary(ACTIVE_EXTRA_UNIT_ALIASES)) {
      const row = list.createDiv({ cls: "weekly-meal-shopper-entry-row" });
      row.createSpan({ cls: "weekly-meal-shopper-heading-title", text: unit });
      row.createDiv({ text: `Built-in: ${builtIn.join(", ")}` });
      row.createDiv({ text: custom.length ? `Custom: ${custom.join(", ")}` : "Custom: (none)" });
    }

    new Setting(body)
      .setName("unit-aliases.json")
      .setDesc("Add custom aliases under the cup, tbsp, or tsp arrays, then reload to apply.")
      .addButton((btn) =>
        btn.setButtonText("Edit file").onClick(async () => {
          await this.plugin.revealUnitAliasConfigFile();
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Reload aliases").onClick(async () => {
          await this.plugin.loadUnitAliasConfig();
          new Notice("Unit aliases reloaded.");
          await this.display();
        })
      );
  }

  renderNutritionSettingsSection(containerEl, nutritionOverrideEntries = {}) {
    const { body } = this.buildFoldableSection(containerEl, {
      stateKey: "nutritionSectionCollapsed",
      title: "Nutrition & Macros",
      description: "Per-serving protein/carbs/fat/kcal, opt-in per recipe via TrackMacros in frontmatter.",
    });

    new Setting(body)
      .setName("Enable macro tracking")
      .setDesc("Master switch for the 'Calculate recipe macros' commands. Off by default — fully inert until turned on. Turning this on automatically downloads the USDA Foundation Foods dataset (desktop only) — the small built-in dataset is only used as a fallback if that download hasn't happened yet or fails.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.macrosEnabled === true)
          .onChange(async (value) => {
            this.plugin.settings.macrosEnabled = value;
            await this.plugin.saveSettings();
            if (value) {
              await this.plugin.ensureDownloadedNutritionDatasetIsActive();
              await this.display();
            }
          })
      );

    new Setting(body)
      .setName("Energy unit")
      .setDesc("Independent of the measurement preference above — only affects how calculated energy is displayed. Cached values are always stored as kcal.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("kcal", "kcal")
          .addOption("kJ", "kJ")
          .setValue(normalizeEnergyUnit(this.plugin.settings.energyUnit))
          .onChange(async (value) => {
            this.plugin.settings.energyUnit = normalizeEnergyUnit(value);
            await this.plugin.saveSettings();
          })
      );

    new Setting(body)
      .setName("Show macro details on canvas")
      .setDesc("A separate floating panel on the meal-plan canvas (opposite corner from Meal Coverage) with per-day kcal/protein/carbs/fat totals — the whole panel and each day are collapsible.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.macroDetailsEnabled === true)
          .onChange(async (value) => {
            this.plugin.settings.macroDetailsEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.handleActiveLeafChangeForCoverage(this.app.workspace.activeLeaf);
          })
      );

    new Setting(body)
      .setName("USDA nutrition dataset")
      .setDesc(
        Platform.isMobileApp
          ? "Downloaded automatically on desktop when macro tracking is enabled. Not available on mobile (needs desktop-only ZIP decompression) — falls back to the small built-in dataset there."
          : "Downloaded automatically when macro tracking is enabled (USDA Foundation Foods, public domain). Use this to force a fresh download."
      )
      .addButton((btn) => {
        btn.setButtonText("Re-download now").onClick(async () => {
          await this.plugin.downloadNutritionDataset();
        });
        if (Platform.isMobileApp) btn.setDisabled(true);
      });

    this.renderSubHeading(body, {
      title: "Live lookup fallback",
      description: "For ingredients not found in the USDA dataset above, query an online provider once and cache the result.",
    });

    new Setting(body)
      .setName("Enable live lookup")
      .setDesc("Works alongside any database source above — only used for ingredients the local dataset doesn't have.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.nutritionLiveLookupEnabled === true)
          .onChange(async (value) => {
            this.plugin.settings.nutritionLiveLookupEnabled = value;
            await this.plugin.saveSettings();
            await this.display();
          })
      );

    if (this.plugin.settings.nutritionLiveLookupEnabled === true) {
      const provider = normalizeNutritionLiveLookupProvider(this.plugin.settings.nutritionLiveLookupProvider);

      new Setting(body)
        .setName("Live lookup provider")
        .setDesc("USDA is more reliable for generic ingredients (a proper composition database); Open Food Facts needs no API key but is a branded-product database, so results for plain ingredient names are less predictable.")
        .addDropdown((dropdown) =>
          dropdown
            .addOption("usda", "USDA FoodData Central")
            .addOption("openfoodfacts", "Open Food Facts")
            .setValue(provider)
            .onChange(async (value) => {
              this.plugin.settings.nutritionLiveLookupProvider = normalizeNutritionLiveLookupProvider(value);
              await this.plugin.saveSettings();
              await this.display();
            })
        );

      if (provider === "usda") {
        new Setting(body)
          .setName("USDA API key")
          .setDesc("Free — sign up at fdc.nal.usda.gov/api-key-signup.")
          .addText((text) => {
            text.inputEl.type = "password";
            text
              .setPlaceholder("Paste your USDA API key")
              .setValue(this.plugin.settings.usdaApiKey || "")
              .onChange(async (value) => {
                this.plugin.settings.usdaApiKey = String(value || "").trim();
                await this.plugin.saveSettings();
              });
          });
      }
    }

    this.renderSubHeading(body, {
      title: "Manual matches",
      description: "Pin a specific ingredient to a fixed per-100g value — wins over the database source and live lookup above.",
    });

    const overridesListEl = body.createDiv({ cls: "weekly-meal-shopper-entry-list" });
    const overrideNames = Object.keys(nutritionOverrideEntries || {});
    if (overrideNames.length === 0) {
      overridesListEl.createDiv({ text: "No manual matches yet.", cls: "weekly-meal-shopper-empty" });
    } else {
      for (const name of overrideNames) {
        const macros = nutritionOverrideEntries[name];
        const row = overridesListEl.createDiv({ cls: "weekly-meal-shopper-entry-row" });
        row.createEl("span", {
          text: `${name} — ${Math.round(macros?.kcal || 0)} kcal, ${Math.round(macros?.protein || 0)}g protein, ${Math.round(macros?.carbs || 0)}g carbs, ${Math.round(macros?.fat || 0)}g fat`,
          cls: "weekly-meal-shopper-entry-text",
        });
        const removeBtn = row.createEl("button", { text: "Remove", cls: "weekly-meal-shopper-remove-btn" });
        removeBtn.addEventListener("click", async () => {
          await this.plugin.removeNutritionOverride(name);
          await this.plugin.loadNutritionConfig();
          await this.display();
        });
      }
    }

    new Setting(body)
      .setName("Add manual match")
      .setDesc("Search the active database or type values by hand for a specific ingredient name.")
      .addButton((btn) =>
        btn.setButtonText("Add").onClick(async () => {
          const result = await this.plugin.promptTextEntry({
            title: "Set nutrition match",
            label: "Ingredient name",
            submitText: "Next",
          });
          if (result.cancelled) return;
          const ingredient = String(result.value || "").trim();
          if (!ingredient) return;
          await this.plugin.openNutritionMatchModal(ingredient);
          await this.display();
        })
      );
  }

  renderLegumeSettingsSection(containerEl) {
    const { body, searchInput } = this.buildFoldableSection(containerEl, {
      title: "Dried legumes",
      description: "Buy legumes dried for cooking from scratch, and tune the canned→dried conversion factors.",
      searchPlaceholder: "Search legume settings",
    });

    const rows = [];
    const addRow = (configure) => {
      const setting = new Setting(body);
      configure(setting);
      rows.push(setting);
    };

    addRow((setting) =>
      setting
        .setName("Buy legumes dried (cook from scratch)")
        .setDesc("Convert canned/cooked legumes (chickpeas, beans, lentils, …) to dried weights. Shopping list shows grams + an ml storage readout; recipe view shows grams only. Off keeps cans.")
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.legumeShoppingMode === "dried")
            .onChange(async (value) => {
              this.plugin.settings.legumeShoppingMode = value ? "dried" : "canned";
              await this.plugin.saveSettings();
            })
        )
    );

    const numberRow = (name, desc, key, fallback, placeholder) =>
      addRow((setting) =>
        setting
          .setName(name)
          .setDesc(desc)
          .addText((text) =>
            text
              .setPlaceholder(placeholder)
              .setValue(String(positiveNumberOr(this.plugin.settings[key], fallback)))
              .onChange(async (value) => {
                this.plugin.settings[key] = positiveNumberOr(value, fallback);
                await this.plugin.saveSettings();
              })
          )
      );

    numberRow("Dried grams per can", "Dried-bean weight equivalent to one ~400 g can (used when a recipe counts cans).", "legumeGramsDriedPerCan", 85, "85");
    numberRow("Cooked → dried factor", "Multiply an explicit cooked/canned weight by this to estimate the dried weight.", "legumeCookedToDriedFactor", 0.4, "0.4");
    numberRow("Dried density (g per ml)", "Bulk density used to show the storage volume (ml) alongside grams on the shopping list.", "driedLegumeDensityGPerMl", 0.8, "0.8");

    if (searchInput) {
      const applyFilter = () => {
        const query = normalizeSearchText(searchInput.value || "");
        for (const setting of rows) {
          const el = setting.settingEl;
          if (!el) continue;
          const haystack = normalizeSearchText(el.textContent || "");
          el.style.display = !query || haystack.includes(query) ? "" : "none";
        }
      };
      searchInput.addEventListener("input", applyFilter);
    }
  }

  renderShoppingCategoriesSection(containerEl, categoryConfig) {
    const { body, searchInput } = this.buildFoldableSection(containerEl, {
      stateKey: "shoppingCategoriesCollapsed",
      title: "Shopping categories",
      description: "Manage the category list used for ingredient classification and override selection.",
      searchPlaceholder: "Search categories",
    });

    let searchQuery = "";
    let draggedCategory = "";
    const controls = body.createDiv({ cls: "weekly-meal-shopper-controls" });
    const addBtn = controls.createEl("button", { text: "+" });
    addBtn.addClass("mod-cta");
    addBtn.addClass("weekly-meal-shopper-plus-btn");
    addBtn.setAttribute("aria-label", "Add shopping category");

    const reorderHelp = body.createEl("p", {
      cls: "weekly-meal-shopper-help weekly-meal-shopper-reorder-help",
    });
    const listEl = body.createDiv({ cls: "weekly-meal-shopper-entry-list" });

    const clearDragState = () => {
      listEl.querySelectorAll(".weekly-meal-shopper-entry-row").forEach((row) => {
        row.removeClass("is-dragging");
        row.removeClass("is-drop-target");
      });
    };

    const reorderCategories = async (targetCategory, placeAfter) => {
      if (!draggedCategory || draggedCategory === targetCategory) return;
      const currentOrder = getSelectableIngredientCategories(categoryConfig);
      const fromIndex = currentOrder.indexOf(draggedCategory);
      const targetIndex = currentOrder.indexOf(targetCategory);
      if (fromIndex === -1 || targetIndex === -1) return;

      // When dragging downward, removing the source item shifts the later insertion index back by one.
      let insertIndex = targetIndex + (placeAfter ? 1 : 0);
      if (fromIndex < insertIndex) insertIndex -= 1;

      const nextOrder = moveArrayItem(currentOrder, fromIndex, insertIndex);
      if (nextOrder.join("\n") === currentOrder.join("\n")) return;

      categoryConfig.categoryOrder = [...nextOrder];
      await this.plugin.saveIngredientCategoryConfig(categoryConfig);
      renderList();
    };

    const renderList = () => {
      listEl.empty();
      const canReorder = !searchQuery;
      reorderHelp.setText(
        canReorder
          ? "Drag and hold a category row to rearrange the shopping-list order."
          : "Clear the search to drag and rearrange categories."
      );
      const categories = getSelectableIngredientCategories(categoryConfig)
        .filter((category) => normalizeSearchText(category).includes(searchQuery));
      if (categories.length === 0) {
        listEl.createEl("div", { text: "No categories match the current search.", cls: "weekly-meal-shopper-empty" });
        return;
      }

      for (const category of categories) {
        const row = listEl.createDiv({ cls: "weekly-meal-shopper-entry-row" });
        const rowMain = row.createDiv({ cls: "weekly-meal-shopper-entry-main" });
        const isDefault = category === categoryConfig.defaultCategory;

        if (canReorder) {
          row.draggable = true;
          row.addClass("weekly-meal-shopper-entry-row-draggable");
          rowMain.createEl("span", {
            text: "⋮⋮",
            cls: "weekly-meal-shopper-drag-handle",
          });

          row.addEventListener("dragstart", (event) => {
            draggedCategory = category;
            row.addClass("is-dragging");
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", category);
            }
          });

          row.addEventListener("dragover", (event) => {
            if (!draggedCategory || draggedCategory === category) return;
            event.preventDefault();
            clearDragState();
            row.addClass("is-drop-target");
            if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          });

          row.addEventListener("dragleave", () => {
            row.removeClass("is-drop-target");
          });

          row.addEventListener("drop", async (event) => {
            if (!draggedCategory || draggedCategory === category) return;
            event.preventDefault();
            const rect = row.getBoundingClientRect();
            const placeAfter = event.clientY > rect.top + rect.height / 2;
            clearDragState();
            await reorderCategories(category, placeAfter);
            draggedCategory = "";
          });

          row.addEventListener("dragend", () => {
            draggedCategory = "";
            clearDragState();
          });
        }

        rowMain.createEl("span", {
          text: isDefault ? `${category} (default)` : category,
          cls: "weekly-meal-shopper-entry-text",
        });

        const removeBtn = row.createEl("button", { text: "Remove", cls: "weekly-meal-shopper-remove-btn" });
        removeBtn.addEventListener("click", async () => {
          const nextOrder = categoryConfig.categoryOrder.filter((v) => v !== category);
          if (nextOrder.length === 0) {
            new Notice("At least one shopping category is required.");
            return;
          }
          categoryConfig.categoryOrder = nextOrder;
          if (categoryConfig.defaultCategory === category) {
            categoryConfig.defaultCategory = nextOrder[0];
          }
          await this.plugin.saveIngredientCategoryConfig(categoryConfig);
          await this.display();
        });
      }
    };

    searchInput.addEventListener("input", () => {
      searchQuery = normalizeSearchText(searchInput.value || "");
      renderList();
    });

    addBtn.addEventListener("click", () => {
      new TextEntryModal(this.app, {
        title: "Add shopping category",
        label: "Category name",
        submitText: "Add",
        emptyError: "Please enter a category name.",
        onSubmit: async (value) => {
          const current = getSelectableIngredientCategories(categoryConfig);
          if (current.includes(value)) {
            new Notice("Category already exists.");
            return;
          }
          categoryConfig.categoryOrder = [...categoryConfig.categoryOrder, value];
          await this.plugin.saveIngredientCategoryConfig(categoryConfig);
          await this.display();
        },
      }).open();
    });

    renderList();
  }

  renderExcludedIngredientsSection(containerEl, categories) {
    const { body, searchInput } = this.buildFoldableSection(containerEl, {
      stateKey: "excludeIngredientsCollapsed",
      title: "Exclude Ingredients",
      description: "Exact match exclusions for shopping list names.",
      searchPlaceholder: "Search excluded ingredients",
    });

    let searchQuery = "";
    const controls = body.createDiv({ cls: "weekly-meal-shopper-controls" });
    const addBtn = controls.createEl("button", { text: "+" });
    addBtn.addClass("mod-cta");
    addBtn.addClass("weekly-meal-shopper-plus-btn");
    addBtn.setAttribute("aria-label", "Add excluded ingredient");

    const listEl = body.createDiv({ cls: "weekly-meal-shopper-entry-list" });
    const getEntries = () => [...parseExcludedIngredients(this.plugin.settings.excludedIngredientsExact).values()]
      .filter((entry) => normalizeSearchText(entry.ingredient).includes(searchQuery));

    const renderList = () => {
      listEl.empty();
      const entries = getEntries();
      if (entries.length === 0) {
        const message = searchQuery
          ? `No excluded ingredients match the current search. Press Enter to add "${searchInput.value.trim()}".`
          : "No excluded ingredients match the current search.";
        listEl.createEl("div", { text: message, cls: "weekly-meal-shopper-empty" });
        return;
      }

      for (const entry of entries) {
        const row = listEl.createDiv({ cls: "weekly-meal-shopper-entry-row" });
        row.createEl("span", {
          text: entry.category ? `${entry.ingredient} (${entry.category})` : entry.ingredient,
          cls: "weekly-meal-shopper-entry-text",
        });
        const removeBtn = row.createEl("button", { text: "Remove", cls: "weekly-meal-shopper-remove-btn" });
        removeBtn.addEventListener("click", async () => {
          const map = parseExcludedIngredients(this.plugin.settings.excludedIngredientsExact);
          map.delete(normalizeSearchText(entry.ingredient));
          this.plugin.settings.excludedIngredientsExact = [...map.values()].map(
            (v) => `${v.ingredient} | ${v.category}`
          );
          await this.plugin.saveSettings();
          renderList();
        });
      }
    };

    searchInput.addEventListener("input", () => {
      searchQuery = normalizeSearchText(searchInput.value || "");
      renderList();
    });

    searchInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const ingredient = cleanIngredientName(String(searchInput.value || ""));
      if (!ingredient) return;
      const exactEntries = parseExcludedIngredients(this.plugin.settings.excludedIngredientsExact);
      if (exactEntries.has(normalizeSearchText(ingredient))) return;
      event.preventDefault();
      await this.plugin.saveExcludedIngredientEntry({ ingredient });
      searchInput.value = "";
      searchQuery = "";
      renderList();
    });

    addBtn.addEventListener("click", () => {
      new IngredientEntryModal(this.app, {
        title: "Add excluded ingredient",
        ingredientLabel: "Ingredient (exact match)",
        categories: [],
        requireCategory: false,
        submitText: "Add",
        onSubmit: async ({ ingredient, category }) => {
          await this.plugin.saveExcludedIngredientEntry({ ingredient, category });
          renderList();
        },
      }).open();
    });

    renderList();
  }

  renderIngredientOverridesSection(containerEl, categories, defaultCategoryName = "") {
    const { body, searchInput } = this.buildFoldableSection(containerEl, {
      stateKey: "ingredientOverridesCollapsed",
      title: "Ingredient Categories",
      description: "Override category and optional output unit per ingredient.",
      searchPlaceholder: "Search ingredient overrides",
    });

    let searchQuery = "";
    const controls = body.createDiv({ cls: "weekly-meal-shopper-controls" });
    const addBtn = controls.createEl("button", { text: "+" });
    addBtn.addClass("mod-cta");
    addBtn.addClass("weekly-meal-shopper-plus-btn");
    addBtn.setAttribute("aria-label", "Add ingredient override");

    const listEl = body.createDiv({ cls: "weekly-meal-shopper-entry-list" });
    const defaultCategory = String(defaultCategoryName || categories[0] || "").trim();
    const getEntries = () => parseIngredientOverrideEntries(this.plugin.settings.ingredientOverrides)
      .filter((entry) => normalizeSearchText(entry.ingredient).includes(searchQuery));

    const renderList = () => {
      listEl.empty();
      const entries = getEntries();
      if (entries.length === 0) {
        const message = searchQuery
          ? `No ingredient overrides match the current search. Press Enter to add "${searchInput.value.trim()}".`
          : "No ingredient overrides match the current search.";
        listEl.createEl("div", { text: message, cls: "weekly-meal-shopper-empty" });
        return;
      }

      for (const entry of entries) {
        const row = listEl.createDiv({ cls: "weekly-meal-shopper-entry-row" });
        const unitSuffix = entry.unit ? ` | ${entry.unit}` : "";
        row.createEl("span", {
          text: `${entry.ingredient} (${entry.category})${unitSuffix}`,
          cls: "weekly-meal-shopper-entry-text",
        });
        const removeBtn = row.createEl("button", { text: "Remove", cls: "weekly-meal-shopper-remove-btn" });
        removeBtn.addEventListener("click", async () => {
          const next = parseIngredientOverrideEntries(this.plugin.settings.ingredientOverrides)
            .filter((v) => v.ingredient !== entry.ingredient)
            .map((v) => `${v.ingredient} | ${v.category} | ${v.unit || ""}`);
          this.plugin.settings.ingredientOverrides = normalizeExactExclusionList(next);
          await this.plugin.saveSettings();
          renderList();
        });
      }
    };

    searchInput.addEventListener("input", () => {
      searchQuery = normalizeSearchText(searchInput.value || "");
      renderList();
    });

    searchInput.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter") return;
      const ingredient = cleanIngredientName(String(searchInput.value || ""));
      if (!ingredient) return;
      const existing = parseIngredientOverrideEntries(this.plugin.settings.ingredientOverrides)
        .some((entry) => normalizeSearchText(entry.ingredient) === normalizeSearchText(ingredient));
      if (existing) return;
      event.preventDefault();
      await this.plugin.openIngredientOverrideModal(ingredient, {
        initialCategory: defaultCategory,
        onSubmitComplete: async () => {
          searchInput.value = "";
          searchQuery = "";
          renderList();
        },
      });
    });

    addBtn.addEventListener("click", () => {
      new IngredientEntryModal(this.app, {
        title: "Add ingredient override",
        ingredientLabel: "Ingredient (exact match)",
        unitLabel: "Unit override (optional)",
        includeUnit: true,
        categories,
        initialCategory: defaultCategory,
        submitText: "Add",
        onSubmit: async ({ ingredient, category, unit }) => {
          const nextMap = new Map();
          for (const entry of parseIngredientOverrideEntries(this.plugin.settings.ingredientOverrides)) {
            nextMap.set(entry.ingredient, entry);
          }
          nextMap.set(ingredient, { ingredient, category, unit });
          this.plugin.settings.ingredientOverrides = [...nextMap.values()].map(
            (v) => `${v.ingredient} | ${v.category} | ${v.unit || ""}`
          );
          await this.plugin.saveSettings();
          renderList();
        },
      }).open();
    });

    renderList();
  }

}

module.exports = WeeklyMealShopperPlugin;

/* nosourcemap */