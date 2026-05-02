const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

function buildProfile(settings) {
  return ctx.resolveMeasurementProfile({
    measurementPreset: settings.measurementPreset,
    cupMl: settings.cupMl,
    tbspMl: settings.tbspMl,
    tspMl: settings.tspMl,
  });
}

test("AU and US preset volume conversions parse as expected", () => {
  const auMap = ctx.buildUnitMapFromProfile(buildProfile({ measurementPreset: "australian" }));
  const usMap = ctx.buildUnitMapFromProfile(buildProfile({ measurementPreset: "us_customary" }));

  const auTbsp = ctx.parseIngredientLine("- 1 tbsp olive oil", auMap);
  const usTbsp = ctx.parseIngredientLine("- 1 tbsp olive oil", usMap);
  const usCup = ctx.parseIngredientLine("- 1 cup flour", usMap);

  assert.equal(auTbsp.amountMetric, 20);
  assert.equal(usTbsp.amountMetric, 14.79);
  assert.equal(usCup.amountMetric, 236.59);
});

test("temperature conversion adds metric + fan-forced values for oven lines", () => {
  const converted = ctx.convertDirectionTemperaturesToMetric("Preheat oven to 350F and bake for 20 minutes.");
  assert.match(converted, /177\u00b0C \(fan 157\u00b0C\)/);
});

test("both measurement preference keeps the original volume and appends converted weight", () => {
  const parsed = ctx.parseIngredientLine("- 1 cup olive oil");
  const line = ctx.formatIngredientLineFromParsed(parsed, {
    metricMode: false,
    measurementPreference: "both",
  });

  assert.equal(line, "- 1 cup (228 g) olive oil");
});

test("both measurement preference falls back to original output when no density conversion exists", () => {
  const parsed = ctx.parseIngredientLine("- 1 cup breadcrumbs");
  const line = ctx.formatIngredientLineFromParsed(parsed, {
    metricMode: false,
    measurementPreference: "both",
  });

  assert.equal(line, "- 1 cup breadcrumbs");
});

test("cup output uses singular and plural labels automatically", () => {
  const single = ctx.formatIngredientLineFromParsed(ctx.parseIngredientLine("- 1 cup flour"), {
    metricMode: false,
    measurementPreference: "volume",
  });
  const plural = ctx.formatIngredientLineFromParsed(ctx.parseIngredientLine("- 2 cup flour"), {
    metricMode: false,
    measurementPreference: "volume",
  });

  assert.equal(single, "- 1 cup flour");
  assert.equal(plural, "- 2 cups flour");
});

test("tbsp and tsp output are fixed shorthands during normalization", () => {
  const tbspLine = ctx.formatIngredientLineFromParsed(ctx.parseIngredientLine("- 1 tablespoon flour"), {
    metricMode: false,
    measurementPreference: "volume",
  });
  const tspLine = ctx.formatIngredientLineFromParsed(ctx.parseIngredientLine("- 2 teaspoons baking powder"), {
    metricMode: false,
    measurementPreference: "volume",
  });

  assert.equal(tbspLine, "- 1 tbsp flour");
  assert.equal(tspLine, "- 2 tsp baking powder");
});
