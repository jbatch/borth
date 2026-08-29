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

test("lexer library lexes a source string into token strings", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"

      "" lex-src show print
      "10" lex-src show print
      "10 20 +" lex-src show print
      " 10  20 + " lex-src show print
    `),
    ["[]", '["10"]', '["10" "20" "+"]', '["10" "20" "+"]'],
  );
});

test("lexer library keeps quoted strings with spaces as one token", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"

      "\\"Hello World\\" print" lex-src show print
      "1 \\"two words\\" 3" lex-src show print
    `),
    ['["\\"Hello World\\"" "print"]', '["1" "\\"two words\\"" "3"]'],
  );
});

test("lexer library rejects unterminated quoted strings", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"

        "\\"hello" lex-src show print
      `),
    /Unterminated string literal/,
  );
});

test("lexer library rejects quoted strings spanning lines", () => {
  assert.throws(
    () =>
      outputOf(`
        import "lib/lexer.borth"

        "\\"hello\\nthere\\"" lex-src show print
      `),
    /String literal cannot span lines/,
  );
});
