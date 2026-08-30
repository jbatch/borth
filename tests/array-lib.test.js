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

test("array library validates indexes", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 10 array-push 20 array-push -1 array-valid-index? print
      array-new 10 array-push 20 array-push 0 array-valid-index? print
      array-new 10 array-push 20 array-push 1 array-valid-index? print
      array-new 10 array-push 20 array-push 2 array-valid-index? print
    `),
    [0, 1, 1, 0],
  );
});

test("array library slices a half-open range", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 10 array-push 20 array-push 30 array-push 0 2 array-slice show print
      array-new 10 array-push 20 array-push 30 array-push 1 2 array-slice show print
      array-new 10 array-push 20 array-push 30 array-push 2 1 array-slice show print
    `),
    ["[10 20]", "[20 30]", "[30]"],
  );
});

test("array library allows empty slices at range boundaries", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 0 0 array-slice show print
      array-new 10 array-push 20 array-push 0 0 array-slice show print
      array-new 10 array-push 20 array-push 1 0 array-slice show print
      array-new 10 array-push 20 array-push 2 0 array-slice show print
    `),
    ["[]", "[]", "[]", "[]"],
  );
});

test("array library rejects invalid slice ranges with specific errors", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/array.borth"

        array-new 10 array-push -1 0 array-slice
      `),
    /array-slice start must be non-negative/,
  );

  assert.throws(
    () =>
      outputOf(`
        import "lib/array.borth"

        array-new 10 array-push 0 -1 array-slice
      `),
    /array-slice length must be non-negative/,
  );

  assert.throws(
    () =>
      outputOf(`
        import "lib/array.borth"

        array-new 10 array-push 2 0 array-slice
      `),
    /array-slice start is past end of array/,
  );

  assert.throws(
    () =>
      outputOf(`
        import "lib/array.borth"

        array-new 10 array-push 20 array-push 1 2 array-slice
      `),
    /array-slice range is past end of array/,
  );
});

test("array library sets array items immutably", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 10 array-push 20 array-push 30 array-push
      dup 1 99 array-set show print
      show print
    `),
    ["[10 99 30]", "[10 20 30]"],
  );
});

test("array library sets first and last array items", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/array.borth"

      array-new 10 array-push 20 array-push 30 array-push 0 99 array-set show print
      array-new 10 array-push 20 array-push 30 array-push 2 99 array-set show print
    `),
    ["[99 20 30]", "[10 20 99]"],
  );
});

test("array library rejects invalid set indexes", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/array.borth"

        array-new 10 array-push -1 99 array-set
      `),
    /array-set called with index out of bounds/,
  );

  assert.throws(
    () =>
      outputOf(`
        import "lib/array.borth"

        array-new 10 array-push 1 99 array-set
      `),
    /array-set called with index out of bounds/,
  );
});
