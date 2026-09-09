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

test("tokens include source spans", () => {
  const tokens = lex("10\n  dup +");

  assert.deepEqual(tokens.map((token) => token.span), [
    {
      start: { offset: 0, line: 1, column: 1 },
      end: { offset: 2, line: 1, column: 3 },
    },
    {
      start: { offset: 5, line: 2, column: 3 },
      end: { offset: 8, line: 2, column: 6 },
    },
    {
      start: { offset: 9, line: 2, column: 7 },
      end: { offset: 10, line: 2, column: 8 },
    },
  ]);
});

test("lexer errors include source location", () => {
  assert.throws(
    () => lex("10\n\"unterminated", { sourcePath: "sample.borth" }),
    /sample\.borth:2:14: Unterminated string literal/,
  );
});
