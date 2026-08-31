import assert from "node:assert/strict";
import test from "node:test";

import { lex } from "../dist/lexer.js";

function lexemes(source) {
  return lex(source).map((token) => token.lexeme);
}

test("# starts a comment at token boundary", () => {
  assert.deepEqual(lexemes("10 # skip this\n20"), ["10", "20"]);
});

test("comment-only lines are skipped", () => {
  assert.deepEqual(lexemes("# skip this\n  # and this\n10"), ["10"]);
});

test("# inside words and strings is not a comment", () => {
  assert.deepEqual(lexemes('10#keep "# not a comment"'), [
    "10#keep",
    '"# not a comment"',
  ]);
});
