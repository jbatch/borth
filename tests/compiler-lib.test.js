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

test("compiler library compiles integer and add nodes into instruction arrays", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      "10 20 +" lex-src parse-tokens compile-nodes show print
    `),
    ['[["PUSH" 10] ["PUSH" 20] ["ADD"] ["HALT"]]'],
  );
});

test("compiler library compiles string nodes into push instructions", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      "\\"hello world\\" print" lex-src parse-tokens compile-nodes show print
    `),
    ['[["PUSH" "hello world"] ["PRINT"] ["HALT"]]'],
  );
});

test("compiler library compiles string and array primitive words", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      "str-len str-cat str-slice str-index-of array-new array-len array-push array-get" lex-src parse-tokens compile-nodes show print
    `),
    [
      '[["STR_LEN"] ["STR_CAT"] ["STR_SLICE"] ["STR_INDEX_OF"] ["ARRAY_NEW"] ["ARRAY_LEN"] ["ARRAY_PUSH"] ["ARRAY_GET"] ["HALT"]]',
    ],
  );
});

test("compiler library panics for unknown words", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        "10 nope +" lex-src parse-tokens compile-nodes show print
      `),
    /Unknown word: "nope"/,
  );
});

test("compiler library panics for unknown node kinds", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/compiler.borth"

        array-new "mystery" array-push 123 array-push compile-node
      `),
    /Unknown node kind: "mystery"/,
  );
});
