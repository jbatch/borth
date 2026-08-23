import type { Instruction } from "./bytecode.js";
import type { Value } from "./value.js";

const integerInputPattern = /^-?\d+$/;

export type VmState = {
  ip: number;
  stack: Value[];
  callStack: number[];
};

export type ExecuteOptions = {
  read?: () => string;
  write?: (value: Value) => void;
};

export function execute(
  instructions: Instruction[],
  options: ExecuteOptions = {},
): VmState {
  const read = options.read;
  const write = options.write ?? console.log;
  const state: VmState = {
    ip: 0,
    stack: [],
    callStack: [],
  };

  while (state.ip < instructions.length) {
    const instruction = instructions[state.ip];

    switch (instruction.op) {
      case "PUSH":
        state.stack.push(instruction.value);
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
        binaryNumberOp(state, "EQ", (a, b) => bool(a === b));
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
