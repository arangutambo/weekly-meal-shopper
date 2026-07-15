const assert = require("node:assert/strict");
const test = require("node:test");

const { loadMainContext } = require("./helpers/load-main-testables");

const ctx = loadMainContext();
const norm = ctx.normalizedAggregationName;

test("plural compound nouns collapse to singular across the whole phrase", () => {
  assert.equal(norm("cherry tomatoes"), norm("cherry tomato"));
  assert.equal(norm("spring onions"), norm("spring onion"));
  assert.equal(norm("chicken thighs"), norm("chicken thigh"));
});

test("leading descriptor adjectives are stripped so variants aggregate together", () => {
  assert.equal(norm("baby spinach"), norm("spinach"));
  assert.equal(norm("plain flour"), norm("flour"));
  assert.equal(norm("whole milk"), norm("milk"));
  assert.equal(norm("raw cashews"), norm("cashew"));
  assert.equal(norm("ripe avocados"), norm("avocado"));
});

test("'fresh' is stripped only for herbs that are fresh by default", () => {
  // basil/parsley/mint are fresh by default, so fresh X == bare X
  assert.equal(norm("fresh basil"), norm("basil"));
  assert.equal(norm("fresh parsley"), norm("parsley"));
  assert.equal(norm("fresh chives"), norm("chives"));
  // oregano/thyme are dried by default, so fresh X stays distinct
  assert.notEqual(norm("fresh oregano"), norm("oregano"));
  assert.notEqual(norm("fresh thyme"), norm("thyme"));
});

test("descriptor stripping never collapses a name to nothing", () => {
  assert.equal(norm("fresh"), "fresh");
  assert.equal(norm("baby"), "baby");
});

test("meaningful qualifiers that change the product are NOT merged", () => {
  // brown vs white sugar are different shopping items
  assert.notEqual(norm("brown sugar"), norm("white sugar"));
  assert.notEqual(norm("brown sugar"), norm("sugar"));
  // dried vs fresh herbs/fruit are different products (neither is stripped)
  assert.notEqual(norm("dried oregano"), norm("oregano"));
  assert.notEqual(norm("dried cranberries"), norm("cranberries"));
  // "fresh" is kept too: fresh oregano is a separate item from bare (dried) oregano
  assert.notEqual(norm("fresh oregano"), norm("oregano"));
  assert.notEqual(norm("fresh oregano"), norm("dried oregano"));
  // self raising flour stays distinct from plain/standard flour
  assert.notEqual(norm("self raising flour"), norm("flour"));
});

test("descriptor stripping only applies to leading words", () => {
  // "baby" only stripped at the front; an internal token is left alone
  assert.equal(norm("spinach baby"), "spinach baby");
});
