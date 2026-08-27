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

test("Borth VM runs compiled integer addition bytecode", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"
      import "lib/compiler.borth"
      import "lib/vm.borth"

      "10 20 +" lex-src parse-tokens compile-nodes run-bytecode show print
    `),
    ["[30]"],
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
