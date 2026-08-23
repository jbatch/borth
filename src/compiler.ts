import type { Program } from "./ast.js";
import type { Instruction } from "./bytecode.js";

type IfFrame = {
  falseJumpIndex: number;
  afterJumpIndex?: number;
  hasElse: boolean;
};

type CompilerState = {
  instructions: Instruction[];
  ifStack: IfFrame[];
};

export function compile(program: Program): Instruction[] {
  const state: CompilerState = {
    instructions: [],
    ifStack: [],
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

  if (state.ifStack.length > 0) {
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
    case "else":
      compileElse(state);
      return true;
    case "end":
      compileEnd(state);
      return true;
    default:
      return false;
  }
}

function compileIf(state: CompilerState): void {
  state.ifStack.push({
    falseJumpIndex: state.instructions.length,
    hasElse: false,
  });
  state.instructions.push({ op: "JUMP_IF_FALSE", target: -1 });
}

function compileElse(state: CompilerState): void {
  const frame = currentIfFrame(state, "else without matching if");

  if (frame.hasElse) {
    throw new Error("else after else");
  }

  frame.afterJumpIndex = state.instructions.length;
  frame.hasElse = true;

  state.instructions.push({ op: "JUMP", target: -1 });
  patchJumpIfFalse(state, frame.falseJumpIndex, state.instructions.length);
}

function compileEnd(state: CompilerState): void {
  const frame = state.ifStack.pop();

  if (frame === undefined) {
    throw new Error("end without matching if");
  }

  if (frame.hasElse) {
    if (frame.afterJumpIndex === undefined) {
      throw new Error("Compiler error: missing else jump placeholder");
    }

    patchJump(state, frame.afterJumpIndex, state.instructions.length);
  } else {
    patchJumpIfFalse(state, frame.falseJumpIndex, state.instructions.length);
  }
}

function currentIfFrame(state: CompilerState, errorMessage: string): IfFrame {
  const frame = state.ifStack.at(-1);

  if (frame === undefined) {
    throw new Error(errorMessage);
  }

  return frame;
}

function patchJump(
  state: CompilerState,
  instructionIndex: number,
  target: number,
): void {
  const instruction = state.instructions[instructionIndex];

  if (instruction.op !== "JUMP") {
    throw new Error("Compiler error: invalid jump placeholder");
  }

  instruction.target = target;
}

function patchJumpIfFalse(
  state: CompilerState,
  instructionIndex: number,
  target: number,
): void {
  const instruction = state.instructions[instructionIndex];

  if (instruction.op !== "JUMP_IF_FALSE") {
    throw new Error("Compiler error: invalid if jump placeholder");
  }

  instruction.target = target;
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
