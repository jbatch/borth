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

test("lexer library finds token end indexes", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"

      "10 20 +" 0 token-end print
      "10 20 +" 3 token-end print
      "10 20 +" 6 token-end print
      "10" 0 token-end print
    `),
    [2, 5, 7, 2],
  );
});

test("lexer library splits the next token from the rest", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"

      "10 20 +" rest-token print print
      "20" rest-token print print
    `),
    ["10", "20 +", "20", ""],
  );
});

test("lexer library reports whether source remains", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"

      "" has-rest? print
      "x" has-rest? print
    `),
    [0, 1],
  );
});

test("lexer library lexes a source string into token strings", () => {
  assert.deepEqual(
    outputOf(`
      import "lib/lexer.borth"

      "" lex-src show print
      "10" lex-src show print
      "10 20 +" lex-src show print
    `),
    ["[]", '["10"]', '["10" "20" "+"]'],
  );
});
