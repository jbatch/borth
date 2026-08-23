export type Program = {
  kind: "program";
  body: AstNode[];
};

export type AstNode = IntegerLiteral | StringLiteral | Word;

export type IntegerLiteral = {
  kind: "integer";
  value: number;
};

export type StringLiteral = {
  kind: "string";
  value: string;
};

export type Word = {
  kind: "word";
  name: string;
};
