import type { Instruction } from "./bytecode.js";

export type VmState = {
  ip: number;
  stack: number[];
};

export function execute(instructions: Instruction[]): VmState {
  const state: VmState = {
    ip: 0,
    stack: [],
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
      case "JUMP_IF_FALSE": {
        const value = pop(state, "JUMP_IF_FALSE");
        state.ip = value === 0 ? instruction.target : state.ip + 1;
        break;
      }
      case "PRINT":
        console.log(pop(state, "PRINT"));
        state.ip += 1;
        break;
      case "HALT":
        return state;
    }
  }

  return state;
}

function binaryNumberOp(
  state: VmState,
  op: string,
  apply: (a: number, b: number) => number,
): void {
  requireStackDepth(state, op, 2);
  const b = pop(state, op);
  const a = pop(state, op);

  state.stack.push(apply(a, b));
}

function bool(value: boolean): number {
  return value ? 1 : 0;
}

function requireStackDepth(state: VmState, op: string, depth: number): void {
  if (state.stack.length < depth) {
    throw new Error(`${op} requires ${depth} values on the stack`);
  }
}

function peek(state: VmState, op: string): number {
  const value = state.stack.at(-1);

  if (value === undefined) {
    throw new Error(`${op} requires a value on the stack`);
  }

  return value;
}

function pop(state: VmState, op: string): number {
  const value = state.stack.pop();

  if (value === undefined) {
    throw new Error(`${op} requires a value on the stack`);
  }

  return value;
}
