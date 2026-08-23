import type { Program } from "./ast.js";
import type { Instruction } from "./bytecode.js";

type CompilerState = {
  instructions: Instruction[];
  ifJumpStack: number[];
};

export function compile(program: Program): Instruction[] {
  const state: CompilerState = {
    instructions: [],
    ifJumpStack: [],
  };

  for (const node of program.body) {
    switch (node.kind) {
      case "integer":
        state.instructions.push({ op: "PUSH", value: node.value });
        break;
      case "word":
        if (!compileControlWord(state, node.name)) {
          state.instructions.push(compileWord(node.name));
        }
        break;
    }
  }

  if (state.ifJumpStack.length > 0) {
    throw new Error("if without matching end");
  }

  state.instructions.push({ op: "HALT" });
  return state.instructions;
}

function compileControlWord(state: CompilerState, name: string): boolean {
  switch (name) {
    case "if":
      compileIf(state);
      return true;
    case "end":
      compileEnd(state);
      return true;
    default:
      return false;
  }
}

function compileIf(state: CompilerState): void {
  state.ifJumpStack.push(state.instructions.length);
  state.instructions.push({ op: "JUMP_IF_FALSE", target: -1 });
}

function compileEnd(state: CompilerState): void {
  const ifJumpIndex = state.ifJumpStack.pop();

  if (ifJumpIndex === undefined) {
    throw new Error("end without matching if");
  }

  const ifJump = state.instructions[ifJumpIndex];

  if (ifJump.op !== "JUMP_IF_FALSE") {
    throw new Error("Compiler error: invalid if jump placeholder");
  }

  ifJump.target = state.instructions.length;
}

function compileWord(name: string): Instruction {
  switch (name) {
    case "drop":
      return { op: "DROP" };
    case "dup":
      return { op: "DUP" };
    case "swap":
      return { op: "SWAP" };
    case "over":
      return { op: "OVER" };
    case "+":
      return { op: "ADD" };
    case "-":
      return { op: "SUB" };
    case "*":
      return { op: "MUL" };
    case "/":
      return { op: "DIV" };
    case "mod":
      return { op: "MOD" };
    case "=":
      return { op: "EQ" };
    case "<":
      return { op: "LT" };
    case ">":
      return { op: "GT" };
    case "print":
      return { op: "PRINT" };
    default:
      throw new Error(`Unknown word: ${name}`);
  }
}
