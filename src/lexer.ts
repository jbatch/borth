export type Token = WordToken | StringToken;

export type WordToken = {
  kind: "word";
  lexeme: string;
};

export type StringToken = {
  kind: "string";
  lexeme: string;
  value: string;
};

export function lex(source: string): Token[] {
  const sourceWithoutComments = stripCommentLines(source);
  const tokens: Token[] = [];

  for (let index = 0; index < sourceWithoutComments.length; ) {
    const char = sourceWithoutComments[index];

    if (/\s/.test(char)) {
      index += 1;
    } else if (char === '"') {
      const string = readString(sourceWithoutComments, index);
      tokens.push(string.token);
      index = string.nextIndex;
    } else {
      const word = readWord(sourceWithoutComments, index);
      tokens.push(word.token);
      index = word.nextIndex;
    }
  }

  return tokens;
}

function stripCommentLines(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

function readString(
  source: string,
  startIndex: number,
): { token: StringToken; nextIndex: number } {
  let value = "";
  let lexeme = '"';

  for (let index = startIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (char === '"') {
      return {
        token: {
          kind: "string",
          lexeme: `${lexeme}"`,
          value,
        },
        nextIndex: index + 1,
      };
    }

    if (char === "\n" || char === "\r") {
      throw new Error("String literal cannot span lines");
    }

    if (char === "\\") {
      const escaped = readEscape(source, index);
      value += escaped.value;
      lexeme += escaped.lexeme;
      index = escaped.nextIndex - 1;
    } else {
      value += char;
      lexeme += char;
    }
  }

  throw new Error("Unterminated string literal");
}

function readEscape(
  source: string,
  slashIndex: number,
): { value: string; lexeme: string; nextIndex: number } {
  const escaped = source[slashIndex + 1];

  switch (escaped) {
    case '"':
      return { value: '"', lexeme: '\\"', nextIndex: slashIndex + 2 };
    case "\\":
      return { value: "\\", lexeme: "\\\\", nextIndex: slashIndex + 2 };
    case "n":
      return { value: "\n", lexeme: "\\n", nextIndex: slashIndex + 2 };
    case undefined:
      throw new Error("Unterminated string literal");
    default:
      throw new Error(`Unknown escape sequence: \\${escaped}`);
  }
}

function readWord(
  source: string,
  startIndex: number,
): { token: WordToken; nextIndex: number } {
  let lexeme = "";
  let index = startIndex;

  while (index < source.length && !/\s/.test(source[index])) {
    lexeme += source[index];
    index += 1;
  }

  return {
    token: { kind: "word", lexeme },
    nextIndex: index,
  };
}
