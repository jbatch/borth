import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source, randomValues) {
  const output = [];
  const values = [...randomValues];

  run(source, {
    random: () => {
      const value = values.shift();

      if (value === undefined) {
        throw new Error("test random values exhausted");
      }

      return value;
    },
    write: (value) => output.push(value),
  });

  return output;
}

test("random returns an integer from zero to max minus one", () => {
  assert.deepEqual(outputOf("10 random print 10 random print", [0, 0.999]), [
    0,
    9,
  ]);
});

test("random-between includes both endpoints", () => {
  assert.deepEqual(
    outputOf("1 100 random-between print 1 100 random-between print", [
      0,
      0.999,
    ]),
    [1, 100],
  );
});

test("random rejects non-positive maximums", () => {
  assert.throws(
    () => outputOf("0 random", [0.5]),
    /RANDOM requires a positive integer maximum/,
  );
});

test("random validates injected random values", () => {
  assert.throws(
    () => outputOf("10 random", [1]),
    /RANDOM provider must return a number >= 0 and < 1/,
  );
});
