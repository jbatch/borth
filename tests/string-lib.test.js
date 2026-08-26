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

test("strings library exposes character helpers", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/strings.borth"

      "abc" 0 char-at print
      "abc" 2 char-at print
      "abc" 3 char-at print
      "abc" -1 char-at print
      "7" digit? print
      "x" digit? print
    `),
    ["a", "c", "", "", 1, 0],
  );
});

test("strings library identifies integer strings", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/strings.borth"

      "123" str-int? print
      "-123" str-int? print
      "0" str-int? print
      "" str-int? print
      "-" str-int? print
      "12a" str-int? print
    `),
    [1, 1, 1, 0, 0, 0],
  );
});

test("strings library converts digit characters", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/strings.borth"

      "0" char-to-int print
      "7" char-to-int print
      "9" char-to-int print
    `),
    [0, 7, 9],
  );
});

test("strings library parses valid integer suffixes from an index", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/strings.borth"

      "abc123" 3 str-to-int-from-index print
      "-123" 1 str-to-int-from-index print
    `),
    [123, 123],
  );
});

test("strings library parses valid integer strings", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/strings.borth"

      "0" str-to-int print
      "7425" str-to-int print
      "007" str-to-int print
      "-123" str-to-int print
      "-007" str-to-int print
    `),
    [0, 7425, 7, -123, -7],
  );
});
