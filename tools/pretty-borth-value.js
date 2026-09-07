import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

class Parser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parseValue() {
    this.skipWhitespace();

    const char = this.peek();

    if (char === "[") {
      return this.parseArray();
    }

    if (char === '"') {
      return this.parseString();
    }

    if (char === undefined) {
      throw new Error("expected a value, got end of input");
    }

    return this.parseAtom();
  }

  parseArray() {
    this.expect("[");
    const items = [];

    while (true) {
      this.skipWhitespace();

      if (this.peek() === "]") {
        this.index += 1;
        return items;
      }

      if (this.peek() === undefined) {
        throw new Error("unterminated array");
      }

      items.push(this.parseValue());
    }
  }

  parseString() {
    this.expect('"');
    let value = "";

    while (true) {
      const char = this.next();

      if (char === undefined) {
        throw new Error("unterminated string");
      }

      if (char === '"') {
        return value;
      }

      if (char === "\\") {
        const escaped = this.next();

        if (escaped === undefined) {
          throw new Error("unterminated string escape");
        }

        value += escaped;
      } else {
        value += char;
      }
    }
  }

  parseAtom() {
    const start = this.index;

    while (true) {
      const char = this.peek();

      if (char === undefined || /\s|\[|\]/.test(char)) {
        break;
      }

      this.index += 1;
    }

    const text = this.source.slice(start, this.index);

    if (/^-?\d+$/.test(text)) {
      return Number.parseInt(text, 10);
    }

    return { kind: "atom", text };
  }

  expectEnd() {
    this.skipWhitespace();

    if (this.peek() !== undefined) {
      throw new Error(`unexpected input at ${this.index}: ${this.peek()}`);
    }
  }

  expect(expected) {
    const actual = this.next();

    if (actual !== expected) {
      throw new Error(`expected ${expected}, got ${actual ?? "end of input"}`);
    }
  }

  next() {
    const char = this.peek();

    if (char !== undefined) {
      this.index += 1;
    }

    return char;
  }

  peek() {
    return this.source[this.index];
  }

  skipWhitespace() {
    while (/\s/.test(this.peek() ?? "")) {
      this.index += 1;
    }
  }
}

function formatValue(value, indent = 0) {
  if (!Array.isArray(value)) {
    return formatScalar(value);
  }

  if (value.length === 0) {
    return "[]";
  }

  if (isSmallFlatArray(value)) {
    return `[${value.map(formatScalar).join(" ")}]`;
  }

  const spaces = " ".repeat(indent);
  const childSpaces = " ".repeat(indent + 2);
  const lines = value.map((item) => `${childSpaces}${formatValue(item, indent + 2)}`);

  return ["[", ...lines, `${spaces}]`].join("\n");
}

function isSmallFlatArray(value) {
  return value.length <= 3 && value.every((item) => !Array.isArray(item));
}

function formatScalar(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return String(value);
  }

  return value.text;
}

const input = await readInput();

try {
  const parser = new Parser(input);
  const value = parser.parseValue();
  parser.expectEnd();
  console.log(formatValue(value));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
}

async function readInput() {
  if (process.argv.length > 2) {
    return process.argv.slice(2).join(" ");
  }

  if (!process.stdin.isTTY) {
    return readFileSync(0, "utf8");
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await readline.question("value> ");
  } finally {
    readline.close();
  }
}
