const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const parse = (line) => ctx.parseIngredientLine(line);

test("plain count line with a name containing 'to' still parses (regression: 2 tomatoes)", () => {
  const p = parse("- 2 tomatoes");
  assert.ok(p, "expected a parsed result, not null");
  assert.equal(p.amount, 2);
  assert.equal(p.name, "tomatoes");
  assert.equal(p.quantityUnknown, false);
});

test("quantity ranges resolve to their midpoint", () => {
  const dash = parse("- 1-2 tbsp olive oil");
  assert.ok(dash);
  assert.equal(dash.amount, 1.5);
  assert.equal(dash.unit, "tbsp");
  assert.equal(dash.name, "olive oil");

  const word = parse("- 1 to 2 cups stock");
  assert.ok(word);
  assert.equal(word.amount, 1.5);
  assert.equal(word.unit, "cups");
  assert.equal(word.name, "stock");
});

test("'a handful of X' / 'a pinch of X' rewrite to a usable quantity", () => {
  const handful = parse("- a handful of spinach");
  assert.ok(handful);
  assert.equal(handful.name, "spinach");
  assert.notEqual(handful.quantityUnknown, true);

  const pinch = parse("- a pinch of salt");
  assert.ok(pinch);
  assert.equal(pinch.name, "salt");
});

test("'N x SIZE cans X' multiplier phrasing normalises to a can count", () => {
  for (const line of ["- 2 × 400g cans chickpeas", "- 2 x 400g cans chickpeas"]) {
    const p = parse(line);
    assert.ok(p, `expected parse for ${line}`);
    assert.equal(p.amount, 2);
    assert.match(p.unit, /^cans?$/);
    assert.equal(p.name, "chickpeas");
    assert.match(p.preparation, /400/);
  }
});

test("'to taste' lines remain quantity-unknown with a clean ingredient name", () => {
  const p = parse("- salt to taste");
  assert.ok(p);
  assert.equal(p.name, "salt");
  assert.equal(p.quantityUnknown, true);
});
