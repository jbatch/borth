import type { SourceSpan } from "./source-location.js";

export type Program = {
  kind: "program";
  body: AstNode[];
};

export type AstNode = IntegerLiteral | StringLiteral | Word;

export type IntegerLiteral = {
  kind: "integer";
  value: number;
  span: SourceSpan;
};

export type StringLiteral = {
  kind: "string";
  value: string;
  span: SourceSpan;
};

export type Word = {
  kind: "word";
  name: string;
  span: SourceSpan;
};
