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
      case "ADD": {
        const b = pop(state, "ADD");
        const a = pop(state, "ADD");
        state.stack.push(a + b);
        state.ip += 1;
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

function pop(state: VmState, op: string): number {
  const value = state.stack.pop();

  if (value === undefined) {
    throw new Error(`${op} requires a value on the stack`);
  }

  return value;
}
