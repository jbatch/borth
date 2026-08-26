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

test("prelude boolean words normalize numeric flags", () => {
  assert.deepEqual(
    outputOf(`
      0 not print
      99 not print
      1 2 and print
      1 0 and print
      0 7 or print
      0 0 or print
    `),
    [1, 0, 1, 0, 1, 0],
  );
});

test("prelude stack helpers work on any stack values", () => {
  assert.deepEqual(
    outputOf(`
      1 "keep" nip print
      "a" "b" tuck .s
    `),
    ["keep", '["b" "a" "b"]'],
  );
});

test("2dup copies the top two stack values", () => {
  assert.deepEqual(outputOf('1 "x" 2dup .s'), ['[1 "x" 1 "x"]']);
});

test("rot moves the third value to the top", () => {
  assert.deepEqual(outputOf("1 2 3 rot .s"), ["[2 3 1]"]);
});

test("roll moves a deeper stack value to the top", () => {
  assert.deepEqual(outputOf("1 2 3 0 roll .s"), ["[1 2 3]"]);
  assert.deepEqual(outputOf("1 2 3 1 roll .s"), ["[1 3 2]"]);
  assert.deepEqual(outputOf("1 2 3 2 roll .s"), ["[2 3 1]"]);
  assert.deepEqual(outputOf("1 2 3 4 3 roll .s"), ["[2 3 4 1]"]);
});

test("-roll moves the top value down to a deeper stack position", () => {
  assert.deepEqual(outputOf("1 2 3 0 -roll .s"), ["[1 2 3]"]);
  assert.deepEqual(outputOf("1 3 2 1 -roll .s"), ["[1 2 3]"]);
  assert.deepEqual(outputOf("2 3 1 2 -roll .s"), ["[1 2 3]"]);
  assert.deepEqual(outputOf("2 3 4 1 3 -roll .s"), ["[1 2 3 4]"]);
});

test("roll depth must be available on the stack", () => {
  assert.throws(() => outputOf("roll"), /ROLL requires a value on the stack/);
});

test("roll depth must be a non-negative integer", () => {
  assert.throws(
    () => outputOf('"x" roll'),
    /ROLL requires numbers on the stack/,
  );
  assert.throws(
    () => outputOf("1 -1 roll"),
    /ROLL requires depth to be a non-negative integer/,
  );
});

test("roll requires enough stack values below its depth", () => {
  assert.throws(() => outputOf("1 2 roll"), /ROLL requires 3 values/);
  assert.throws(() => outputOf("1 2 -roll"), /-ROLL requires 3 values/);
});

test("prelude words cannot be redefined by user programs", () => {
  assert.throws(
    () =>
      outputOf(`
        : not
          123
        ;
      `),
    /word already defined: not/,
  );
});
