const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();

test("normalizeEnergyUnit accepts kcal/kJ and defaults anything else to kcal", () => {
  assert.equal(ctx.normalizeEnergyUnit("kcal"), "kcal");
  assert.equal(ctx.normalizeEnergyUnit("kJ"), "kJ");
  assert.equal(ctx.normalizeEnergyUnit("kj"), "kJ");
  assert.equal(ctx.normalizeEnergyUnit("KJ"), "kJ");
  assert.equal(ctx.normalizeEnergyUnit(""), "kcal");
  assert.equal(ctx.normalizeEnergyUnit(undefined), "kcal");
  assert.equal(ctx.normalizeEnergyUnit("garbage"), "kcal");
});

test("convertKcalToDisplayEnergy passes kcal through and multiplies kJ by 4.184", () => {
  assert.equal(ctx.convertKcalToDisplayEnergy(100, "kcal"), 100);
  assert.ok(Math.abs(ctx.convertKcalToDisplayEnergy(100, "kJ") - 418.4) < 1e-9);
  assert.equal(ctx.convertKcalToDisplayEnergy(0, "kJ"), 0);
});

test("convertKcalToDisplayEnergy returns 0 for non-finite input instead of NaN", () => {
  assert.equal(ctx.convertKcalToDisplayEnergy(undefined, "kcal"), 0);
  assert.equal(ctx.convertKcalToDisplayEnergy(null, "kJ"), 0);
});

test("setActiveMeasurementProfile sets ACTIVE_ENERGY_UNIT from settings independently of measurementPreference", () => {
  ctx.setActiveMeasurementProfile({ energyUnit: "kJ", measurementPreference: "weight" });
  assert.ok(
    Math.abs(ctx.convertKcalToDisplayEnergy(200) - 836.8) < 1e-9,
    "should use the just-activated kJ unit as the default"
  );

  ctx.setActiveMeasurementProfile({ energyUnit: "kcal", measurementPreference: "volume" });
  assert.equal(ctx.convertKcalToDisplayEnergy(200), 200);
});
