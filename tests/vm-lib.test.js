import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source, options = {}) {
  const output = [];

  run(source, {
    ...options,
    write: (value) => output.push(value),
  });

  return output;
}

test("Borth VM runs compiled integer addition bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "10 20 +" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[30]"],
  );
});

test("Borth VM runs compiled string print bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "\\"Hello, World\\" print" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["Hello, World", "[]"],
  );
});

test("Borth VM executes SHOW by replacing a value with its debug string", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "\\"Hello\\" show" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ['["\\"Hello\\""]'],
  );
});

test("Borth VM executes PANIC by throwing the string on top of the stack", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"
        import "lib/vm.borth"

        "\\"boom\\" panic 1" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
      `),
    /boom/,
  );
});

test("Borth VM executes compiled string primitive bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "\\"hello\\" str-len \\"he\\" \\"llo\\" str-cat \\"hello\\" 1 3 str-slice \\"hello\\" \\"l\\" 3 str-index-of" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ['[5 "hello" "ell" 3]'],
  );
});

test("Borth VM executes compiled array primitive bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "array-new 10 array-push 20 array-push dup array-len swap 1 array-get" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[2 20]"],
  );
});

test("Borth VM executes compiled roll bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "1 2 3 2 roll" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
      "2 3 1 2 -roll" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[2 3 1]", "[1 2 3]"],
  );
});

test("Borth VM executes compiled host IO bytecode", () => {
  const lines = ["hello", "42"];

  assert.deepEqual(
    outputOf(
      `
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"
        import "lib/vm.borth"

        "read-line read-int" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
      `,
      {
        read: () => {
          const line = lines.shift();

          if (line === undefined) {
            throw new Error("test input exhausted");
          }

          return line;
        },
      },
    ),
    ['["hello" 42]'],
  );
});

test("Borth VM executes compiled file and path bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "\\"tests/fixtures/read-text-file.txt\\" read-text-file \\"/repo/examples/main.borth\\" path-dirname \\"/repo/examples\\" \\"../lib/parser.borth\\" path-resolve" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ['["hello from fixture\\n" "/repo/examples" "/repo/lib/parser.borth"]'],
  );
});

test("Borth VM executes compiled host lookup bytecode", () => {
  assert.deepEqual(
    outputOf(
      `
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"
        import "lib/vm.borth"

        "\\"virtual.borth\\" file-exist? \\"BORTH_PATH\\" env \\"MISSING\\" env" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
      `,
      {
        env: (name) => {
          if (name === "BORTH_PATH") {
            return "/repo/lib";
          }

          return undefined;
        },
        fileExists: (path) => path === "virtual.borth",
      },
    ),
    ['[1 "/repo/lib" 1 "" 0]'],
  );
});

test("Borth VM executes compiled cwd and random bytecode", () => {
  const randomValues = [0, 0.999];

  assert.deepEqual(
    outputOf(
      `
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"
        import "lib/vm.borth"

        1 SKIP_PRELUDE !
        "cwd 10 random 10 random" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
      `,
      {
        cwd: () => "/repo",
        random: () => {
          const value = randomValues.shift();

          if (value === undefined) {
            throw new Error("test random values exhausted");
          }

          return value;
        },
      },
    ),
    ['["/repo" 0 9]'],
  );
});

test("Borth VM validates stack depth before delegated string operations", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"
        import "lib/parser.borth"
        import "lib/compiler.borth"
        import "lib/vm.borth"

        "\\"only-one\\" str-cat" lex-src parse-tokens "<test>" compile-nodes run-bytecode
      `),
    /STR_CAT requires 2 values on the stack/,
  );
});

test("Borth VM executes compiled if end true branches", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "1 if 2 end" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[2]"],
  );
});

test("Borth VM skips compiled if end false branches", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "0 if 2 end" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[]"],
  );
});

test("Borth VM executes compiled nested if end branches", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "1 if 0 if 2 end 3 end" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[3]"],
  );
});

test("Borth VM executes compiled if else true branches", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "1 if 2 else 3 end" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[2]"],
  );
});

test("Borth VM executes compiled if else false branches", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "0 if 2 else 3 end" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[3]"],
  );
});

test("Borth VM executes unconditional jumps", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/vm.borth"

      array-new
      array-new "JUMP" array-push 2 array-push array-push
      array-new "PUSH" array-push 999 array-push array-push
      array-new "PUSH" array-push 1 array-push array-push
      array-new "HALT" array-push array-push
      run-bytecode show print
    `),
    ["[1]"],
  );
});

test("Borth VM executes call and ret instructions", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/vm.borth"

      array-new
      array-new "CALL" array-push 2 array-push array-push
      array-new "HALT" array-push array-push
      array-new "PUSH" array-push 10 array-push array-push
      array-new "RET" array-push array-push
      run-bytecode show print
    `),
    ["[10]"],
  );
});

test("Borth VM executes compiled user-defined word calls", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      ": square dup * ; 10 square" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[100]"],
  );
});

test("Borth VM executes compiled recursive user-defined word calls", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      ": fact dup 2 < if drop 1 else dup 1 - fact * end ; 5 fact" lex-src parse-tokens "<test>" compile-nodes run-bytecode show print
    `),
    ["[120]"],
  );
});

test("Borth VM panics when ret has no return address", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/vm.borth"

        array-new
        array-new "RET" array-push array-push
        run-bytecode
      `),
    /RET requires a return address/,
  );
});

test("Borth VM validates jump-if-false stack depth", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/vm.borth"

        array-new
        array-new "JUMP_IF_FALSE" array-push 1 array-push array-push
        run-bytecode
      `),
    /JUMP_IF_FALSE requires a value on the stack/,
  );
});

test("Borth VM panics for unknown instructions", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/vm.borth"

        array-new
        array-new "NOPE" array-push array-push
        run-bytecode
      `),
    /Unknown instruction: "NOPE"/,
  );
});
