const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

// This file mutates the ACTIVE_* globals via setActiveMeasurementProfile, so it
// uses its own context to avoid affecting other test files.
const ctx = loadMainContext();

test("recipe view shows legumes in dried grams (no ml) when mode is dried", () => {
  ctx.setActiveMeasurementProfile({
    measurementPreset: "vault_standard",
    measurementPreference: "weight",
    legumeShoppingMode: "dried",
  });
  try {
    const parsed = ctx.parseIngredientLine("- 1 ; can ; chickpeas ;");
    const line = ctx.formatRecipeViewIngredientDisplay(parsed);
    assert.match(line, /\b85 g\b/);
    assert.match(line, /chickpeas/);
    assert.doesNotMatch(line, /\bml\b/, "recipe view should not show the storage ml");
    assert.doesNotMatch(line, /\bcan\b/, "recipe view should not show 'can'");
  } finally {
    ctx.setActiveMeasurementProfile({ measurementPreset: "vault_standard", measurementPreference: "weight", legumeShoppingMode: "canned" });
  }
});

test("recipe view honours custom dried-grams-per-can", () => {
  ctx.setActiveMeasurementProfile({
    measurementPreset: "vault_standard",
    measurementPreference: "weight",
    legumeShoppingMode: "dried",
    legumeGramsDriedPerCan: 100,
  });
  try {
    const parsed = ctx.parseIngredientLine("- 2 ; can ; black beans ;");
    const line = ctx.formatRecipeViewIngredientDisplay(parsed);
    assert.match(line, /\b200 g\b/); // 2 * 100
  } finally {
    ctx.setActiveMeasurementProfile({ measurementPreset: "vault_standard", measurementPreference: "weight", legumeShoppingMode: "canned" });
  }
});

test("recipe view leaves legumes untouched in canned mode", () => {
  ctx.setActiveMeasurementProfile({ measurementPreset: "vault_standard", measurementPreference: "weight", legumeShoppingMode: "canned" });
  const parsed = ctx.parseIngredientLine("- 1 ; can ; chickpeas ;");
  const line = ctx.formatRecipeViewIngredientDisplay(parsed);
  assert.doesNotMatch(line, /85 g/);
});
