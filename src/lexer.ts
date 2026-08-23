export type Token = {
  lexeme: string;
};

export function lex(source: string): Token[] {
  return source
    .trim()
    .split(/\s+/)
    .filter((lexeme) => lexeme.length > 0)
    .map((lexeme) => ({ lexeme }));
}
