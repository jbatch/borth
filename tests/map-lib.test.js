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

test("map-set mutates the runtime map object", () => {
  assert.deepEqual(
    outputOf(`
      variable saved

      map-new saved !
      saved @ "a" 1 map-set drop
      saved @ "a" map-get drop print
    `),
    [1],
  );
});

test("maps support integer keys and missing lookups", () => {
  assert.deepEqual(
    outputOf(`
      map-new
        42 "answer" map-set
      dup 42 map-get print print
      7 map-get print print
    `),
    [1, "answer", 0, 0],
  );
});

test("map words validate maps and supported key types", () => {
  assert.throws(() => outputOf('"not-map" "a" map-get'), /MAP_GET requires a map/);
  assert.throws(
    () => outputOf('map-new array-new "value" map-set'),
    /MAP_SET requires map keys to be numbers or strings/,
  );
});
