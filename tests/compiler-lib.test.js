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

test("compiler library compiles if end with a patched false jump", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      "1 if 2 print end" lex-src parse-tokens compile-nodes show print
    `),
    ['[["PUSH" 1] ["JUMP_IF_FALSE" 4] ["PUSH" 2] ["PRINT"] ["HALT"]]'],
  );
});

test("compiler library compiles nested if end blocks", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      "1 if 2 if 3 print end 4 print end" lex-src parse-tokens compile-nodes show print
    `),
    [
      '[["PUSH" 1] ["JUMP_IF_FALSE" 8] ["PUSH" 2] ["JUMP_IF_FALSE" 6] ["PUSH" 3] ["PRINT"] ["PUSH" 4] ["PRINT"] ["HALT"]]',
    ],
  );
});

test("compiler library compiles if else end with patched jumps", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      "1 if 2 print else 3 print end" lex-src parse-tokens compile-nodes show print
    `),
    [
      '[["PUSH" 1] ["JUMP_IF_FALSE" 5] ["PUSH" 2] ["PRINT"] ["JUMP" 7] ["PUSH" 3] ["PRINT"] ["HALT"]]',
    ],
  );
});

test("compiler library compiles user-defined words to call instructions", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      ": square dup * ; 10 square" lex-src parse-tokens compile-nodes show print
    `),
    [
      '[["JUMP" 4] ["DUP"] ["MUL"] ["RET"] ["PUSH" 10] ["CALL" 1] ["HALT"]]',
    ],
  );
});

test("compiler library compiles recursive user-defined words", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"

      ": fact dup 2 < if drop 1 else dup 1 - fact * end ; 5 fact" lex-src parse-tokens compile-nodes show print
    `),
    [
      '[["JUMP" 14] ["DUP"] ["PUSH" 2] ["LT"] ["JUMP_IF_FALSE" 8] ["DROP"] ["PUSH" 1] ["JUMP" 13] ["DUP"] ["PUSH" 1] ["SUB"] ["CALL" 1] ["MUL"] ["RET"] ["PUSH" 5] ["CALL" 1] ["HALT"]]',
    ],
  );
});

test("compiler library panics for else without if", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        "else" lex-src parse-tokens compile-nodes show print
      `),
    /else without matching if/,
  );
});

test("compiler library panics for duplicate else", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        "1 if 2 else 3 else 4 end" lex-src parse-tokens compile-nodes show print
      `),
    /else after else/,
  );
});

test("compiler library panics for end without if", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        "1 end" lex-src parse-tokens compile-nodes show print
      `),
    /end without matching if/,
  );
});

test("compiler library panics for if without end", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        "1 if 2" lex-src parse-tokens compile-nodes show print
      `),
    /if without matching end/,
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

test("compiler library panics for words used before definition", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        "10 square : square dup * ;" lex-src parse-tokens compile-nodes show print
      `),
    /Unknown word: "square"/,
  );
});

test("compiler library panics for duplicate user-defined words", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"

        ": square dup * ; : square dup * ;" lex-src parse-tokens compile-nodes show print
      `),
    /word already defined: square/,
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
