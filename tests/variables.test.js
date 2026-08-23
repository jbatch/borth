import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source) {
  const output = [];

  run(source, {
    write: (value) => output.push(value),
  });

  return output;
}

test("variables default to zero", () => {
  assert.deepEqual(outputOf("variable score score @ print"), [0]);
});

test("variables can store and fetch values", () => {
  assert.deepEqual(outputOf("variable score 10 score ! score @ print"), [10]);
});

test("variables can store strings", () => {
  assert.deepEqual(
    outputOf('variable name "borth" name ! name @ print'),
    ["borth"],
  );
});

test("variable addresses can be passed to user-defined words", () => {
  assert.deepEqual(
    outputOf(`
      : increment
        dup @ 1 + swap !
      ;

      variable score
      41 score !
      score increment
      score @ print
    `),
    [42],
  );
});

test("variable declarations are global words", () => {
  assert.deepEqual(
    outputOf(`
      variable score

      : print-score
        score @ print
      ;

      7 score !
      print-score
    `),
    [7],
  );
});

test("variables cannot redefine existing words", () => {
  assert.throws(
    () =>
      outputOf(`
        variable score
        variable score
      `),
    /word already defined: score/,
  );
});

test("definitions cannot redefine variables", () => {
  assert.throws(
    () =>
      outputOf(`
        variable score
        : score
          1
        ;
      `),
    /word already defined: score/,
  );
});

test("variable declarations are only supported at top level", () => {
  assert.throws(
    () =>
      outputOf(`
        : broken
          variable score
        ;
      `),
    /variable declarations are only supported at top level/,
  );
});

test("fetch requires an address", () => {
  assert.throws(() => outputOf("1 @"), /FETCH requires an address/);
});

test("store requires an address", () => {
  assert.throws(() => outputOf("1 2 !"), /STORE requires an address/);
});
