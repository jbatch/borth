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
