import type { AstNode, Program, Word } from "./ast.js";
import type { Instruction } from "./bytecode.js";

type IfFrame = {
  falseJumpIndex: number;
  afterJumpIndex?: number;
  hasElse: boolean;
};

type CompilerState = {
  instructions: Instruction[];
  ifStack: IfFrame[];
  definitions: Map<string, number>;
};

export function compile(program: Program): Instruction[] {
  const state: CompilerState = {
    instructions: [],
    ifStack: [],
    definitions: new Map(),
  };

  for (let index = 0; index < program.body.length; index += 1) {
    const node = program.body[index];

    if (isWord(node, ":")) {
      index = compileDefinition(state, program.body, index);
    } else {
      compileNode(state, node);
    }
  }

  if (state.ifStack.length > 0) {
    throw new Error("if without matching end");
  }

  state.instructions.push({ op: "HALT" });
  return state.instructions;
}

function compileDefinition(
  state: CompilerState,
  nodes: AstNode[],
  colonIndex: number,
): number {
  if (state.ifStack.length > 0) {
    throw new Error("definitions cannot appear inside control flow");
  }

  const nameNode = nodes[colonIndex + 1];

  if (nameNode === undefined) {
    throw new Error(": requires a word name");
  }

  if (nameNode.kind !== "word") {
    throw new Error("definition name must be a word");
  }

  const name = nameNode.name;

  if (isReservedWord(name)) {
    throw new Error(`cannot define reserved word: ${name}`);
  }

  if (state.definitions.has(name)) {
    throw new Error(`word already defined: ${name}`);
  }

  const skipDefinitionJumpIndex = state.instructions.length;
  state.instructions.push({ op: "JUMP", target: -1 });
  state.definitions.set(name, state.instructions.length);

  for (let index = colonIndex + 2; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (isWord(node, ";")) {
      if (state.ifStack.length > 0) {
        throw new Error(`definition ${name} has if without matching end`);
      }

      state.instructions.push({ op: "RET" });
      patchJump(state, skipDefinitionJumpIndex, state.instructions.length);
      return index;
    }

    if (isWord(node, ":")) {
      throw new Error("nested definitions are not supported");
    }

    compileNode(state, node);
  }

  throw new Error(`definition ${name} without closing ;`);
}

function compileNode(state: CompilerState, node: AstNode): void {
  switch (node.kind) {
    case "integer":
      state.instructions.push({ op: "PUSH", value: node.value });
      break;
    case "word":
      if (!compileControlWord(state, node.name)) {
        state.instructions.push(compileWord(state, node.name));
      }
      break;
  }
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
    case ";":
      throw new Error("; without matching :");
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

function compileWord(state: CompilerState, name: string): Instruction {
  const builtIn = compileBuiltInWord(name);

  if (builtIn !== undefined) {
    return builtIn;
  }

  const target = state.definitions.get(name);

  if (target !== undefined) {
    return { op: "CALL", target };
  }

  throw new Error(`Unknown word: ${name}`);
}

function compileBuiltInWord(name: string): Instruction | undefined {
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
    case ".s":
      return { op: "PRINT_STACK" };
    default:
      return undefined;
  }
}

function isWord(node: AstNode, name: string): node is Word {
  return node.kind === "word" && node.name === name;
}

function isReservedWord(name: string): boolean {
  return (
    name === ":" ||
    name === ";" ||
    name === "if" ||
    name === "else" ||
    name === "end" ||
    compileBuiltInWord(name) !== undefined
  );
}
