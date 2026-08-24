import type { AstNode, Program, Word } from "./ast.js";
import type { Instruction } from "./bytecode.js";

type IfFrame = {
  falseJumpIndex: number;
  afterJumpIndex?: number;
  hasElse: boolean;
};

type LoopFrame = {
  startIndex: number;
  whileJumpIndex?: number;
};

type BlockKind = "if" | "loop";

type CompilerState = {
  instructions: Instruction[];
  ifStack: IfFrame[];
  loopStack: LoopFrame[];
  blockStack: BlockKind[];
  definitions: Map<string, number>;
  variables: Map<string, number>;
};

export function compile(program: Program): Instruction[] {
  const state: CompilerState = {
    instructions: [],
    ifStack: [],
    loopStack: [],
    blockStack: [],
    definitions: new Map(),
    variables: new Map(),
  };

  for (let index = 0; index < program.body.length; index += 1) {
    const node = program.body[index];

    if (isWord(node, ":")) {
      index = compileDefinition(state, program.body, index);
    } else if (isWord(node, "variable")) {
      index = compileVariable(state, program.body, index);
    } else {
      compileNode(state, node);
    }
  }

  if (state.ifStack.length > 0) {
    throw new Error("if without matching end");
  }

  if (state.loopStack.length > 0) {
    throw new Error("loop without matching until or repeat");
  }

  state.instructions.push({ op: "HALT" });
  return state.instructions;
}

function compileDefinition(
  state: CompilerState,
  nodes: AstNode[],
  colonIndex: number,
): number {
  if (state.blockStack.length > 0) {
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

  if (isUserWordNameTaken(state, name)) {
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

      if (state.loopStack.length > 0) {
        throw new Error(
          `definition ${name} has loop without matching until or repeat`,
        );
      }

      state.instructions.push({ op: "RET" });
      patchJump(state, skipDefinitionJumpIndex, state.instructions.length);
      return index;
    }

    if (isWord(node, ":")) {
      throw new Error("nested definitions are not supported");
    }

    if (isWord(node, "variable")) {
      throw new Error("variable declarations are only supported at top level");
    }

    compileNode(state, node);
  }

  throw new Error(`definition ${name} without closing ;`);
}

function compileVariable(
  state: CompilerState,
  nodes: AstNode[],
  variableIndex: number,
): number {
  if (state.blockStack.length > 0) {
    throw new Error("variable declarations cannot appear inside control flow");
  }

  const nameNode = nodes[variableIndex + 1];

  if (nameNode === undefined) {
    throw new Error("variable requires a name");
  }

  if (nameNode.kind !== "word") {
    throw new Error("variable name must be a word");
  }

  const name = nameNode.name;

  if (isReservedWord(name)) {
    throw new Error(`cannot define reserved word: ${name}`);
  }

  if (isUserWordNameTaken(state, name)) {
    throw new Error(`word already defined: ${name}`);
  }

  state.variables.set(name, state.variables.size);
  state.instructions.push({ op: "ALLOC_VARIABLE" });

  return variableIndex + 1;
}

function compileNode(state: CompilerState, node: AstNode): void {
  switch (node.kind) {
    case "integer":
      state.instructions.push({ op: "PUSH", value: node.value });
      break;
    case "string":
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
    case "loop":
      compileLoop(state);
      return true;
    case "while":
      compileWhile(state);
      return true;
    case "until":
      compileUntil(state);
      return true;
    case "repeat":
      compileRepeat(state);
      return true;
    case ";":
      throw new Error("; without matching :");
    default:
      return false;
  }
}

function compileIf(state: CompilerState): void {
  state.blockStack.push("if");
  state.ifStack.push({
    falseJumpIndex: state.instructions.length,
    hasElse: false,
  });
  state.instructions.push({ op: "JUMP_IF_FALSE", target: -1 });
}

function compileElse(state: CompilerState): void {
  requireCurrentBlock(
    state,
    "if",
    "else without matching if",
    "else cannot appear before closing inner control flow",
  );
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
  requireCurrentBlock(
    state,
    "if",
    "end without matching if",
    "end cannot close if before inner loop",
  );
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

  state.blockStack.pop();
}

function compileLoop(state: CompilerState): void {
  state.blockStack.push("loop");
  state.loopStack.push({ startIndex: state.instructions.length });
}

function compileWhile(state: CompilerState): void {
  requireCurrentBlock(
    state,
    "loop",
    "while without matching loop",
    "while cannot appear before closing inner control flow",
  );
  const frame = currentLoopFrame(state, "while without matching loop");

  if (frame.whileJumpIndex !== undefined) {
    throw new Error("while after while");
  }

  frame.whileJumpIndex = state.instructions.length;
  state.instructions.push({ op: "JUMP_IF_FALSE", target: -1 });
}

function compileUntil(state: CompilerState): void {
  requireCurrentBlock(
    state,
    "loop",
    "until without matching loop",
    "until cannot close loop before inner if",
  );
  const frame = state.loopStack.pop();

  if (frame === undefined) {
    throw new Error("until without matching loop");
  }

  if (frame.whileJumpIndex !== undefined) {
    throw new Error("until cannot close loop after while");
  }

  state.blockStack.pop();
  state.instructions.push({ op: "JUMP_IF_FALSE", target: frame.startIndex });
}

function compileRepeat(state: CompilerState): void {
  requireCurrentBlock(
    state,
    "loop",
    "repeat without matching loop",
    "repeat cannot close loop before inner control flow",
  );
  const frame = state.loopStack.pop();

  if (frame === undefined) {
    throw new Error("repeat without matching loop");
  }

  if (frame.whileJumpIndex === undefined) {
    throw new Error("repeat without matching while");
  }

  state.blockStack.pop();
  state.instructions.push({ op: "JUMP", target: frame.startIndex });
  patchJumpIfFalse(state, frame.whileJumpIndex, state.instructions.length);
}

function currentIfFrame(state: CompilerState, errorMessage: string): IfFrame {
  const frame = state.ifStack.at(-1);

  if (frame === undefined) {
    throw new Error(errorMessage);
  }

  return frame;
}

function currentLoopFrame(
  state: CompilerState,
  errorMessage: string,
): LoopFrame {
  const frame = state.loopStack.at(-1);

  if (frame === undefined) {
    throw new Error(errorMessage);
  }

  return frame;
}

function requireCurrentBlock(
  state: CompilerState,
  kind: BlockKind,
  missingBlockError: string,
  errorMessage: string,
): void {
  const current = state.blockStack.at(-1);

  if (current === undefined) {
    throw new Error(missingBlockError);
  }

  if (current !== kind) {
    throw new Error(errorMessage);
  }
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

  const variableIndex = state.variables.get(name);

  if (variableIndex !== undefined) {
    return {
      op: "PUSH",
      value: { kind: "address", index: variableIndex },
    };
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
    case "rot":
      return { op: "ROT" };
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
    case "str-len":
      return { op: "STR_LEN" };
    case "str-cat":
      return { op: "STR_CAT" };
    case "str-slice":
      return { op: "STR_SLICE" };
    case "str-index-of":
      return { op: "STR_INDEX_OF" };
    case "@":
      return { op: "FETCH" };
    case "!":
      return { op: "STORE" };
    case "random":
      return { op: "RANDOM" };
    case "read-line":
      return { op: "READ_LINE" };
    case "read-int":
      return { op: "READ_INT" };
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
    name === "loop" ||
    name === "while" ||
    name === "until" ||
    name === "repeat" ||
    name === "variable" ||
    compileBuiltInWord(name) !== undefined
  );
}

function isUserWordNameTaken(state: CompilerState, name: string): boolean {
  return state.definitions.has(name) || state.variables.has(name);
}
