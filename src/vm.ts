import type { Instruction } from "./bytecode.js";
import type { Address, Value } from "./value.js";

const integerInputPattern = /^-?\d+$/;

export type VmState = {
  ip: number;
  stack: Value[];
  callStack: number[];
  memory: Value[];
};

export type ExecuteOptions = {
  random?: () => number;
  read?: () => string;
  write?: (value: Value) => void;
};

export function execute(
  instructions: Instruction[],
  options: ExecuteOptions = {},
): VmState {
  const random = options.random ?? Math.random;
  const read = options.read;
  const write = options.write ?? console.log;
  const state: VmState = {
    ip: 0,
    stack: [],
    callStack: [],
    memory: [],
  };

  while (state.ip < instructions.length) {
    const instruction = instructions[state.ip];

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
        binaryStringOp(state, "STR_CAT", (a, b) => a + b);
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
      case "READ_LINE":
        state.stack.push(readInput(read, "READ_LINE"));
        state.ip += 1;
        break;
      case "READ_INT":
        state.stack.push(parseInputInteger(readInput(read, "READ_INT")));
        state.ip += 1;
        break;
      case "RET": {
        const returnAddress = state.callStack.pop();

        if (returnAddress === undefined) {
          throw new Error("RET requires a return address");
        }

        state.ip = returnAddress;
        break;
      }
      case "HALT":
        return state;
    }
  }

  return state;
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

function binaryStringOp(
  state: VmState,
  op: string,
  apply: (a: string, b: string) => string,
): void {
  requireStackDepth(state, op, 2);
  const b = popString(state, op);
  const a = popString(state, op);

  state.stack.push(apply(a, b));
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
    return `<addr:${value.index}>`;
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
