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

test("array-new creates an empty array", () => {
  assert.deepEqual(outputOf("array-new show print"), ["[]"]);
});

test("array-push appends values and returns a new array", () => {
  assert.deepEqual(
    outputOf(`
      array-new
      10 array-push
      "word" array-push
      show print
    `),
    ['[10 "word"]'],
  );
});

test("arrays can contain arrays", () => {
  assert.deepEqual(
    outputOf(`
      array-new
      array-new "integer" array-push 123 array-push
      array-push
      show print
    `),
    ['[["integer" 123]]'],
  );
});

test("array-len returns the number of items", () => {
  assert.deepEqual(
    outputOf(`
      array-new array-len print
      array-new 1 array-push 2 array-push array-len print
    `),
    [0, 2],
  );
});

test("array-get returns an item by zero-based index", () => {
  assert.deepEqual(
    outputOf(`
      array-new "a" array-push "b" array-push 0 array-get print
      array-new "a" array-push "b" array-push 1 array-get print
    `),
    ["a", "b"],
  );
});

test("array-push does not mutate the original array", () => {
  assert.deepEqual(
    outputOf(`
      variable saved
      array-new saved !
      saved @ "x" array-push drop
      saved @ show print
    `),
    ["[]"],
  );
});

test("array words require arrays", () => {
  assert.throws(() => outputOf('1 array-len'), /ARRAY_LEN requires an array/);
  assert.throws(
    () => outputOf('"not-array" 1 array-push'),
    /ARRAY_PUSH requires an array/,
  );
  assert.throws(
    () => outputOf('"not-array" 0 array-get'),
    /ARRAY_GET requires an array/,
  );
});

test("array-get requires a valid index", () => {
  assert.throws(
    () => outputOf("array-new -1 array-get"),
    /ARRAY_GET requires index to be a non-negative integer/,
  );
  assert.throws(
    () => outputOf("array-new 0 array-get"),
    /ARRAY_GET index is past end of array/,
  );
});
