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

test("if runs its body for a non-zero flag", () => {
  assert.deepEqual(outputOf("1 if 111 print end"), [111]);
});

test("if skips its body for a zero flag", () => {
  assert.deepEqual(outputOf("0 if 111 print end"), []);
});

test("if else runs the true branch for a non-zero flag", () => {
  assert.deepEqual(outputOf("1 if 111 print else 222 print end"), [111]);
});

test("if else runs the false branch for a zero flag", () => {
  assert.deepEqual(outputOf("0 if 111 print else 222 print end"), [222]);
});

test("else belongs to the nearest unmatched if", () => {
  assert.deepEqual(
    outputOf("1 if 0 if 111 print else 222 print end else 333 print end"),
    [222],
  );
});

test("else after a closed inner if belongs to the outer if", () => {
  assert.deepEqual(
    outputOf("0 if 1 if 111 print end else 222 print end"),
    [222],
  );
});

test("else without if throws", () => {
  assert.throws(() => outputOf("else"), /else without matching if/);
});

test("duplicate else throws", () => {
  assert.throws(
    () => outputOf("1 if 111 print else 222 print else 333 print end"),
    /else after else/,
  );
});

test("if without end throws", () => {
  assert.throws(
    () => outputOf("1 if 111 print else 222 print"),
    /if without matching end/,
  );
});
