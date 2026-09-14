import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import type { Instruction } from "./bytecode.js";
import { formatSourceLocation } from "./source-location.js";
import type { Address, ArrayValue, Value } from "./value.js";

const integerInputPattern = /^-?\d+$/;

export type VmState = {
  ip: number;
  stack: Value[];
  callStack: number[];
  memory: Value[];
  exitCode?: number;
};

export type ExecuteOptions = {
  args?: string[];
  cwd?: () => string;
  env?: (name: string) => string | undefined;
  fileExists?: (path: string) => boolean;
  random?: () => number;
  clockMs?: () => number;
  read?: () => string;
  runCommand?: (command: string, args: string[]) => RunCommandResult;
  readTextFile?: (path: string) => string;
  writeTextFile?: (path: string, contents: string) => void;
  appendTextFile?: (path: string, contents: string) => void;
  write?: (value: Value) => void;
};

export type RunCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type VmProfile = {
  arrayNew: number;
  arrayPush: number;
  arrayPushCopiedItems: number;
  arrayLen: number;
  arrayGet: number;
  strCat: number;
  strCatCopiedBytes: number;
  readTextFile: number;
  readTextFileBytes: number;
  writeTextFile: number;
  writeTextFileBytes: number;
  appendTextFile: number;
  appendTextFileBytes: number;
  runCommand: number;
};

export function execute(
  instructions: Instruction[],
  options: ExecuteOptions = {},
): VmState {
  const args = options.args ?? [];
  const cwd = options.cwd ?? process.cwd;
  const env = options.env ?? ((name: string) => process.env[name]);
  const fileExists = options.fileExists ?? existsSync;
  const random = options.random ?? Math.random;
  const clockMs = options.clockMs ?? Date.now;
  const read = options.read;
  const runCommand = options.runCommand ?? runHostCommand;
  const readTextFile =
    options.readTextFile ?? ((path: string) => readFileSync(path, "utf8"));
  const writeTextFile =
    options.writeTextFile ??
    ((path: string, contents: string) => writeFileSync(path, contents, "utf8"));
  const appendTextFile =
    options.appendTextFile ??
    ((path: string, contents: string) => appendFileSync(path, contents, "utf8"));
  const write = options.write ?? console.log;
  const state: VmState = {
    ip: 0,
    stack: [],
    callStack: [],
    memory: [],
  };
  const profile = createVmProfile();

  function finish(): VmState {
    printVmProfile(profile);
    return state;
  }

  while (state.ip < instructions.length) {
    const instruction = instructions[state.ip];

    try {
      switch (instruction.op) {
        case "PUSH":
          state.stack.push(instruction.value);
          state.ip += 1;
          break;
        case "ALLOC_VARIABLE":
          state.memory.push(0);
          state.ip += 1;
          break;
        case "DROP":
          pop(state, "DROP");
          state.ip += 1;
          break;
        case "DUP": {
          const value = peek(state, "DUP");
          state.stack.push(value);
          state.ip += 1;
          break;
        }
        case "SWAP": {
          requireStackDepth(state, "SWAP", 2);
          const b = pop(state, "SWAP");
          const a = pop(state, "SWAP");
          state.stack.push(b, a);
          state.ip += 1;
          break;
        }
        case "OVER": {
          requireStackDepth(state, "OVER", 2);
          state.stack.push(state.stack[state.stack.length - 2]);
          state.ip += 1;
          break;
        }
        case "ROT": {
          requireStackDepth(state, "ROT", 3);
          const c = pop(state, "ROT");
          const b = pop(state, "ROT");
          const a = pop(state, "ROT");
          state.stack.push(b, c, a);
          state.ip += 1;
          break;
        }
        case "ROLL": {
          const depth = popNonNegativeInteger(state, "ROLL", "depth");
          rollStack(state, "ROLL", depth);
          state.ip += 1;
          break;
        }
        case "ROLL_REVERSE": {
          const depth = popNonNegativeInteger(state, "-ROLL", "depth");
          reverseRollStack(state, "-ROLL", depth);
          state.ip += 1;
          break;
        }
        case "ADD": {
          binaryNumberOp(state, "ADD", (a, b) => a + b);
          state.ip += 1;
          break;
        }
        case "SUB": {
          binaryNumberOp(state, "SUB", (a, b) => a - b);
          state.ip += 1;
          break;
        }
        case "MUL": {
          binaryNumberOp(state, "MUL", (a, b) => a * b);
          state.ip += 1;
          break;
        }
        case "DIV": {
          binaryNumberOp(state, "DIV", (a, b) => {
            if (b === 0) {
              throw new Error("DIV cannot divide by zero");
            }

            return Math.trunc(a / b);
          });
          state.ip += 1;
          break;
        }
        case "MOD": {
          binaryNumberOp(state, "MOD", (a, b) => {
            if (b === 0) {
              throw new Error("MOD cannot divide by zero");
            }

            return a % b;
          });
          state.ip += 1;
          break;
        }
        case "EQ": {
          binaryEqualOp(state);
          state.ip += 1;
          break;
        }
        case "LT": {
          binaryNumberOp(state, "LT", (a, b) => bool(a < b));
          state.ip += 1;
          break;
        }
        case "GT": {
          binaryNumberOp(state, "GT", (a, b) => bool(a > b));
          state.ip += 1;
          break;
        }
        case "STR_LEN": {
          const value = popString(state, "STR_LEN");
          state.stack.push(value.length);
          state.ip += 1;
          break;
        }
        case "STR_CAT": {
          requireStackDepth(state, "STR_CAT", 2);
          const b = popString(state, "STR_CAT");
          const a = popString(state, "STR_CAT");
          if (profile !== undefined) {
            profile.strCat += 1;
            profile.strCatCopiedBytes += a.length + b.length;
          }
          state.stack.push(a + b);
          state.ip += 1;
          break;
        }
        case "STR_SLICE": {
          const length = popNonNegativeInteger(state, "STR_SLICE", "length");
          const start = popNonNegativeInteger(state, "STR_SLICE", "start");
          const value = popString(state, "STR_SLICE");
          state.stack.push(sliceString(value, start, length));
          state.ip += 1;
          break;
        }
        case "STR_INDEX_OF": {
          const start = popNonNegativeInteger(state, "STR_INDEX_OF", "start");
          const needle = popString(state, "STR_INDEX_OF");
          const value = popString(state, "STR_INDEX_OF");
          state.stack.push(indexOfString(value, needle, start));
          state.ip += 1;
          break;
        }
        case "SHOW": {
          state.stack.push(formatValueForStack(pop(state, "SHOW")));
          state.ip += 1;
          break;
        }
        case "ARRAY_NEW":
          if (profile !== undefined) {
            profile.arrayNew += 1;
          }
          state.stack.push({ kind: "array", items: [] });
          state.ip += 1;
          break;
        case "ARRAY_PUSH": {
          const value = pop(state, "ARRAY_PUSH");
          const array = popArray(state, "ARRAY_PUSH");
          if (profile !== undefined) {
            profile.arrayPush += 1;
            profile.arrayPushCopiedItems += array.items.length;
          }
          state.stack.push({ kind: "array", items: [...array.items, value] });
          state.ip += 1;
          break;
        }
        case "ARRAY_LEN": {
          const array = popArray(state, "ARRAY_LEN");
          if (profile !== undefined) {
            profile.arrayLen += 1;
          }
          state.stack.push(array.items.length);
          state.ip += 1;
          break;
        }
        case "ARRAY_GET": {
          const index = popNonNegativeInteger(state, "ARRAY_GET", "index");
          const array = popArray(state, "ARRAY_GET");
          if (profile !== undefined) {
            profile.arrayGet += 1;
          }
          state.stack.push(getArrayValue(array, index));
          state.ip += 1;
          break;
        }
        case "FETCH": {
          const address = popAddress(state, "FETCH");
          state.stack.push(loadMemory(state, address, "FETCH"));
          state.ip += 1;
          break;
        }
        case "STORE": {
          const address = popAddress(state, "STORE");
          const value = pop(state, "STORE");
          storeMemory(state, address, value, "STORE");
          state.ip += 1;
          break;
        }
        case "RANDOM": {
          const max = popNumber(state, "RANDOM");
          state.stack.push(randomInteger(max, random));
          state.ip += 1;
          break;
        }
        case "CLOCK_MS":
          state.stack.push(integer(clockMs(), "CLOCK_MS"));
          state.ip += 1;
          break;
        case "CALL":
          state.callStack.push(state.ip + 1);
          state.ip = instruction.target;
          break;
        case "JUMP":
          state.ip = instruction.target;
          break;
        case "JUMP_IF_FALSE": {
          const value = popNumber(state, "JUMP_IF_FALSE");
          state.ip = value === 0 ? instruction.target : state.ip + 1;
          break;
        }
        case "PRINT":
          write(pop(state, "PRINT"));
          state.ip += 1;
          break;
        case "PRINT_STACK":
          write(formatStack(state.stack));
          state.ip += 1;
          break;
        case "PANIC": {
          const message = popString(state, "PANIC");
          throw new Error(message);
        }
        case "EXIT": {
          state.exitCode = popExitCode(state);
          return finish();
        }
        case "READ_LINE":
          state.stack.push(readInput(read, "READ_LINE"));
          state.ip += 1;
          break;
        case "READ_INT":
          state.stack.push(parseInputInteger(readInput(read, "READ_INT")));
          state.ip += 1;
          break;
        case "READ_TEXT_FILE": {
          const path = popString(state, "READ_TEXT_FILE");
          const contents = readTextFile(path);
          if (profile !== undefined) {
            profile.readTextFile += 1;
            profile.readTextFileBytes += contents.length;
          }
          state.stack.push(contents);
          state.ip += 1;
          break;
        }
        case "WRITE_TEXT_FILE": {
          const contents = popString(state, "WRITE_TEXT_FILE");
          const path = popString(state, "WRITE_TEXT_FILE");
          if (profile !== undefined) {
            profile.writeTextFile += 1;
            profile.writeTextFileBytes += contents.length;
          }
          writeTextFile(path, contents);
          state.ip += 1;
          break;
        }
        case "APPEND_TEXT_FILE": {
          const contents = popString(state, "APPEND_TEXT_FILE");
          const path = popString(state, "APPEND_TEXT_FILE");
          if (profile !== undefined) {
            profile.appendTextFile += 1;
            profile.appendTextFileBytes += contents.length;
          }
          appendTextFile(path, contents);
          state.ip += 1;
          break;
        }
        case "FILE_EXISTS": {
          const path = popString(state, "FILE_EXISTS");
          state.stack.push(bool(fileExists(path)));
          state.ip += 1;
          break;
        }
        case "ENV": {
          const name = popString(state, "ENV");
          const value = env(name);
          state.stack.push(value ?? "", bool(value !== undefined));
          state.ip += 1;
          break;
        }
        case "ARGS":
          state.stack.push({ kind: "array", items: [...args] });
          state.ip += 1;
          break;
        case "RUN_COMMAND": {
          const commandArgs = popStringArray(state, "RUN_COMMAND", "args");
          const command = popString(state, "RUN_COMMAND");
          if (profile !== undefined) {
            profile.runCommand += 1;
          }
          const result = runCommand(command, commandArgs);
          state.stack.push(result.exitCode, result.stdout, result.stderr);
          state.ip += 1;
          break;
        }
        case "CWD":
          state.stack.push(cwd());
          state.ip += 1;
          break;
        case "PATH_DIRNAME": {
          const path = popString(state, "PATH_DIRNAME");
          state.stack.push(dirname(path));
          state.ip += 1;
          break;
        }
        case "PATH_RESOLVE": {
          const path = popString(state, "PATH_RESOLVE");
          const base = popString(state, "PATH_RESOLVE");
          state.stack.push(resolve(base, path));
          state.ip += 1;
          break;
        }
        case "RET": {
          const returnAddress = state.callStack.pop();

          if (returnAddress === undefined) {
            throw new Error("RET requires a return address");
          }

          state.ip = returnAddress;
          break;
        }
        case "HALT":
          return finish();
      }
    } catch (error) {
      throw runtimeError(instruction, error);
    }
  }

  return finish();
}

function runtimeError(instruction: Instruction, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (instruction.source === undefined) {
    return error instanceof Error ? error : new Error(message);
  }

  return new Error(`${formatSourceLocation(instruction.source)}: ${message}`);
}

function readInput(read: (() => string) | undefined, op: string): string {
  if (read === undefined) {
    throw new Error(`${op} requires an input provider`);
  }

  return read();
}

function parseInputInteger(input: string): number {
  const trimmed = input.trim();

  if (!integerInputPattern.test(trimmed)) {
    throw new Error(`READ_INT expected an integer, got: ${input}`);
  }

  return Number.parseInt(trimmed, 10);
}

function randomInteger(max: number, random: () => number): number {
  if (!Number.isInteger(max) || max <= 0) {
    throw new Error("RANDOM requires a positive integer maximum");
  }

  const value = random();

  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("RANDOM provider must return a number >= 0 and < 1");
  }

  return Math.floor(value * max);
}

function integer(value: number, op: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${op} provider must return an integer`);
  }

  return value;
}

function popExitCode(state: VmState): number {
  const exitCode = popNumber(state, "EXIT");

  if (!Number.isInteger(exitCode)) {
    throw new Error("EXIT requires an integer exit code");
  }

  return exitCode;
}

function runHostCommand(command: string, args: string[]): RunCommandResult {
  const result = spawnSync(command, args, { encoding: "utf8" });

  if (result.error !== undefined) {
    throw result.error;
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function sliceString(value: string, start: number, length: number): string {
  if (start > value.length) {
    throw new Error("STR_SLICE start is past end of string");
  }

  if (start + length > value.length) {
    throw new Error("STR_SLICE range is past end of string");
  }

  return value.slice(start, start + length);
}

function indexOfString(value: string, needle: string, start: number): number {
  if (start > value.length) {
    throw new Error("STR_INDEX_OF start is past end of string");
  }

  return value.indexOf(needle, start);
}

function getArrayValue(array: ArrayValue, index: number): Value {
  const value = array.items[index];

  if (value === undefined) {
    throw new Error("ARRAY_GET index is past end of array");
  }

  return value;
}

function binaryNumberOp(
  state: VmState,
  op: string,
  apply: (a: number, b: number) => number,
): void {
  requireStackDepth(state, op, 2);
  const b = popNumber(state, op);
  const a = popNumber(state, op);

  state.stack.push(apply(a, b));
}

function rollStack(state: VmState, op: string, depth: number): void {
  requireStackDepth(state, op, depth + 1);
  const index = state.stack.length - 1 - depth;
  const [value] = state.stack.splice(index, 1);
  state.stack.push(value);
}

function reverseRollStack(state: VmState, op: string, depth: number): void {
  requireStackDepth(state, op, depth + 1);
  const value = pop(state, op);
  const index = state.stack.length - depth;
  state.stack.splice(index, 0, value);
}

function createVmProfile(): VmProfile | undefined {
  if (process.env.BORTH_PROFILE === undefined) {
    return undefined;
  }

  return {
    arrayNew: 0,
    arrayPush: 0,
    arrayPushCopiedItems: 0,
    arrayLen: 0,
    arrayGet: 0,
    strCat: 0,
    strCatCopiedBytes: 0,
    readTextFile: 0,
    readTextFileBytes: 0,
    writeTextFile: 0,
    writeTextFileBytes: 0,
    appendTextFile: 0,
    appendTextFileBytes: 0,
    runCommand: 0,
  };
}

function printVmProfile(profile: VmProfile | undefined): void {
  if (profile === undefined) {
    return;
  }

  console.error("[borth profile]");
  console.error(`array-new: ${profile.arrayNew}`);
  console.error(
    `array-push: ${profile.arrayPush} copied-items=${profile.arrayPushCopiedItems}`,
  );
  console.error(`array-len: ${profile.arrayLen}`);
  console.error(`array-get: ${profile.arrayGet}`);
  console.error(
    `str-cat: ${profile.strCat} copied-bytes=${profile.strCatCopiedBytes}`,
  );
  console.error(
    `read-text-file: ${profile.readTextFile} bytes=${profile.readTextFileBytes}`,
  );
  console.error(
    `write-text-file: ${profile.writeTextFile} bytes=${profile.writeTextFileBytes}`,
  );
  console.error(
    `append-text-file: ${profile.appendTextFile} bytes=${profile.appendTextFileBytes}`,
  );
  console.error(`run-command: ${profile.runCommand}`);
}

function binaryEqualOp(state: VmState): void {
  requireStackDepth(state, "EQ", 2);
  const b = pop(state, "EQ");
  const a = pop(state, "EQ");

  if (typeof a === "number" && typeof b === "number") {
    state.stack.push(bool(a === b));
    return;
  }

  if (typeof a === "string" && typeof b === "string") {
    state.stack.push(bool(a === b));
    return;
  }

  throw new Error("EQ requires matching numbers or strings on the stack");
}

function bool(value: boolean): number {
  return value ? 1 : 0;
}

function formatStack(stack: Value[]): string {
  return `[${stack.map(formatValueForStack).join(" ")}]`;
}

function formatValueForStack(value: Value): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "object") {
    switch (value.kind) {
      case "address":
        return `<addr:${value.index}>`;
      case "array":
        return `[${value.items.map(formatValueForStack).join(" ")}]`;
    }
  }

  return String(value);
}

function requireStackDepth(state: VmState, op: string, depth: number): void {
  if (state.stack.length < depth) {
    throw new Error(`${op} requires ${depth} values on the stack`);
  }
}

function peek(state: VmState, op: string): Value {
  const value = state.stack.at(-1);

  if (value === undefined) {
    throw new Error(`${op} requires a value on the stack`);
  }

  return value;
}

function pop(state: VmState, op: string): Value {
  const value = state.stack.pop();

  if (value === undefined) {
    throw new Error(`${op} requires a value on the stack`);
  }

  return value;
}

function popNumber(state: VmState, op: string): number {
  const value = pop(state, op);

  if (typeof value !== "number") {
    throw new Error(`${op} requires numbers on the stack`);
  }

  return value;
}

function popNonNegativeInteger(
  state: VmState,
  op: string,
  name: string,
): number {
  const value = popNumber(state, op);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${op} requires ${name} to be a non-negative integer`);
  }

  return value;
}

function popString(state: VmState, op: string): string {
  const value = pop(state, op);

  if (typeof value !== "string") {
    throw new Error(`${op} requires strings on the stack`);
  }

  return value;
}

function popStringArray(state: VmState, op: string, name: string): string[] {
  const value = popArray(state, op);
  const strings: string[] = [];

  for (const item of value.items) {
    if (typeof item !== "string") {
      throw new Error(`${op} requires ${name} to contain only strings`);
    }

    strings.push(item);
  }

  return strings;
}

function popArray(state: VmState, op: string): ArrayValue {
  const value = pop(state, op);

  if (typeof value !== "object" || value.kind !== "array") {
    throw new Error(`${op} requires an array on the stack`);
  }

  return value;
}

function popAddress(state: VmState, op: string): Address {
  const value = pop(state, op);

  if (typeof value !== "object" || value.kind !== "address") {
    throw new Error(`${op} requires an address on the stack`);
  }

  return value;
}

function loadMemory(state: VmState, address: Address, op: string): Value {
  const value = state.memory[address.index];

  if (value === undefined) {
    throw new Error(`${op} received invalid address`);
  }

  return value;
}

function storeMemory(
  state: VmState,
  address: Address,
  value: Value,
  op: string,
): void {
  if (state.memory[address.index] === undefined) {
    throw new Error(`${op} received invalid address`);
  }

  state.memory[address.index] = value;
}
