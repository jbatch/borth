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

const raw = process.argv.includes("--raw");

function formatValue(value, indent = 0) {
  if (!raw) {
    const formattedKnownShape = formatKnownShape(value, indent);

    if (formattedKnownShape !== undefined) {
      return formattedKnownShape;
    }
  }

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
  const lines = value.map(
    (item) => `${childSpaces}${formatValue(item, indent + 2)}`,
  );

  return ["[", ...lines, `${spaces}]`].join("\n");
}

function isSmallFlatArray(value) {
  return value.length <= 3 && value.every((item) => !Array.isArray(item));
}

function formatKnownShape(value, indent) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (isNode(value)) {
    return formatNode(value);
  }

  if (isSpan(value)) {
    return formatSpan(value);
  }

  if (isInstruction(value)) {
    return formatInstruction(value);
  }

  if (isCompilerState(value)) {
    return formatCompilerState(value, indent);
  }

  if (isVmState(value)) {
    return formatVmState(value, indent);
  }

  return undefined;
}

function isNode(value) {
  return (
    value.length === 2 &&
    typeof value[0] === "string" &&
    ["integer", "string", "word"].includes(value[0])
  );
}

function formatNode(value) {
  const [kind, payload] = value;

  if (kind === "word") {
    return `<word ${formatScalar(payload)}>`;
  }

  return `<${kind} ${formatScalar(payload)}>`;
}

function isSpan(value) {
  return (
    value.length === 6 &&
    value[0] === "span" &&
    typeof value[1] === "string" &&
    value.slice(2).every((item) => typeof item === "number")
  );
}

function formatSpan(value) {
  const [, filePath, startLine, startColumn, endLine, endColumn] = value;

  if (startLine === endLine) {
    return `<span ${filePath}:${startLine}:${startColumn}-${endColumn}>`;
  }

  return `<span ${filePath}:${startLine}:${startColumn}-${endLine}:${endColumn}>`;
}

function isInstruction(value) {
  return (
    value.length >= 1 &&
    typeof value[0] === "string" &&
    [
      "PUSH",
      "ALLOC_VARIABLE",
      "DROP",
      "DUP",
      "SWAP",
      "OVER",
      "ROT",
      "ROLL",
      "ROLL_REVERSE",
      "ADD",
      "SUB",
      "MUL",
      "DIV",
      "MOD",
      "EQ",
      "LT",
      "GT",
      "STR_LEN",
      "STR_CAT",
      "STR_SLICE",
      "STR_INDEX_OF",
      "SHOW",
      "ARRAY_NEW",
      "ARRAY_PUSH",
      "ARRAY_LEN",
      "ARRAY_GET",
      "FETCH",
      "STORE",
      "RANDOM",
      "READ_LINE",
      "READ_INT",
      "READ_TEXT_FILE",
      "WRITE_TEXT_FILE",
      "APPEND_TEXT_FILE",
      "FILE_EXISTS",
      "ENV",
      "CWD",
      "PATH_DIRNAME",
      "PATH_RESOLVE",
      "PRINT",
      "PRINT_STACK",
      "PANIC",
      "CALL",
      "JUMP",
      "JUMP_IF_FALSE",
      "RET",
      "HALT",
    ].includes(value[0])
  );
}

function formatInstruction(value) {
  const [op, ...args] = value;

  if (args.length === 0) {
    return `<${op}>`;
  }

  return `<${op} ${args.map((item) => formatValue(item)).join(" ")}>`;
}

function isCompilerState(value) {
  return (
    value.length === 9 &&
    typeof value[0] === "string" &&
    Array.isArray(value[1]) &&
    typeof value[2] === "number" &&
    Array.isArray(value[3]) &&
    typeof value[4] === "number" &&
    Array.isArray(value[5]) &&
    Array.isArray(value[6]) &&
    Array.isArray(value[7]) &&
    Array.isArray(value[8])
  );
}

function formatCompilerState(value, indent) {
  const [
    filePath,
    nodes,
    nodeIndex,
    instructions,
    allowTopLevelCode,
    blockStack,
    words,
    variables,
    deferredCalls,
  ] = value;

  return formatObjectLike(
    "compiler-state",
    [
      ["file", formatScalar(filePath)],
      ["node-index", `${nodeIndex}/${nodes.length}`],
      ["instructions", `<array ${instructions.length}>`],
      ["allow-top-level-code", formatScalar(allowTopLevelCode)],
      ["block-stack", formatValue(blockStack, indent + 2)],
      ["words", formatMapSummary(words)],
      ["variables", formatMapSummary(variables)],
      ["deferred-calls", formatMapSummary(deferredCalls)],
    ],
    indent,
  );
}

function isVmState(value) {
  return (
    value.length === 5 &&
    Array.isArray(value[0]) &&
    typeof value[1] === "number" &&
    Array.isArray(value[2]) &&
    Array.isArray(value[3]) &&
    Array.isArray(value[4])
  );
}

function formatVmState(value, indent) {
  const [instructions, ip, stack, callStack, memory] = value;

  return formatObjectLike(
    "vm-state",
    [
      ["ip", `${ip}/${instructions.length}`],
      ["stack", formatValue(stack, indent + 2)],
      ["call-stack", formatValue(callStack, indent + 2)],
      ["memory", formatValue(memory, indent + 2)],
    ],
    indent,
  );
}

function formatObjectLike(name, fields, indent) {
  const spaces = " ".repeat(indent);
  const childSpaces = " ".repeat(indent + 2);
  const lines = fields.map(
    ([field, text]) => `${childSpaces}${field}: ${text}`,
  );

  return [`<${name}`, ...lines, `${spaces}>`].join("\n");
}

function formatMapSummary(value) {
  if (!Array.isArray(value)) {
    return formatValue(value);
  }

  const keys = value
    .filter((entry) => Array.isArray(entry) && entry.length === 2)
    .map((entry) => formatScalar(entry[0]));

  if (keys.length === 0) {
    return "<map 0>";
  }

  return `<map ${keys.length}: ${keys.join(" ")}>`;
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
  const valueArgs = process.argv.slice(2).filter((arg) => arg !== "--raw");

  if (valueArgs.length > 0) {
    return valueArgs.join(" ");
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
