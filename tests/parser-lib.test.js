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

test("parser library parses token strings into node arrays", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/parser.borth"

      "10" parse-token show print
      "-20" parse-token show print
      "\\"hello world\\"" parse-token show print
      "+" parse-token show print
      "if" parse-token show print
    `),
    [
      '["integer" 10]',
      '["integer" -20]',
      '["string" "hello world"]',
      '["word" "+"]',
      '["word" "if"]',
    ],
  );
});

test("parser library parses token arrays into node arrays", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/parser.borth"

      array-new parse-tokens show print
      array-new "10" array-push "-2" array-push "+" array-push
      parse-tokens show print
    `),
    ["[]", '[["integer" 10] ["integer" -2] ["word" "+"]]'],
  );
});

test("lexer and parser libraries compose into the first compiler slice", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"
      import "lib/parser.borth"

      "10 \\"hello world\\" +" lex-src parse-tokens show print
    `),
    ['[["integer" 10] ["string" "hello world"] ["word" "+"]]'],
  );
});
