import type { SourcePosition, SourceSpan } from "./source-location.js";

export type Token = WordToken | StringToken;

export type WordToken = {
  kind: "word";
  lexeme: string;
  span: SourceSpan;
};

export type StringToken = {
  kind: "string";
  lexeme: string;
  value: string;
  span: SourceSpan;
};

export type LexOptions = {
  sourcePath?: string;
};

type LexerCursor = {
  index: number;
  line: number;
  column: number;
};

export function lex(source: string, options: LexOptions = {}): Token[] {
  const tokens: Token[] = [];

  for (
    let cursor: LexerCursor = { index: 0, line: 1, column: 1 };
    cursor.index < source.length;
  ) {
    const char = source[cursor.index];

    if (/\s/.test(char)) {
      cursor = advanceCursor(cursor, char);
    } else if (char === "#") {
      cursor = skipComment(source, cursor);
    } else if (char === '"') {
      const string = readString(source, cursor, options);
      tokens.push(string.token);
      cursor = string.nextCursor;
    } else {
      const word = readWord(source, cursor);
      tokens.push(word.token);
      cursor = word.nextCursor;
    }
  }

  return tokens;
}

function skipComment(source: string, cursor: LexerCursor): LexerCursor {
  let current = cursor;

  while (current.index < source.length && source[current.index] !== "\n") {
    current = advanceCursor(current, source[current.index]);
  }

  return current;
}

function readString(
  source: string,
  startCursor: LexerCursor,
  options: LexOptions,
): { token: StringToken; nextCursor: LexerCursor } {
  let value = "";
  let lexeme = '"';
  let cursor = advanceCursor(startCursor, '"');

  while (cursor.index < source.length) {
    const char = source[cursor.index];

    if (char === '"') {
      const endCursor = advanceCursor(cursor, char);

      return {
        token: {
          kind: "string",
          lexeme: `${lexeme}"`,
          value,
          span: makeSpan(startCursor, endCursor),
        },
        nextCursor: endCursor,
      };
    }

    if (char === "\n" || char === "\r") {
      throw new Error(
        formatLexError(
          options.sourcePath,
          cursor,
          "String literal cannot span lines",
        ),
      );
    }

    if (char === "\\") {
      const escaped = readEscape(source, cursor, options);
      value += escaped.value;
      lexeme += escaped.lexeme;
      cursor = escaped.nextCursor;
    } else {
      value += char;
      lexeme += char;
      cursor = advanceCursor(cursor, char);
    }
  }

  throw new Error(
    formatLexError(options.sourcePath, cursor, "Unterminated string literal"),
  );
}

function readEscape(
  source: string,
  slashCursor: LexerCursor,
  options: LexOptions,
): { value: string; lexeme: string; nextCursor: LexerCursor } {
  const escaped = source[slashCursor.index + 1];
  const nextCursor = advanceCursor(slashCursor, "\\");

  switch (escaped) {
    case '"':
      return {
        value: '"',
        lexeme: '\\"',
        nextCursor: advanceCursor(nextCursor, escaped),
      };
    case "\\":
      return {
        value: "\\",
        lexeme: "\\\\",
        nextCursor: advanceCursor(nextCursor, escaped),
      };
    case "n":
      return {
        value: "\n",
        lexeme: "\\n",
        nextCursor: advanceCursor(nextCursor, escaped),
      };
    case undefined:
      throw new Error(
        formatLexError(
          options.sourcePath,
          slashCursor,
          "Unterminated string literal",
        ),
      );
    default:
      throw new Error(
        formatLexError(
          options.sourcePath,
          slashCursor,
          `Unknown escape sequence: \\${escaped}`,
        ),
      );
  }
}

function readWord(
  source: string,
  startCursor: LexerCursor,
): { token: WordToken; nextCursor: LexerCursor } {
  let lexeme = "";
  let cursor = startCursor;

  while (cursor.index < source.length && !/\s/.test(source[cursor.index])) {
    const char = source[cursor.index];

    lexeme += char;
    cursor = advanceCursor(cursor, char);
  }

  return {
    token: {
      kind: "word",
      lexeme,
      span: makeSpan(startCursor, cursor),
    },
    nextCursor: cursor,
  };
}

function makeSpan(start: LexerCursor, end: LexerCursor): SourceSpan {
  return {
    start: toSourcePosition(start),
    end: toSourcePosition(end),
  };
}

function toSourcePosition(cursor: LexerCursor): SourcePosition {
  return {
    offset: cursor.index,
    line: cursor.line,
    column: cursor.column,
  };
}

function advanceCursor(cursor: LexerCursor, char: string): LexerCursor {
  if (char === "\n") {
    return {
      index: cursor.index + 1,
      line: cursor.line + 1,
      column: 1,
    };
  }

  return {
    index: cursor.index + 1,
    line: cursor.line,
    column: cursor.column + 1,
  };
}

function formatLexError(
  sourcePath: string | undefined,
  cursor: LexerCursor,
  message: string,
): string {
  return `${sourcePath ?? "<anonymous source>"}:${cursor.line}:${
    cursor.column
  }: ${message}`;
}
