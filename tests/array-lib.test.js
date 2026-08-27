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

test("array library returns the final array item", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 10 array-push 20 array-push array-last print
    `),
    [20],
  );
});

test("array library pops the final array item", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 10 array-push 20 array-push 30 array-push array-pop
      print show print
    `),
    [30, "[10 20]"],
  );
});
