import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import type { Instruction } from "./bytecode.js";
import { formatSourceLocation } from "./source-location.js";
import type {
  Address,
  ArrayBuilderValue,
  ArrayValue,
  MapValue,
  RecordValue,
  StringBuilderValue,
  Value,
} from "./value.js";

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
  arrayBuilderNew: number;
  arrayBuilderPush: number;
  arrayBuilderLen: number;
  arrayBuilderGet: number;
  arrayBuilderSet: number;
  arrayBuilderFreeze: number;
  strCat: number;
  strCatCopiedBytes: number;
  strBuilderNew: number;
  strBuilderPush: number;
  strBuilderPushCopiedBytes: number;
  strBuilderLen: number;
  strBuilderFreeze: number;
  mapNew: number;
  mapGet: number;
  mapHas: number;
  mapSet: number;
  mapSize: number;
  recordNew: number;
  recordCopy: number;
  recordGet: number;
  recordSet: number;
  recordGetField: number;
  recordSetField: number;
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
        case "STR_BUILDER_NEW":
          if (profile !== undefined) {
            profile.strBuilderNew += 1;
          }
          state.stack.push({
            kind: "string-builder",
            chunks: [],
            length: 0,
            frozen: false,
          });
          state.ip += 1;
          break;
        case "STR_BUILDER_PUSH": {
          const value = popString(state, "STR_BUILDER_PUSH");
          const builder = popStringBuilder(state, "STR_BUILDER_PUSH");
          if (builder.frozen) {
            throw new Error("STR_BUILDER_PUSH cannot push to a frozen builder");
          }
          if (profile !== undefined) {
            profile.strBuilderPush += 1;
            profile.strBuilderPushCopiedBytes += value.length;
          }
          builder.chunks.push(value);
          builder.length += value.length;
          state.stack.push(builder);
          state.ip += 1;
          break;
        }
        case "STR_BUILDER_LEN": {
          const builder = popStringBuilder(state, "STR_BUILDER_LEN");
          if (profile !== undefined) {
            profile.strBuilderLen += 1;
          }
          state.stack.push(builder.length);
          state.ip += 1;
          break;
        }
        case "STR_BUILDER_FREEZE": {
          const builder = popStringBuilder(state, "STR_BUILDER_FREEZE");
          if (builder.frozen) {
            throw new Error("STR_BUILDER_FREEZE cannot freeze a frozen builder");
          }
          if (profile !== undefined) {
            profile.strBuilderFreeze += 1;
          }
          const value = builder.chunks.join("");
          builder.chunks = [];
          builder.length = 0;
          builder.frozen = true;
          state.stack.push(value);
          state.ip += 1;
          break;
        }
        case "MAP_NEW":
          if (profile !== undefined) {
            profile.mapNew += 1;
          }
          state.stack.push({ kind: "map", items: new Map() });
          state.ip += 1;
          break;
        case "MAP_GET": {
          const key = pop(state, "MAP_GET");
          const map = popMap(state, "MAP_GET");
          if (profile !== undefined) {
            profile.mapGet += 1;
          }
          const entry = map.items.get(mapKey(key, "MAP_GET"));
          if (entry === undefined) {
            state.stack.push(0, 0);
          } else {
            state.stack.push(entry.value, 1);
          }
          state.ip += 1;
          break;
        }
        case "MAP_HAS": {
          const key = pop(state, "MAP_HAS");
          const map = popMap(state, "MAP_HAS");
          if (profile !== undefined) {
            profile.mapHas += 1;
          }
          state.stack.push(bool(map.items.has(mapKey(key, "MAP_HAS"))));
          state.ip += 1;
          break;
        }
        case "MAP_SET": {
          const value = pop(state, "MAP_SET");
          const key = pop(state, "MAP_SET");
          const map = popMap(state, "MAP_SET");
          if (profile !== undefined) {
            profile.mapSet += 1;
          }
          map.items.set(mapKey(key, "MAP_SET"), { key, value });
          state.stack.push(map);
          state.ip += 1;
          break;
        }
        case "MAP_SIZE": {
          const map = popMap(state, "MAP_SIZE");
          if (profile !== undefined) {
            profile.mapSize += 1;
          }
          state.stack.push(map.items.size);
          state.ip += 1;
          break;
        }
        case "RECORD_NEW": {
          const defaults = popArray(state, "RECORD_NEW");
          const shape = popString(state, "RECORD_NEW");
          if (profile !== undefined) {
            profile.recordNew += 1;
          }
          state.stack.push({
            kind: "record",
            shape,
            fields: [...defaults.items],
          });
          state.ip += 1;
          break;
        }
        case "RECORD_COPY": {
          const shape = popString(state, "RECORD_COPY");
          const record = popRecord(state, "RECORD_COPY", shape);
          if (profile !== undefined) {
            profile.recordCopy += 1;
          }
          state.stack.push({
            kind: "record",
            shape: record.shape,
            fields: [...record.fields],
          });
          state.ip += 1;
          break;
        }
        case "RECORD_GET": {
          const index = popNonNegativeInteger(state, "RECORD_GET", "index");
          const field = popString(state, "RECORD_GET");
          const shape = popString(state, "RECORD_GET");
          const record = popRecord(state, "RECORD_GET", shape);
          if (profile !== undefined) {
            profile.recordGet += 1;
          }
          state.stack.push(getRecordField(record, index, field, "RECORD_GET"));
          state.ip += 1;
          break;
        }
        case "RECORD_SET": {
          const index = popNonNegativeInteger(state, "RECORD_SET", "index");
          const field = popString(state, "RECORD_SET");
          const shape = popString(state, "RECORD_SET");
          const value = pop(state, "RECORD_SET");
          const record = popRecord(state, "RECORD_SET", shape);
          if (profile !== undefined) {
            profile.recordSet += 1;
          }
          setRecordField(record, index, field, value, "RECORD_SET");
          state.stack.push(record);
          state.ip += 1;
          break;
        }
        case "RECORD_GET_FIELD": {
          const record = popRecord(state, "RECORD_GET_FIELD", instruction.shape);
          if (profile !== undefined) {
            profile.recordGetField += 1;
          }
          state.stack.push(
            getRecordField(
              record,
              instruction.index,
              instruction.field,
              "RECORD_GET_FIELD",
            ),
          );
          state.ip += 1;
          break;
        }
        case "RECORD_SET_FIELD": {
          const value = pop(state, "RECORD_SET_FIELD");
          const record = popRecord(state, "RECORD_SET_FIELD", instruction.shape);
          if (profile !== undefined) {
            profile.recordSetField += 1;
          }
          setRecordField(
            record,
            instruction.index,
            instruction.field,
            value,
            "RECORD_SET_FIELD",
          );
          state.stack.push(record);
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
        case "ARRAY_BUILDER_NEW":
          if (profile !== undefined) {
            profile.arrayBuilderNew += 1;
          }
          state.stack.push({ kind: "array-builder", items: [], frozen: false });
          state.ip += 1;
          break;
        case "ARRAY_BUILDER_PUSH": {
          const value = pop(state, "ARRAY_BUILDER_PUSH");
          const builder = popArrayBuilder(state, "ARRAY_BUILDER_PUSH");
          if (builder.frozen) {
            throw new Error("ARRAY_BUILDER_PUSH cannot push to a frozen builder");
          }
          if (profile !== undefined) {
            profile.arrayBuilderPush += 1;
          }
          builder.items.push(value);
          state.stack.push(builder);
          state.ip += 1;
          break;
        }
        case "ARRAY_BUILDER_LEN": {
          const builder = popArrayBuilder(state, "ARRAY_BUILDER_LEN");
          if (profile !== undefined) {
            profile.arrayBuilderLen += 1;
          }
          state.stack.push(builder.items.length);
          state.ip += 1;
          break;
        }
        case "ARRAY_BUILDER_GET": {
          const index = popNonNegativeInteger(
            state,
            "ARRAY_BUILDER_GET",
            "index",
          );
          const builder = popArrayBuilder(state, "ARRAY_BUILDER_GET");
          if (profile !== undefined) {
            profile.arrayBuilderGet += 1;
          }
          state.stack.push(getArrayBuilderValue(builder, index));
          state.ip += 1;
          break;
        }
        case "ARRAY_BUILDER_SET": {
          const value = pop(state, "ARRAY_BUILDER_SET");
          const index = popNonNegativeInteger(
            state,
            "ARRAY_BUILDER_SET",
            "index",
          );
          const builder = popArrayBuilder(state, "ARRAY_BUILDER_SET");
          if (builder.frozen) {
            throw new Error("ARRAY_BUILDER_SET cannot set a frozen builder");
          }
          if (index >= builder.items.length) {
            throw new Error("ARRAY_BUILDER_SET index is past end of builder");
          }
          if (profile !== undefined) {
            profile.arrayBuilderSet += 1;
          }
          builder.items[index] = value;
          state.stack.push(builder);
          state.ip += 1;
          break;
        }
        case "ARRAY_BUILDER_FREEZE": {
          const builder = popArrayBuilder(state, "ARRAY_BUILDER_FREEZE");
          if (builder.frozen) {
            throw new Error("ARRAY_BUILDER_FREEZE cannot freeze a frozen builder");
          }
          if (profile !== undefined) {
            profile.arrayBuilderFreeze += 1;
          }
          const items = builder.items;
          builder.items = [];
          builder.frozen = true;
          state.stack.push({ kind: "array", items });
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

function getArrayBuilderValue(builder: ArrayBuilderValue, index: number): Value {
  const value = builder.items[index];

  if (value === undefined) {
    throw new Error("ARRAY_BUILDER_GET index is past end of builder");
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
    arrayBuilderNew: 0,
    arrayBuilderPush: 0,
    arrayBuilderLen: 0,
    arrayBuilderGet: 0,
    arrayBuilderSet: 0,
    arrayBuilderFreeze: 0,
    strCat: 0,
    strCatCopiedBytes: 0,
    strBuilderNew: 0,
    strBuilderPush: 0,
    strBuilderPushCopiedBytes: 0,
    strBuilderLen: 0,
    strBuilderFreeze: 0,
    mapNew: 0,
    mapGet: 0,
    mapHas: 0,
    mapSet: 0,
    mapSize: 0,
    recordNew: 0,
    recordCopy: 0,
    recordGet: 0,
    recordSet: 0,
    recordGetField: 0,
    recordSetField: 0,
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
  console.error(`array-builder-new: ${profile.arrayBuilderNew}`);
  console.error(`array-builder-push: ${profile.arrayBuilderPush}`);
  console.error(`array-builder-len: ${profile.arrayBuilderLen}`);
  console.error(`array-builder-get: ${profile.arrayBuilderGet}`);
  console.error(`array-builder-set: ${profile.arrayBuilderSet}`);
  console.error(`array-builder-freeze: ${profile.arrayBuilderFreeze}`);
  console.error(
    `str-cat: ${profile.strCat} copied-bytes=${profile.strCatCopiedBytes}`,
  );
  console.error(`str-builder-new: ${profile.strBuilderNew}`);
  console.error(
    `str-builder-push: ${profile.strBuilderPush} copied-bytes=${profile.strBuilderPushCopiedBytes}`,
  );
  console.error(`str-builder-len: ${profile.strBuilderLen}`);
  console.error(`str-builder-freeze: ${profile.strBuilderFreeze}`);
  console.error(`map-new: ${profile.mapNew}`);
  console.error(`map-get: ${profile.mapGet}`);
  console.error(`map-has: ${profile.mapHas}`);
  console.error(`map-set: ${profile.mapSet}`);
  console.error(`map-size: ${profile.mapSize}`);
  console.error(`record-new: ${profile.recordNew}`);
  console.error(`record-copy: ${profile.recordCopy}`);
  console.error(`record-get: ${profile.recordGet}`);
  console.error(`record-set: ${profile.recordSet}`);
  console.error(`record-get-field: ${profile.recordGetField}`);
  console.error(`record-set-field: ${profile.recordSetField}`);
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
      case "array-builder":
        return `<array-builder:${value.frozen ? "frozen" : value.items.length}>`;
      case "string-builder":
        return `<string-builder:${value.frozen ? "frozen" : value.length}>`;
      case "map":
        return `<map:${value.items.size}>`;
      case "record":
        return `<record:${value.shape}>`;
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

function popArrayBuilder(state: VmState, op: string): ArrayBuilderValue {
  const value = pop(state, op);

  if (typeof value !== "object" || value.kind !== "array-builder") {
    throw new Error(`${op} requires an array builder on the stack`);
  }

  return value;
}

function popStringBuilder(state: VmState, op: string): StringBuilderValue {
  const value = pop(state, op);

  if (typeof value !== "object" || value.kind !== "string-builder") {
    throw new Error(`${op} requires a string builder on the stack`);
  }

  return value;
}

function popMap(state: VmState, op: string): MapValue {
  const value = pop(state, op);

  if (typeof value !== "object" || value.kind !== "map") {
    throw new Error(`${op} requires a map on the stack`);
  }

  return value;
}

function popRecord(
  state: VmState,
  op: string,
  expectedShape: string,
): RecordValue {
  const value = pop(state, op);

  if (typeof value !== "object" || value.kind !== "record") {
    throw new Error(`${op} requires a record on the stack`);
  }

  if (value.shape !== expectedShape) {
    throw new Error(
      `${op} expected record ${expectedShape}, got record ${value.shape}`,
    );
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

function mapKey(value: Value, op: string): string {
  if (typeof value === "number") {
    return `i:${value}`;
  }

  if (typeof value === "string") {
    return `s:${value}`;
  }

  throw new Error(`${op} requires map keys to be numbers or strings`);
}

function getRecordField(
  record: RecordValue,
  index: number,
  field: string,
  op: string,
): Value {
  const value = record.fields[index];

  if (value === undefined) {
    throw new Error(`${op} field ${field} is missing from record ${record.shape}`);
  }

  return value;
}

function setRecordField(
  record: RecordValue,
  index: number,
  field: string,
  value: Value,
  op: string,
): void {
  if (index >= record.fields.length) {
    throw new Error(`${op} field ${field} is missing from record ${record.shape}`);
  }

  record.fields[index] = value;
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
