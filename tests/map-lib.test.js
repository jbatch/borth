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

test("map-set updates an existing key instead of appending a duplicate", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/map.borth"

      map-new
        "answer" 1 map-set
        "answer" 2 map-set
      dup map-size print
      "answer" map-get drop print
    `),
    [1, 2],
  );
});

test("map-set preserves other entries when updating one key", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/map.borth"

      map-new
        "a" 1 map-set
        "b" 2 map-set
        "a" 3 map-set

      dup "a" map-get drop print
      dup "b" map-get drop print
      map-size print
    `),
    [3, 2, 2],
  );
});
