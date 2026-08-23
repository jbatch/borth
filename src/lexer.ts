export type Token = {
  lexeme: string;
};

export function lex(source: string): Token[] {
  return stripCommentLines(source)
    .trim()
    .split(/\s+/)
    .filter((lexeme) => lexeme.length > 0)
    .map((lexeme) => ({ lexeme }));
}

function stripCommentLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}
