const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const shouldShow = ctx.shouldShowSpiceAmount;

test("tiny pinch-style spice amounts stay hidden", () => {
  assert.equal(shouldShow({ unit: "tsp", amount: 1 }), false); // 5 ml
  assert.equal(shouldShow({ unit: "tsp", amount: 3 }), false); // 15 ml threshold (inclusive)
  assert.equal(shouldShow({ unit: "ml", amount: 10 }), false);
  assert.equal(shouldShow({ unit: "g", amount: 5 }), false);
  assert.equal(shouldShow({ unit: "g", amount: 15 }), false);
});

test("meaningful spice weights and volumes are shown", () => {
  assert.equal(shouldShow({ unit: "g", amount: 100 }), true); // 100 g saffron
  assert.equal(shouldShow({ unit: "g", amount: 16 }), true);
  assert.equal(shouldShow({ unit: "tbsp", amount: 2 }), true); // 30 ml
  assert.equal(shouldShow({ unit: "tsp", amount: 4 }), true); // 20 ml
  assert.equal(shouldShow({ unit: "cup", amount: 0.5 }), true); // 125 ml
});

test("discrete and unknown units are always shown", () => {
  assert.equal(shouldShow({ unit: "unit", amount: 2 }), true);
  assert.equal(shouldShow({ unit: "bunch", amount: 1 }), true);
  assert.equal(shouldShow({ unit: "can", amount: 1 }), true);
});

test("unknown-quantity and non-positive amounts are not shown", () => {
  assert.equal(shouldShow({ unit: "g", amount: 0, quantityUnknown: true }), false);
  assert.equal(shouldShow({ unit: "g", amount: 0 }), false);
  assert.equal(shouldShow(null), false);
});
