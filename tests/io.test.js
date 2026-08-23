import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source, input) {
  const output = [];
  const lines = [...input];

  run(source, {
    read: () => {
      const line = lines.shift();

      if (line === undefined) {
        throw new Error("test input exhausted");
      }

      return line;
    },
    write: (value) => output.push(value),
  });

  return output;
}

test("read-line pushes an input string onto the stack", () => {
  assert.deepEqual(outputOf("read-line print", ["hello"]), ["hello"]);
});

test("read-line can be called more than once", () => {
  assert.deepEqual(
    outputOf("read-line read-line swap print print", ["first", "second"]),
    ["first", "second"],
  );
});

test("read-line requires an input provider", () => {
  assert.throws(
    () => run("read-line", { write: () => undefined }),
    /READ_LINE requires an input provider/,
  );
});
