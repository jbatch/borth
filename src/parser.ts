import type { AstNode, Program } from "./ast.js";
import type { Token } from "./lexer.js";

const integerPattern = /^-?\d+$/;

export function parse(tokens: Token[]): Program {
  return {
    kind: "program",
    body: tokens.map(parseToken),
  };
}

function parseToken(token: Token): AstNode {
  if (integerPattern.test(token.lexeme)) {
    return {
      kind: "integer",
      value: Number.parseInt(token.lexeme, 10),
    };
  }

  return {
    kind: "word",
    name: token.lexeme,
  };
}
