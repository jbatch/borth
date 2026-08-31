import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source, input = [], options = {}) {
  const output = [];
  const lines = [...input];

  run(source, {
    ...options,
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

test("read-text-file pushes a UTF-8 text file onto the stack", () => {
  assert.deepEqual(
    outputOf('"tests/fixtures/read-text-file.txt" read-text-file print'),
    ["hello from fixture\n"],
  );
});

test("read-text-file can be provided by tests", () => {
  assert.deepEqual(
    outputOf('"notes.borth" read-text-file print', [], {
      readTextFile: (path) => {
        assert.equal(path, "notes.borth");
        return "10 20 +";
      },
    }),
    ["10 20 +"],
  );
});

test("read-text-file requires a path", () => {
  assert.throws(
    () => run("read-text-file", { write: () => undefined }),
    /READ_TEXT_FILE requires a value on the stack/,
  );
});

test("read-text-file requires a string path", () => {
  assert.throws(
    () => run("123 read-text-file", { write: () => undefined }),
    /READ_TEXT_FILE requires strings on the stack/,
  );
});

test("read-text-file reports missing files", () => {
  assert.throws(
    () =>
      run('"tests/fixtures/missing.txt" read-text-file', {
        write: () => undefined,
      }),
    /ENOENT/,
  );
});

test("read-line requires an input provider", () => {
  assert.throws(
    () => run("read-line", { write: () => undefined }),
    /READ_LINE requires an input provider/,
  );
});

test("read-int parses an input line as a number", () => {
  assert.deepEqual(outputOf("read-int 2 * print", ["21"]), [42]);
});

test("read-int trims surrounding whitespace", () => {
  assert.deepEqual(outputOf("read-int print", ["  -7  "]), [-7]);
});

test("read-int rejects invalid integers", () => {
  assert.throws(
    () => outputOf("read-int", ["12abc"]),
    /READ_INT expected an integer, got: 12abc/,
  );
});

test("read-int requires an input provider", () => {
  assert.throws(
    () => run("read-int", { write: () => undefined }),
    /READ_INT requires an input provider/,
  );
});
