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
} = require("obsidian");

const DEFAULT_SETTINGS = {
  weeklyCanvasPath: "Utility/⛑️ Weekly Meal Plan.canvas",
  mealPrepCanvasFolder: "Utility",
  mealPrepCanvasNameTemplate: "⛑️ Weekly Meal Plan Week {{week}} {{year}}.canvas",
  shoppingListOutputPath: "Utility/🛒 Weekly Shopping List.md",
  recipeFolder: "pages/Food and Drink/Recipes",
  measurementPreset: "vault_standard",
  measurementPreference: "weight",
  cupMl: 250,
  tbspMl: 15,
  tspMl: 5,
  cupShorthand: "cup",
  tbspShorthand: "tbsp",
  tspShorthand: "tsp",
  ingredientLineTemplate: "{{Amount}} {{Unit}} {{Ingredient}}",
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
  showCategoryReasonsInShoppingList: true,
  includeOverrideLinksInShoppingList: false,
  settingsImportExportPath: ".obsidian/plugins/weekly-meal-shopper/settings-export.json",
  settingsSectionState: {
    firstTimeSetupCollapsed: false,
    mealPrepSetupCollapsed: false,
    recipeSetupCollapsed: false,
    ingredientFormatCollapsed: false,
    recipeTranscriptionCollapsed: false,
    settingsImportExportCollapsed: false,
    shoppingCategoriesCollapsed: false,
    excludeIngredientsCollapsed: false,
    ingredientOverridesCollapsed: false,
  },
};

const RECIPE_TEMPLATE_PATH = ".obsidian/plugins/weekly-meal-shopper/templates/recipe-template.md";
const MEAL_PREP_CANVAS_TEMPLATE_PATH = ".obsidian/plugins/weekly-meal-shopper/templates/meal-prep-canvas-template.canvas";

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
};

const DEFAULT_UNIT_DENSITY_CONFIG = {
  densities: WEIGHT_DENSITY_G_PER_ML,
};
const DEFAULT_UNIT_ALIAS_CONFIG = {
  cup: [],
  tbsp: [],
  tsp: [],
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
  const cupLabel = normalizeSingleLineText(settings?.cupShorthand) || "cup";
  const tbspLabel = normalizeSingleLineText(settings?.tbspShorthand) || "tbsp";
  const tspLabel = normalizeSingleLineText(settings?.tspShorthand) || "tsp";
  return {
    presetKey,
    cupMl,
    tbspMl,
    tspMl,
    labels: { cup: cupLabel, tbsp: tbspLabel, tsp: tspLabel },
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

  addAliases(["cup", "cups", profile.labels.cup], cupSpec);
  addAliases(["tbsp", "tbs", "tablespoon", "tablespoons", profile.labels.tbsp], tbspSpec);
  addAliases(["tsp", "teaspoon", "teaspoons", profile.labels.tsp], tspSpec);
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
  cupShorthand: "cup",
  tbspShorthand: "tbsp",
  tspShorthand: "tsp",
});
let ACTIVE_UNIT_MAP = buildUnitMapFromProfile(ACTIVE_MEASUREMENT_PROFILE);
let ACTIVE_MEASUREMENT_PREFERENCE = "weight";
const DEFAULT_INGREDIENT_LINE_TEMPLATE = "{{Amount}} {{Unit}} {{Ingredient}}";
let ACTIVE_INGREDIENT_LINE_TEMPLATE = DEFAULT_INGREDIENT_LINE_TEMPLATE;

function setActiveMeasurementProfile(settings) {
  ACTIVE_MEASUREMENT_PROFILE = resolveMeasurementProfile(settings);
  ACTIVE_UNIT_MAP = buildUnitMapFromProfile(ACTIVE_MEASUREMENT_PROFILE);
  const pref = normalizeSearchText(settings?.measurementPreference);
  ACTIVE_MEASUREMENT_PREFERENCE = pref === "volume" ? "volume" : "weight";
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

function normalizeIngredientLineTemplate(template) {
  const raw = normalizeSingleLineText(template);
  if (!raw || !/{{\s*ingredient\s*}}/i.test(raw)) {
    return DEFAULT_INGREDIENT_LINE_TEMPLATE;
  }
  return raw;
}

function setActiveIngredientLineTemplate(template) {
  ACTIVE_INGREDIENT_LINE_TEMPLATE = normalizeIngredientLineTemplate(template);
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

function applyMeasurementPreferenceToParsedItem(parsed, { preferWeight = ACTIVE_MEASUREMENT_PREFERENCE === "weight" } = {}) {
  if (!parsed || typeof parsed !== "object") return parsed;
  if (!preferWeight || parsed.unitMetric !== "ml") return parsed;
  const normalizedName = normalizeSearchText(parsed.name);
  if (detectCitrusKey(parsed.name) && /\bjuice\b/.test(normalizedName)) return parsed;
  const density = estimateIngredientDensityGPerMl(parsed.name);
  if (!Number.isFinite(density) || density <= 0) return parsed;
  const grams = Number((Number(parsed.amountMetric || 0) * density).toFixed(2));
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
    "fresh herbs": "Fresh Fruit and Vegetables",
  },
  contains: {
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

    frozen: "Frozen",

    salt: "Spices and Seasoning",
    pepper: "Spices and Seasoning",
    oregano: "Spices and Seasoning",
    cumin: "Spices and Seasoning",
    paprika: "Spices and Seasoning",
    "garam masala": "Spices and Seasoning",
    turmeric: "Spices and Seasoning",
    tumeric: "Spices and Seasoning",
    "chilli flake": "Spices and Seasoning",
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
    lemongrass: "Fresh Fruit and Vegetables",
    squash: "Fresh Fruit and Vegetables",

    milk: "Dairy and Refrigerated",
    yogurt: "Dairy and Refrigerated",
    cream: "Dairy and Refrigerated",
    butter: "Dairy and Refrigerated",
    "ice cream": "Dairy and Refrigerated",

    bread: "Bakery",
    bagel: "Bakery",
    wrap: "Bakery",
    tortilla: "Bakery",
    bun: "Bakery",

    tofu: "Protein",
    tempeh: "Protein",
    chorizo: "Protein",
    chicken: "Protein",
    beef: "Protein",
    pork: "Protein",
    fish: "Protein",
    salmon: "Protein",
    egg: "Protein",
    protein: "Protein",

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

function normalizeCategoryConfig(raw) {
  const base = cloneDefaultCategoryConfig();
  if (!raw || typeof raw !== "object") return base;

  if (Array.isArray(raw.categoryOrder)) {
    const order = raw.categoryOrder.map((v) => String(v || "").trim()).filter(Boolean);
    if (order.length > 0) base.categoryOrder = order;
  }

  if (typeof raw.defaultCategory === "string" && raw.defaultCategory.trim()) {
    base.defaultCategory = raw.defaultCategory.trim();
  }

  if (raw.exact && typeof raw.exact === "object") {
    base.exact = {};
    for (const [k, v] of Object.entries(raw.exact)) {
      const key = normalizeSearchText(k);
      const category = String(v || "").trim();
      if (key && category) base.exact[key] = category;
    }
  }

  if (raw.contains && typeof raw.contains === "object") {
    base.contains = {};
    for (const [k, v] of Object.entries(raw.contains)) {
      const key = normalizeSearchText(k);
      const category = String(v || "").trim();
      if (key && category) base.contains[key] = category;
    }
  }

  return base;
}

function classifyIngredientCategory(name, config) {
  const text = normalizeSearchText(name);
  const c = normalizeCategoryConfig(config);

  if (text && c.exact[text]) return c.exact[text];
  for (const [pattern, category] of Object.entries(c.contains)) {
    if (text.includes(pattern)) return category;
  }
  return c.defaultCategory || "Other";
}

function classifyIngredientCategoryWithReason(name, config) {
  const text = normalizeSearchText(name);
  const c = normalizeCategoryConfig(config);
  if (text && c.exact[text]) {
    return { category: c.exact[text], reason: `exact match: "${text}"` };
  }
  for (const [pattern, category] of Object.entries(c.contains)) {
    if (text.includes(pattern)) {
      return { category, reason: `contains rule: "${pattern}"` };
    }
  }
  return { category: c.defaultCategory || "Other", reason: "default category" };
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
  const range = compact.match(/^([^\s]+)\s*(?:to|-|–)\s*([^\s]+)/i);
  if (range) {
    const first = parseAmountToken(range[1]);
    if (first !== null) {
      const consumed = range[0].length;
      return { amount: first, rest: compact.slice(consumed).trim() };
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

function parseIngredientLine(line, unitMap = ACTIVE_UNIT_MAP) {
  let text = line.replace(/^[-*+]\s+/, "").trim();
  if (!text) return null;

  text = text.replace(/\([^)]*oz[^)]*\)/gi, "").trim();
  // Support compact quantity+unit formats like "150g", "1kg", "250ml".
  text = text.replace(/^(\d+(?:\.\d+)?)([a-zA-Z]+)/, "$1 $2");
  text = text.replace(/\s+/g, " ");

  const amountResult = parseAmountFromStart(text);
  if (!amountResult) {
    let ingredientName = text;
    let preparation = "";
    const commaIdx = ingredientName.indexOf(",");
    if (commaIdx !== -1) {
      preparation = ingredientName.slice(commaIdx + 1).trim();
      ingredientName = ingredientName.slice(0, commaIdx).trim();
    }
    ingredientName = cleanIngredientName(ingredientName);
    preparation = cleanIngredientName(preparation);
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

  let preparation = "";
  const commaIdx = ingredientName.indexOf(",");
  if (commaIdx !== -1) {
    preparation = ingredientName.slice(commaIdx + 1).trim();
    ingredientName = ingredientName.slice(0, commaIdx).trim();
  }

  ingredientName = ingredientName
    .replace(/^[,\-:]+/, "")
    .trim();

  ingredientName = cleanIngredientName(ingredientName);
  preparation = cleanIngredientName(preparation);
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
    template = ACTIVE_INGREDIENT_LINE_TEMPLATE,
    metricMode = false,
    preferWeight = ACTIVE_MEASUREMENT_PREFERENCE === "weight",
    outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  } = {}
) {
  if (!parsed) return "";
  const effective = applyMeasurementPreferenceToParsedItem(parsed, { preferWeight });

  const prep = normalizeSingleLineText(effective.preparation || "");
  let amount = "";
  let unit = "";
  const usingWeightMetric = preferWeight && effective.unitMetric === "g" && parsed.unitMetric === "ml";

  if (!effective.quantityUnknown) {
    if (metricMode || usingWeightMetric) {
      if (effective.unitMetric === "unit") {
        amount = formatMetricAmount(effective.amount);
        // Keep explicit countable units like "can" or "clove" instead of dropping them in metric mode.
        unit = effective.unitExplicit ? effective.unit : "";
      } else {
        amount = formatMetricAmount(effective.amountMetric);
        unit = effective.unitMetric;
      }
    } else {
      amount = formatMetricAmount(effective.amount);
      if (effective.unitExplicit) {
        const canonical = canonicalVolumeUnit(effective.unit);
        unit = canonical && outputLabels?.[canonical] ? outputLabels[canonical] : effective.unit;
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

  const templateToUse = normalizeIngredientLineTemplate(template);
  let line = templateToUse.replace(/{{\s*(amount|unit|ingredient|preparation|preparationsuffix)\s*}}/gi, (match, key) => {
    const k = normalizeSearchText(key);
    if (!Object.prototype.hasOwnProperty.call(replacements, k)) return "";
    return replacements[k];
  });

  line = line
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!line) line = replacements.ingredient;
  if (prep && !/{{\s*preparation\s*}}/i.test(templateToUse) && !/{{\s*preparationsuffix\s*}}/i.test(templateToUse)) {
    line = `${line}, ${prep}`;
  }
  return `- ${line}`;
}

function normalizeIngredientsSectionLines(
  lines,
  unitMap = ACTIVE_UNIT_MAP,
  outputLabels = ACTIVE_MEASUREMENT_PROFILE.labels,
  template = ACTIVE_INGREDIENT_LINE_TEMPLATE,
  preferWeight = ACTIVE_MEASUREMENT_PREFERENCE === "weight"
) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => {
    const parsed = parseIngredientLine(line, unitMap);
    if (!parsed) return line;
    return formatIngredientLineFromParsed(parsed, {
      metricMode: false,
      preferWeight,
      outputLabels,
      template,
    });
  });
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripPreparationPhrases(name) {
  let cleaned = cleanIngredientName(String(name || ""));
  cleaned = cleaned.replace(/\([^)]*\)/g, "").trim();
  cleaned = cleaned.replace(/\s*,\s*.*$/, "").trim();

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

  const trailingPrepWords = [
    "bruised",
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
    "thawed",
    "melted",
    "softened",
    "warmed",
  ];
  const prepWordRegex = new RegExp(`\\s+(?:${trailingPrepWords.join("|")})$`, "i");
  while (prepWordRegex.test(cleaned)) {
    cleaned = cleaned.replace(prepWordRegex, "").trim();
  }

  return cleaned || cleanIngredientName(String(name || ""));
}

function normalizeShoppingDisplayName(name) {
  let cleaned = String(name || "").trim();
  if (!cleaned) return cleaned;
  cleaned = cleaned.replace(/\bfresh\s+cilantro\b/gi, "fresh coriander");
  cleaned = cleaned.replace(/\bcilantro\b/gi, "coriander");
  return cleaned.replace(/\s+/g, " ").trim();
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

function normalizedAggregationName(name) {
  const text = normalizeSearchText(name);
  if (!text) return "";
  const words = text.split(" ");
  const last = words[words.length - 1] || "";
  words[words.length - 1] = normalizeSearchText(singularizeSimple(last));
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

function buildStandardBody(sectionMap) {
  const ingredients = sectionMap.ingredients?.length ? sectionMap.ingredients : ["- "];
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
    link: firstStringValue(base.link || base.url || fallback.link || sourceUrl),
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

function sectionForNode(node, groups) {
  const center = getNodeCenter(node);
  const containing = groups
    .filter((g) => {
      const x = typeof g.x === "number" ? g.x : 0;
      const y = typeof g.y === "number" ? g.y : 0;
      const w = typeof g.width === "number" ? g.width : 0;
      const h = typeof g.height === "number" ? g.height : 0;
      return center.x >= x && center.x <= x + w && center.y >= y && center.y <= y + h;
    })
    .sort((a, b) => (a.width * a.height) - (b.width * b.height));

  for (const g of containing) {
    const section = classifySectionLabel(g.label);
    if (section !== "default") return section;
  }

  return "default";
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
      this.options.onSubmit?.(value);
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

class WeeklyMealShopperPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    await this.ensureIngredientCategoryConfigFile();
    await this.ensureUnitDensityConfigFile();
    await this.ensureUnitAliasConfigFile();
    await this.loadUnitDensityConfig();
    await this.loadUnitAliasConfig();

    this.addSettingTab(new WeeklyMealShopperSettingTab(this.app, this));
    this.recipeViewOverlay = null;
    this.parsedIngredientCache = new Map();

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
      name: "Set active canvas as weekly meal plan",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "canvas") return false;
        if (!checking) {
          this.settings.weeklyCanvasPath = file.path;
          this.saveSettings();
          new Notice(`Weekly meal plan canvas set to ${file.path}`);
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
        await this.standardizeRecipeFile(file);
      },
    });

    this.addCommand({
      id: "standardize-recipe-formats-in-folder",
      name: "Standardize recipe formats in configured folder",
      callback: async () => {
        const normalizedFolder = normalizePath(this.settings.recipeFolder);
        const recipeFiles = this.app.vault
          .getMarkdownFiles()
          .filter((file) => file.path.startsWith(`${normalizedFolder}/`) || file.path === normalizedFolder)
          .filter((file) => this.isRecipeFile(file));

        let updated = 0;
        for (const recipeFile of recipeFiles) {
          const changed = await this.standardizeRecipeFile(recipeFile);
          if (changed) updated += 1;
        }

        new Notice(`Standardized ${updated} recipe notes.`);
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

        await this.standardizeRecipeFile(file);
        const parsed = await this.parseIngredientsFromRecipeFile(file);
        await this.saveParsedIngredientsToFrontmatter(file, parsed);
        new Notice(
          `Saved ${parsed.length} parsed ingredients to ${this.settings.parsedIngredientsField} and refreshed direction highlighting.`
        );
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
      id: "create-weekly-meal-prep-canvas",
      name: "Create weekly meal-prep canvas",
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

  }

  onunload() {
    this.closeRecipeViewOverlay({ restoreLivePreview: false });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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
    this.settings.measurementPreference = normalizeSearchText(this.settings.measurementPreference) === "volume"
      ? "volume"
      : "weight";
    this.settings.cupShorthand = normalizeSingleLineText(this.settings.cupShorthand || "cup") || "cup";
    this.settings.tbspShorthand = normalizeSingleLineText(this.settings.tbspShorthand || "tbsp") || "tbsp";
    this.settings.tspShorthand = normalizeSingleLineText(this.settings.tspShorthand || "tsp") || "tsp";
    this.settings.ingredientLineTemplate = normalizeIngredientLineTemplate(this.settings.ingredientLineTemplate);
    this.settings.transcriptionMetricOutput = this.settings.transcriptionMetricOutput !== false;
    this.settings.showCategoryReasonsInShoppingList = this.settings.showCategoryReasonsInShoppingList !== false;
    this.settings.includeOverrideLinksInShoppingList = this.settings.includeOverrideLinksInShoppingList === true;
    this.settings.settingsImportExportPath = String(
      this.settings.settingsImportExportPath || ".obsidian/plugins/weekly-meal-shopper/settings-export.json"
    ).trim() || ".obsidian/plugins/weekly-meal-shopper/settings-export.json";
    const sectionState = this.settings.settingsSectionState && typeof this.settings.settingsSectionState === "object"
      ? this.settings.settingsSectionState
      : {};
    this.settings.settingsSectionState = {
      firstTimeSetupCollapsed: !!sectionState.firstTimeSetupCollapsed,
      mealPrepSetupCollapsed: !!sectionState.mealPrepSetupCollapsed,
      recipeSetupCollapsed: !!sectionState.recipeSetupCollapsed,
      ingredientFormatCollapsed: !!sectionState.ingredientFormatCollapsed,
      recipeTranscriptionCollapsed: !!sectionState.recipeTranscriptionCollapsed,
      settingsImportExportCollapsed: !!sectionState.settingsImportExportCollapsed,
      shoppingCategoriesCollapsed: !!sectionState.shoppingCategoriesCollapsed,
      excludeIngredientsCollapsed: !!sectionState.excludeIngredientsCollapsed,
      ingredientOverridesCollapsed: !!sectionState.ingredientOverridesCollapsed,
    };
    this.settings.transcriptionApiKey = String(this.settings.transcriptionApiKey || "").trim();
    if (typeof this.settings.useStoredTranscriptionApiKey !== "boolean") {
      this.settings.useStoredTranscriptionApiKey = !!this.normalizeApiKey(this.settings.transcriptionApiKey);
    }
    this.settings.transcriptionModel = String(this.settings.transcriptionModel || "gpt-4.1-mini").trim()
      || "gpt-4.1-mini";
    setActiveMeasurementProfile(this.settings);
    setActiveIngredientLineTemplate(this.settings.ingredientLineTemplate);
  }

  async saveSettings() {
    delete this.settings.workflowPreset;
    delete this.settings.featureBasicEnabled;
    delete this.settings.featureMealPrepEnabled;
    delete this.settings.transcriptionOutputFolder;
    if (this.settings.settingsSectionState && typeof this.settings.settingsSectionState === "object") {
      delete this.settings.settingsSectionState.workflowModeCollapsed;
    }
    setActiveMeasurementProfile(this.settings);
    setActiveIngredientLineTemplate(this.settings.ingredientLineTemplate);
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
    const folder = normalizePath(this.settings.mealPrepCanvasFolder || "Utility");
    const fileName = this.buildMealPrepCanvasFilename();
    await this.ensureFolderPathExists(folder);

    const path = normalizePath(`${folder}/${fileName}`);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile && existing.extension === "canvas") {
      this.settings.weeklyCanvasPath = existing.path;
      await this.saveSettings();
      await this.app.workspace.getLeaf(true).openFile(existing);
      new Notice(`Opened existing meal-prep canvas: ${existing.path}`);
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
    const created = await this.app.vault.create(
      path,
      templateContent.endsWith("\n") ? templateContent : `${templateContent}\n`
    );
    this.settings.weeklyCanvasPath = created.path;
    await this.saveSettings();
    await this.app.workspace.getLeaf(true).openFile(created);
    new Notice(`Created meal-prep canvas: ${created.path}`);
    return created;
  }

  extractIngredientNameFromShoppingLine(line) {
    let text = String(line || "").trim();
    if (!text) return "";
    text = text.replace(/^\s*[-*+]\s+\[[ xX]\]\s*/, "").trim();
    text = text.replace(/^\(([^)]+)\)\s*/, "").trim();
    text = text.replace(/\s+_\(why:[^)]+\)_\s*$/i, "").trim();
    text = text.replace(/\s+\[(?:override|why)\]\([^)]+\)\s*$/i, "").trim();
    return text;
  }

  async addIngredientOverrideFromCurrentShoppingLine() {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) {
      new Notice("Open the shopping list note in a markdown editor first.");
      return;
    }
    const editor = view.editor;
    const selected = String(editor.getSelection() || "").trim();
    const line = selected || editor.getLine(editor.getCursor().line);
    const ingredient = this.extractIngredientNameFromShoppingLine(line);
    if (!ingredient) {
      new Notice("Could not detect an ingredient name on the current line.");
      return;
    }

    const categoryConfig = await this.loadIngredientCategoryConfig();
    const categories = getSelectableIngredientCategories(categoryConfig);
    new IngredientEntryModal(this.app, {
      title: "Add ingredient override",
      ingredientLabel: "Ingredient (exact match)",
      unitLabel: "Unit override (optional)",
      includeUnit: true,
      categories,
      initialIngredient: ingredient,
      submitText: "Save",
      onSubmit: async ({ ingredient: value, category, unit }) => {
        const nextMap = new Map();
        for (const entry of parseIngredientOverrideEntries(this.settings.ingredientOverrides)) {
          nextMap.set(entry.ingredient, entry);
        }
        nextMap.set(value, { ingredient: value, category, unit });
        this.settings.ingredientOverrides = [...nextMap.values()].map(
          (v) => `${v.ingredient} | ${v.category} | ${v.unit || ""}`
        );
        await this.saveSettings();
        new Notice(`Override saved for ${value}.`);
      },
    }).open();
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
        onSubmit: (value) => resolve({ value }),
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
      throw new Error(`Plugin template not found: ${path}`);
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
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) return "";
    return raw.slice(start, end + 1);
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

  normalizeTranscribedIngredientLines(ingredientLines, { metricMode = true } = {}) {
    const cleaned = normalizeStringArray(ingredientLines).map(
      (line) => normalizeNutIngredientTerms(String(line).replace(/^[-*+]\s+/, "").trim())
    );
    const lines = [];
    for (const line of cleaned) {
      const parsed = parseIngredientLine(`- ${line}`, ACTIVE_UNIT_MAP);
      if (!parsed) {
        lines.push(normalizeNutIngredientTerms(line));
        continue;
      }
      const normalizedParsed = {
        ...parsed,
        name: normalizeNutIngredientTerms(parsed.name),
      };
      const formatted = formatIngredientLineFromParsed(normalizedParsed, {
        metricMode,
        outputLabels: ACTIVE_MEASUREMENT_PROFILE.labels,
        template: this.settings.ingredientLineTemplate,
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

  async transcribeWithOpenAI({ sourceLabel, textContext = "", imageDataUrl = "" }) {
    const apiKey = await this.resolveTranscriptionApiKey();
    if (!apiKey) {
      throw new Error("Set an OpenAI API key in plugin settings (or OPENAI_API_KEY env var).");
    }

    const model = String(this.settings.transcriptionModel || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const instruction = [
      "Transcribe a recipe into structured JSON.",
      "Return only JSON with this shape:",
      "{\"title\":\"...\",\"ingredients\":[\"...\"],\"directions\":[\"...\"],\"notes\":[\"...\"],\"prepTime\":\"...\",\"cookTime\":\"...\",\"portions\":\"...\",\"cover\":\"...\",\"link\":\"...\"}",
      "Keep ingredient and direction text concise and clean.",
      "Directions should explicitly reference ingredient names so each listed ingredient can be matched in steps.",
      "Prefer specific ingredient terms over generic ones (example: use 'pecan nuts' rather than only 'nuts').",
      "If details are missing, infer minimally and avoid fabricating specifics.",
    ].join(" ");

    const content = [
      { type: "input_text", text: instruction },
      { type: "input_text", text: `Source: ${sourceLabel}` },
    ];
    if (textContext) content.push({ type: "input_text", text: `Content:\n${textContext}` });
    if (imageDataUrl) content.push({ type: "input_image", image_url: imageDataUrl });

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
      throw new Error("Model response did not include valid JSON recipe output.");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("Could not parse JSON from model response.");
    }

    return this.normalizeTranscribedRecipeData(parsed, sourceLabel);
  }

  buildTranscribedRecipeNoteContent(recipe) {
    const ingredientsLines = recipe.ingredients.length > 0
      ? recipe.ingredients.map((line) => `- ${String(line).replace(/^[-*+]\s+/, "").trim()}`)
      : ["- "];
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
      "PortionsPerMeal: 1",
      "FrozenPortionsAvailable: 0",
      "UseFrozenFirst: true",
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

  async saveTranscribedRecipeNote(recipe) {
    const normalized = this.normalizeTranscribedRecipeData(recipe, recipe?.title || "Transcribed Recipe");
    const metricMode = this.settings.transcriptionMetricOutput !== false;
    const ingredientLines = this.normalizeTranscribedIngredientLines(normalized.ingredients, { metricMode });
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
    await this.standardizeRecipeFile(created);
    const parsed = await this.parseIngredientsFromRecipeFile(created);
    await this.saveParsedIngredientsToFrontmatter(created, parsed);
    await this.app.workspace.getLeaf(true).openFile(created);
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
      submitText: "Transcribe",
    });
    if (result.cancelled) return;

    const url = String(result.value || "").trim();
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
        textContext = `URL: ${url}\n\n${this.stripHtmlForPrompt(raw)}`;
      }
    } catch (error) {
      // If fetch fails, still send URL context to the model.
      console.warn("[weekly-meal-shopper] Could not fetch URL content for transcription:", error);
    }

    try {
      const transcribed = await this.transcribeWithOpenAI({
        sourceLabel: url,
        textContext,
      });
      const merged = mergeTranscribedRecipeData(transcribed, seed, url);
      const file = await this.saveTranscribedRecipeNote(merged);
      new Notice(`Recipe transcribed from URL and saved to ${file.path}.`);
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

    let success = 0;
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
        const recipe = await this.transcribeWithOpenAI({
          sourceLabel: file.basename,
          imageDataUrl: `data:${mime};base64,${base64}`,
        });
        await this.saveTranscribedRecipeNote(recipe);
        success += 1;
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
        ? ` ${deleted}/${success} source images deleted.`
        : "";
      const deleteErrorText = deleteFailures > 0
        ? ` ${deleteFailures} delete failed. First delete error: ${failedDeletes[0]}`
        : "";
      new Notice(
        `Image transcription complete: ${success}/${files.length} created, ${failures} failed.${deletedText}${deleteErrorText}${failures > 0 ? ` First transcription error: ${failed[0]}` : ""}`
      );
    } else {
      const deletedText = this.settings.deleteTranscribedImages
        ? ` ${deleted} source images deleted.`
        : "";
      new Notice(`Image transcription complete: ${success}/${files.length} recipes created.${deletedText}`);
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
    this.applyRecipeSplitView(content, { sourcePath: file.path });
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

    this.enableIngredientChecklist(file, leftPane);
    this.enableRecipeSectionSync(leftPane, rightPane);
    this.enableRecipeVimNavigation(rightPane);
    this.enableStepIngredientEmphasis(leftPane, rightPane);
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
    const ingredientLines = ingredientItems.map((li) => `- ${String(li.textContent || "").trim()}`);
    const sharedGenericWords = collectSharedGenericIngredientWords(ingredientLines);

    const entries = ingredientItems.map((li) => {
      const parsed = parseIngredientLine(`- ${String(li.textContent || "").trim()}`);
      const baseName = parsed?.name
        ? stripPreparationPhrases(parsed.name)
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

  async parseIngredientsFromRecipeFile(file, { force = false } = {}) {
    if (!this.parsedIngredientCache) this.parsedIngredientCache = new Map();
    const signature = this.getRecipeParseSignature(file);
    const cached = this.parsedIngredientCache.get(file.path);
    if (!force && cached && cached.signature === signature) {
      return this.cloneParsedIngredients(cached.items);
    }

    const content = await this.app.vault.read(file);
    const lines = extractIngredientsSection(content);
    const parsed = [];
    for (const line of lines) {
      const item = parseIngredientLine(line);
      if (!item) continue;
      parsed.push(applyMeasurementPreferenceToParsedItem(item));
    }

    this.parsedIngredientCache.set(file.path, {
      signature,
      items: this.cloneParsedIngredients(parsed),
    });
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

  async standardizeRecipeFile(file) {
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
      frontmatter.PortionsPerMeal = frontmatter.PortionsPerMeal ?? 1;
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
    sectionMap.ingredients = normalizeIngredientsSectionLines(sectionMap.ingredients);
    sectionMap.directions = normalizeDirectionsSectionLines(sectionMap.directions, sectionMap.ingredients);
    const standardizedBody = buildStandardBody(sectionMap);

    const rewritten = `${split.frontmatterRaw}\n\n${standardizedBody}`;
    if (rewritten === original) return false;

    await this.app.vault.modify(file, rewritten);
    this.invalidateRecipeParseCache(file.path);

    const parsedIngredients = await this.parseIngredientsFromRecipeFile(file, { force: true });
    await this.saveParsedIngredientsToFrontmatter(file, parsedIngredients);

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

    let parsed = this.extractParsedIngredientsFromFrontmatter(file);
    const hasSuspiciousParsedNames = parsed.some((item) => looksLikePreparationOnlyName(item.name));
    if (parsed.length === 0 || hasSuspiciousParsedNames) {
      const extracted = await this.parseIngredientsFromRecipeFile(file);
      if (extracted.length > 0) {
        await this.saveParsedIngredientsToFrontmatter(file, extracted);
      }

      parsed = extracted.map((item, idx) => ({
        name: item.name,
        canonicalName: item.canonicalName,
        unitMetric: item.unitMetric,
        amountMetric: item.amountMetric,
        quantityUnknown: !!item.quantityUnknown,
        sourceRecipePath: file.path,
        sourceIndex: idx,
      }));
    } else {
      parsed = parsed.map((item, idx) => ({
        ...item,
        sourceRecipePath: item.sourceRecipePath || file.path,
        sourceIndex: Number.isFinite(item.sourceIndex) ? item.sourceIndex : idx,
      }));
    }

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
    const portionsPerMeal = Math.max(1, parseNumberLike(fm.PortionsPerMeal, 1));
    const frozenAvailable = Math.max(0, parseNumberLike(fm.FrozenPortionsAvailable, 0));
    const useFrozenFirst = parseBooleanLike(fm.UseFrozenFirst, true);

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
      "      - PortionsPerMeal",
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

  async ensureUnitAliasConfigFile() {
    const configPath = normalizePath(UNIT_ALIAS_CONFIG_PATH);
    const exists = await this.app.vault.adapter.exists(configPath);
    if (exists) return;
    await this.app.vault.adapter.write(
      configPath,
      `${JSON.stringify(DEFAULT_UNIT_ALIAS_CONFIG, null, 2)}\n`
    );
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
    let canvasFile = null;

    if (active && active.extension === "canvas") {
      canvasFile = active;
    } else {
      const configured = normalizePath(this.settings.weeklyCanvasPath);
      const found = this.app.vault.getAbstractFileByPath(configured);
      if (found instanceof TFile && found.extension === "canvas") {
        canvasFile = found;
      }
    }

    if (!canvasFile) {
      new Notice("Weekly meal-plan canvas not found. Set it in plugin settings or open a canvas first.");
      return;
    }

    const canvasText = await this.app.vault.read(canvasFile);
    const recipeEntries = parseCanvasRecipeEntries(canvasText);
    if (recipeEntries.length === 0) {
      new Notice("No recipe files found on the selected canvas.");
      return;
    }

    const recipes = new Map();
    for (const entry of recipeEntries) {
      const rawPath = entry.rawPath;
      let file = this.app.vault.getAbstractFileByPath(normalizePath(rawPath));
      if (!(file instanceof TFile)) {
        const linkDest = this.app.metadataCache.getFirstLinkpathDest(rawPath, canvasFile.path);
        if (linkDest) file = linkDest;
      }
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      if (!this.isRecipeFile(file)) continue;
      const existing = recipes.get(file.path);
      if (existing) {
        if (entry.section === "project") existing.projectCount += 1;
        else if (entry.section === "hosting") existing.hostingCount += 1;
        else existing.defaultCount += 1;
      } else {
        recipes.set(file.path, {
          file,
          defaultCount: entry.section === "default" ? 1 : 0,
          projectCount: entry.section === "project" ? 1 : 0,
          hostingCount: entry.section === "hosting" ? 1 : 0,
        });
      }
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
        if (result.cancelled) return;
        if (result.error) {
          new Notice(result.error);
          return;
        }
        projectServingsTargets.set(file.path, result.value);
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

    for (const { file, defaultCount, projectCount, hostingCount } of recipes.values()) {
      const profile = this.getRecipePlanningProfile(file, defaultCount);
      const ingredients = await this.getRecipeIngredients(file);
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
      for (const item of ingredients) {
        const displayName = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
        if (shouldExcludeIngredientExact(displayName, exactExclusions)) continue;
        const override = ingredientOverrides.get(displayName);
        const overrideCategory = String(override?.category || "").trim();
        const categoryLocked = !!overrideCategory;
        const classified = overrideCategory
          ? { category: overrideCategory, reason: "manual override" }
          : classifyIngredientCategoryWithReason(displayName, categoryConfig);
        const category = classified.category;
        const aggName = normalizedAggregationName(displayName) || item.canonicalName;
        const key = `${aggName}::${item.unitMetric}::${item.quantityUnknown ? "unknown" : "known"}`;
        const existing = totals.get(key) || {
          name: displayName,
          unit: item.unitMetric,
          amount: 0,
          quantityUnknown: false,
          recipes: new Set(),
          category,
          categoryLocked,
          categoryReason: classified.reason,
        };
        existing.amount += item.amountMetric * totalBatches;
        existing.quantityUnknown = existing.quantityUnknown || !!item.quantityUnknown;
        existing.recipes.add(file.basename);
        if (!existing.categoryReason && classified.reason) existing.categoryReason = classified.reason;
        if (categoryLocked) {
          existing.category = category;
          existing.categoryLocked = true;
          existing.categoryReason = "manual override";
        } else if ((!existing.category || existing.category === "Other") && category !== "Other") {
          existing.category = category;
          existing.categoryReason = classified.reason;
        }
        totals.set(key, existing);
      }
    }

    const rawItems = [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
    const garlicItems = [];
    const citrusRollup = new Map();
    const totalItems = [];

    for (const item of rawItems) {
      const displayName = normalizeShoppingDisplayName(stripPreparationPhrases(item.name));
      const normalizedDisplayName = normalizeSearchText(displayName);
      const citrusKey = detectCitrusKey(displayName);
      const garlicCandidate = isGarlicRollupCandidate(displayName) && !item.quantityUnknown && ["ml", "unit"].includes(item.unit);

      if (garlicCandidate) {
        garlicItems.push({
          ...item,
          name: displayName,
        });
        continue;
      }

      if (!citrusKey) {
        if (item.quantityUnknown) {
          totalItems.push({
            ...item,
            name: displayName,
            unit: "",
            amount: 0,
            quantityUnknown: true,
          });
          continue;
        }
        const adjustedAmount =
          item.unit === "unit" && shouldRoundUpUnitItem(displayName)
            ? Math.ceil(item.amount)
            : item.amount;
        const override = ingredientOverrides.get(displayName);
        const converted = convertBaseAmountToPreferredUnit(adjustedAmount, item.unit, override?.unit || "");
        totalItems.push({
          ...item,
          name: displayName,
          amount: converted.amount,
          unit: converted.unit,
        });
        continue;
      }

      const citrus = citrusRollup.get(citrusKey) || {
        key: citrusKey,
        category: item.category || "Fresh Fruit and Vegetables",
        wholeFromJuice: 0,
        wholeExplicit: 0,
      };

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
        totalItems.push({
          ...item,
          name: displayName,
          amount: adjustedAmount,
        });
      }

      citrusRollup.set(citrusKey, citrus);
    }

    const garlicRollupItem = buildGarlicRollupItem(garlicItems);
    if (garlicRollupItem) totalItems.push(garlicRollupItem);

    for (const citrus of citrusRollup.values()) {
      const rule = CITRUS_RULES[citrus.key];
      const neededWhole = Math.max(citrus.wholeFromJuice, citrus.wholeExplicit);
      const roundedWhole = Math.max(1, Math.ceil(neededWhole));
      const singular = rule.singular;
      const plural = rule.plural;
      totalItems.push({
        name: roundedWhole === 1 ? singular : plural,
        unit: "unit",
        amount: roundedWhole,
        recipes: new Set(),
        category: citrus.category || "Fresh Fruit and Vegetables",
        categoryReason: "citrus rollup",
      });
    }

    const categoryOrder = Array.isArray(categoryConfig.categoryOrder) && categoryConfig.categoryOrder.length
      ? categoryConfig.categoryOrder
      : SHOPPING_CATEGORY_ORDER;
    const grouped = new Map();
    const orderedCategories = [...categoryOrder];
    for (const category of orderedCategories) grouped.set(category, []);
    for (const item of totalItems) {
      const category = String(item.category || categoryConfig.defaultCategory || "Other");
      if (!grouped.has(category)) {
        grouped.set(category, []);
        orderedCategories.push(category);
      }
      grouped.get(category).push(item);
    }

    const groupedIngredientLines = [];
    const overrideUri = this.getCommandUri("add-ingredient-override-from-current-shopping-line");
    for (const category of orderedCategories) {
      const items = grouped.get(category) || [];
      if (items.length === 0) continue;
      groupedIngredientLines.push(`- ${category}`);
      const noAmountCategory =
        category === "Spices and Seasoning" || category === "Herbs, Spices and Seasonings";
      for (const item of items) {
        const whySuffix = this.settings.showCategoryReasonsInShoppingList
          ? ` _(why: ${item.categoryReason || "default category"})_`
          : "";
        const overrideSuffix = this.settings.includeOverrideLinksInShoppingList
          ? ` [Override](${overrideUri})`
          : "";
        if (noAmountCategory) {
          groupedIngredientLines.push(`  - [ ] ${item.name}${whySuffix}${overrideSuffix}`);
          continue;
        }
        if (item.quantityUnknown) {
          groupedIngredientLines.push(`  - [ ] ${item.name}${whySuffix}${overrideSuffix}`);
          continue;
        }
        if (item.unit === "unit") {
          const roundedAmount = shouldRoundUpUnitItem(item.name) ? Math.ceil(item.amount) : item.amount;
          const displayName = pluralizeSimple(singularizeSimple(item.name), roundedAmount);
          groupedIngredientLines.push(
            `  - [ ] (${formatMetricAmount(roundedAmount)}) ${displayName}${whySuffix}${overrideSuffix}`
          );
        } else {
          groupedIngredientLines.push(
            `  - [ ] (${formatMetricAmount(item.amount)} ${item.unit}) ${item.name}${whySuffix}${overrideSuffix}`
          );
        }
      }
    }

    const generated = [
      "# Weekly Shopping List",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Canvas: [[${canvasFile.path}|${canvasFile.basename}]]`,
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
      groupedIngredientLines.join("\n") || "- [ ] (No ingredients needed (covered by frozen leftovers))",
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

    new Notice(`Shopping list created with ${totalItems.length} aggregated ingredients.`);
  }
}

class WeeklyMealShopperSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  buildFoldableSection(containerEl, { title, description, searchPlaceholder }) {
    const section = containerEl.createDiv({ cls: "weekly-meal-shopper-list-section weekly-meal-shopper-foldable is-collapsed" });
    const header = section.createEl("button", {
      cls: "weekly-meal-shopper-foldable-toggle weekly-meal-shopper-heading is-collapsed",
    });
    header.type = "button";
    header.setAttribute("aria-expanded", "false");

    const titleRow = header.createDiv({ cls: "weekly-meal-shopper-heading-title-row" });
    titleRow.createSpan({ cls: "weekly-meal-shopper-collapse-indicator", text: "▶" });
    titleRow.createSpan({ cls: "weekly-meal-shopper-heading-title", text: title });

    if (description) {
      header.createDiv({ cls: "weekly-meal-shopper-heading-description", text: description });
    }

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
    if (description) {
      containerEl.createEl("p", { text: description, cls: "weekly-meal-shopper-help" });
    }
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
      description: "Canvas paths, naming, and shopping-list behavior.",
    });

    new Setting(mealPrepBody)
      .setName("Weekly meal-plan canvas")
      .setDesc("Canvas file used for recipe aggregation when no canvas is currently open.")
      .addText((text) =>
        text
          .setPlaceholder("Utility/⛑️ Weekly Meal Plan.canvas")
          .setValue(this.plugin.settings.weeklyCanvasPath)
          .onChange(async (value) => {
            this.plugin.settings.weeklyCanvasPath = value.trim();
              await this.plugin.saveSettings();
          })
      );

    new Setting(mealPrepBody)
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

    new Setting(mealPrepBody)
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

    new Setting(mealPrepBody)
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

    new Setting(mealPrepBody)
      .setName("Show category reason in shopping list")
      .setDesc("Adds '(why: ...)' annotations next to each generated shopping item.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showCategoryReasonsInShoppingList !== false)
          .onChange(async (value) => {
            this.plugin.settings.showCategoryReasonsInShoppingList = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(mealPrepBody)
      .setName("Add one-click override links")
      .setDesc("Adds an Override link on each shopping item to quickly save an ingredient override.")
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
          .setValue(this.plugin.settings.measurementPreference || "weight")
          .onChange(async (value) => {
            this.plugin.settings.measurementPreference = value === "volume" ? "volume" : "weight";
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

    new Setting(ingredientFormatBody)
      .setName("Cup shorthand")
      .setDesc("Display shorthand used when standardizing ingredient lines.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("cup", "cup")
          .addOption("cups", "cups")
          .addOption("c", "c")
          .setValue(this.plugin.settings.cupShorthand || "cup")
          .onChange(async (value) => {
            this.plugin.settings.cupShorthand = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(ingredientFormatBody)
      .setName("Tablespoon shorthand")
      .setDesc("Display shorthand used when standardizing ingredient lines.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("tbsp", "tbsp")
          .addOption("tablespoon", "tablespoon")
          .addOption("tablespoons", "tablespoons")
          .addOption("tbs", "tbs")
          .setValue(this.plugin.settings.tbspShorthand || "tbsp")
          .onChange(async (value) => {
            this.plugin.settings.tbspShorthand = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(ingredientFormatBody)
      .setName("Teaspoon shorthand")
      .setDesc("Display shorthand used when standardizing ingredient lines.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("tsp", "tsp")
          .addOption("teaspoon", "teaspoon")
          .addOption("teaspoons", "teaspoons")
          .setValue(this.plugin.settings.tspShorthand || "tsp")
          .onChange(async (value) => {
            this.plugin.settings.tspShorthand = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(ingredientFormatBody)
      .setName("Ingredient line template")
      .setDesc("Placeholders: {{Amount}} {{Unit}} {{Ingredient}} {{Preparation}} {{PreparationSuffix}}")
      .addText((text) =>
        text
          .setPlaceholder("{{Amount}} {{Unit}} {{Ingredient}}")
          .setValue(this.plugin.settings.ingredientLineTemplate || "{{Amount}} {{Unit}} {{Ingredient}}")
          .onChange(async (value) => {
            this.plugin.settings.ingredientLineTemplate = normalizeIngredientLineTemplate(value);
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
      title: "Maintenance",
      description: "Backup and restore plugin settings when you want to move or reset your setup.",
    });

    const { body: importExportBody } = this.buildFoldableSection(containerEl, {
      stateKey: "settingsImportExportCollapsed",
      title: "Settings import/export",
      description: "Backup and restore the full plugin settings JSON.",
    });

    new Setting(importExportBody)
      .setName("Settings JSON path")
      .setDesc("Export/import full plugin settings as JSON for backups and presets.")
      .addText((text) =>
        text
          .setPlaceholder(".obsidian/plugins/weekly-meal-shopper/settings-export.json")
          .setValue(this.plugin.settings.settingsImportExportPath || ".obsidian/plugins/weekly-meal-shopper/settings-export.json")
          .onChange(async (value) => {
            this.plugin.settings.settingsImportExportPath = value.trim() || ".obsidian/plugins/weekly-meal-shopper/settings-export.json";
            await this.plugin.saveSettings();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Export").onClick(async () => {
          try {
            const path = await this.plugin.exportSettingsToJson(this.plugin.settings.settingsImportExportPath);
            new Notice(`Settings exported: ${path}`);
          } catch (error) {
            new Notice(`Export failed: ${error?.message || String(error)}`);
          }
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Import").setWarning().onClick(async () => {
          try {
            const path = await this.plugin.importSettingsFromJson(this.plugin.settings.settingsImportExportPath);
            new Notice(`Settings imported: ${path}`);
            await this.display();
          } catch (error) {
            new Notice(`Import failed: ${error?.message || String(error)}`);
          }
        })
      );

    this.renderCategoryHeading(containerEl, {
      title: "Ingredient Rules",
      description: "Classification categories, exclusions, and overrides are grouped here.",
    });

    this.renderShoppingCategoriesSection(containerEl, categoryConfig);
    this.renderExcludedIngredientsSection(containerEl, categories);
    this.renderIngredientOverridesSection(containerEl, categories);

    this.renderCategoryHeading(containerEl, {
      title: "First-Time Setup",
      description: "Use this once to choose where the editable template copies should live in your vault, then open those files whenever you want to customize them.",
    });

    const { body: firstTimeSetupBody } = this.buildFoldableSection(containerEl, {
      stateKey: "firstTimeSetupCollapsed",
      title: "Template setup",
      description: "The setup popup saves both vault locations and populates both editable templates from the bundled plugin base.",
    });

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
      title: "Exclude ingredients (exact names)",
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

    const renderList = () => {
      listEl.empty();
      const entries = [...parseExcludedIngredients(this.plugin.settings.excludedIngredientsExact).values()]
        .filter((entry) => normalizeSearchText(entry.ingredient).includes(searchQuery));
      if (entries.length === 0) {
        listEl.createEl("div", { text: "No excluded ingredients match the current search.", cls: "weekly-meal-shopper-empty" });
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

    addBtn.addEventListener("click", () => {
      new IngredientEntryModal(this.app, {
        title: "Add excluded ingredient",
        ingredientLabel: "Ingredient (exact match)",
        categories: [],
        requireCategory: false,
        submitText: "Add",
        onSubmit: async ({ ingredient, category }) => {
          const map = parseExcludedIngredients(this.plugin.settings.excludedIngredientsExact);
          map.set(normalizeSearchText(ingredient), { ingredient, category });
          this.plugin.settings.excludedIngredientsExact = [...map.values()].map(
            (v) => `${v.ingredient} | ${v.category}`
          );
          await this.plugin.saveSettings();
          renderList();
        },
      }).open();
    });

    renderList();
  }

  renderIngredientOverridesSection(containerEl, categories) {
    const { body, searchInput } = this.buildFoldableSection(containerEl, {
      stateKey: "ingredientOverridesCollapsed",
      title: "Ingredient overrides (exact)",
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

    const renderList = () => {
      listEl.empty();
      const entries = parseIngredientOverrideEntries(this.plugin.settings.ingredientOverrides)
        .filter((entry) => normalizeSearchText(entry.ingredient).includes(searchQuery));
      if (entries.length === 0) {
        listEl.createEl("div", { text: "No ingredient overrides match the current search.", cls: "weekly-meal-shopper-empty" });
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

    addBtn.addEventListener("click", () => {
      new IngredientEntryModal(this.app, {
        title: "Add ingredient override",
        ingredientLabel: "Ingredient (exact match)",
        unitLabel: "Unit override (optional)",
        includeUnit: true,
        categories,
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
