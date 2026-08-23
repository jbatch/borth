export type Program = {
  kind: "program";
  body: AstNode[];
};

export type AstNode = IntegerLiteral | Word;

export type IntegerLiteral = {
  kind: "integer";
  value: number;
};

export type Word = {
  kind: "word";
  name: string;
};
