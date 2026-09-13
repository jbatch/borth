import type { AstNode, Program, Word } from "./ast.js";
import type { Instruction } from "./bytecode.js";
import {
  formatSourceLocation as formatInstructionSourceLocation,
  type InstructionSource,
} from "./source-location.js";

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

export type CompilerState = {
  instructions: Instruction[];
  ifStack: IfFrame[];
  loopStack: LoopFrame[];
  blockStack: BlockKind[];
  definitions: Map<string, number>;
  variables: Map<string, number>;
  deferredCalls: Map<string, number[]>;
};

export type CompileProgramOptions = {
  allowTopLevelCode: boolean;
  importModule?: (path: string) => void;
  sourcePath?: string;
};

export function createCompilerState(): CompilerState {
  return {
    instructions: [],
    ifStack: [],
    loopStack: [],
    blockStack: [],
    definitions: new Map(),
    variables: new Map(),
    deferredCalls: new Map(),
  };
}

export function compile(program: Program): Instruction[] {
  const state = createCompilerState();
  compileProgram(state, program, { allowTopLevelCode: true });
  return finishCompile(state);
}

export function compileProgram(
  state: CompilerState,
  program: Program,
  options: CompileProgramOptions,
): void {
  for (let index = 0; index < program.body.length; index += 1) {
    const node = program.body[index];

    if (isWord(node, ":")) {
      index = compileDefinition(state, program.body, index, options);
    } else if (isWord(node, "variable")) {
      index = compileVariable(state, program.body, index, options);
    } else if (isDeferredDeclaration(node)) {
      index = compileDeferred(state, program.body, index, options);
    } else if (isWord(node, "import")) {
      index = compileImport(state, program.body, index, options);
    } else if (!options.allowTopLevelCode) {
      throw compileError(
        options,
        node,
        `imported module cannot contain top-level executable code: ${formatNode(
          node,
        )}`,
      );
    } else {
      compileNode(state, node, options);
    }
  }
}

export function finishCompile(state: CompilerState): Instruction[] {
  if (state.ifStack.length > 0) {
    throw new Error("if without matching end");
  }

  if (state.loopStack.length > 0) {
    throw new Error("loop without matching until or repeat");
  }

  for (const [name, target] of state.definitions) {
    if (target === -1) {
      throw new Error(`deferred word never defined: ${name}`);
    }
  }

  state.instructions.push({ op: "HALT" });
  return state.instructions;
}

function compileImport(
  state: CompilerState,
  nodes: AstNode[],
  importIndex: number,
  options: CompileProgramOptions,
): number {
  const importNode = nodes[importIndex];

  if (state.blockStack.length > 0) {
    throw compileError(
      options,
      importNode,
      "imports cannot appear inside control flow",
    );
  }

  const pathNode = nodes[importIndex + 1];

  if (pathNode === undefined) {
    throw compileError(options, importNode, "import requires a path string");
  }

  if (pathNode.kind !== "string") {
    throw compileError(options, pathNode, "import path must be a string");
  }

  if (options.importModule === undefined) {
    throw compileError(options, importNode, "import requires a module loader");
  }

  options.importModule(pathNode.value);

  return importIndex + 1;
}

function compileDefinition(
  state: CompilerState,
  nodes: AstNode[],
  colonIndex: number,
  options: CompileProgramOptions,
): number {
  const colonNode = nodes[colonIndex];

  if (state.blockStack.length > 0) {
    throw compileError(
      options,
      colonNode,
      "definitions cannot appear inside control flow",
    );
  }

  const nameNode = nodes[colonIndex + 1];

  if (nameNode === undefined) {
    throw compileError(options, colonNode, ": requires a word name");
  }

  if (nameNode.kind !== "word") {
    throw compileError(options, nameNode, "definition name must be a word");
  }

  const name = nameNode.name;

  if (isReservedWord(name)) {
    throw compileError(options, nameNode, `cannot define reserved word: ${name}`);
  }

  if (state.variables.has(name)) {
    throw compileError(options, nameNode, `word already defined: ${name}`);
  }

  const previousDefinition = state.definitions.get(name);

  if (previousDefinition !== undefined && previousDefinition !== -1) {
    throw compileError(options, nameNode, `word already defined: ${name}`);
  }

  const skipDefinitionJumpIndex = state.instructions.length;
  state.instructions.push(withSource({ op: "JUMP", target: -1 }, colonNode, options));
  const definitionStart = state.instructions.length;
  state.definitions.set(name, definitionStart);
  patchDeferredCalls(state, name, definitionStart);

  for (let index = colonIndex + 2; index < nodes.length; index += 1) {
    const node = nodes[index];

    if (isWord(node, ";")) {
      if (state.ifStack.length > 0) {
        throw compileError(
          options,
          node,
          `definition ${name} has if without matching end`,
        );
      }

      if (state.loopStack.length > 0) {
        throw compileError(
          options,
          node,
          `definition ${name} has loop without matching until or repeat`,
        );
      }

      state.instructions.push(withSource({ op: "RET" }, node, options));
      patchJump(state, skipDefinitionJumpIndex, state.instructions.length);
      return index;
    }

    if (isWord(node, ":")) {
      throw compileError(options, node, "nested definitions are not supported");
    }

    if (isWord(node, "variable")) {
      throw compileError(
        options,
        node,
        "variable declarations are only supported at top level",
      );
    }

    if (isDeferredDeclaration(node)) {
      throw compileError(
        options,
        node,
        "deferred declarations are only supported at top level",
      );
    }

    if (isWord(node, "import")) {
      throw compileError(
        options,
        node,
        "imports are only supported at top level",
      );
    }

    compileNode(state, node, options);
  }

  throw compileError(options, colonNode, `definition ${name} without closing ;`);
}

function compileVariable(
  state: CompilerState,
  nodes: AstNode[],
  variableIndex: number,
  options: CompileProgramOptions,
): number {
  const variableNode = nodes[variableIndex];

  if (state.blockStack.length > 0) {
    throw compileError(
      options,
      variableNode,
      "variable declarations cannot appear inside control flow",
    );
  }

  const nameNode = nodes[variableIndex + 1];

  if (nameNode === undefined) {
    throw compileError(options, variableNode, "variable requires a name");
  }

  if (nameNode.kind !== "word") {
    throw compileError(options, nameNode, "variable name must be a word");
  }

  const name = nameNode.name;

  if (isReservedWord(name)) {
    throw compileError(options, nameNode, `cannot define reserved word: ${name}`);
  }

  if (isUserWordNameTaken(state, name)) {
    throw compileError(options, nameNode, `word already defined: ${name}`);
  }

  state.variables.set(name, state.variables.size);
  state.instructions.push(withSource({ op: "ALLOC_VARIABLE" }, nameNode, options));

  return variableIndex + 1;
}

function compileDeferred(
  state: CompilerState,
  nodes: AstNode[],
  deferredIndex: number,
  options: CompileProgramOptions,
): number {
  const deferredNode = nodes[deferredIndex];

  if (state.blockStack.length > 0) {
    throw compileError(
      options,
      deferredNode,
      "deferred declarations cannot appear inside control flow",
    );
  }

  const nameNode = nodes[deferredIndex + 1];

  if (nameNode === undefined) {
    throw compileError(options, deferredNode, "deferred requires a word name");
  }

  if (nameNode.kind !== "word") {
    throw compileError(options, nameNode, "deferred name must be a word");
  }

  const name = nameNode.name;

  if (isReservedWord(name)) {
    throw compileError(
      options,
      nameNode,
      `cannot declare reserved word as deferred: ${name}`,
    );
  }

  if (isUserWordNameTaken(state, name)) {
    throw compileError(options, nameNode, `word already defined: ${name}`);
  }

  state.definitions.set(name, -1);
  state.deferredCalls.set(name, []);

  return deferredIndex + 1;
}

function compileNode(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  switch (node.kind) {
    case "integer":
      state.instructions.push(withSource({ op: "PUSH", value: node.value }, node, options));
      break;
    case "string":
      state.instructions.push(withSource({ op: "PUSH", value: node.value }, node, options));
      break;
    case "word":
      if (!compileControlWord(state, node, options)) {
        state.instructions.push(compileWord(state, node, options));
      }
      break;
  }
}

function compileControlWord(
  state: CompilerState,
  node: Word,
  options: CompileProgramOptions,
): boolean {
  switch (node.name) {
    case "if":
      compileIf(state, node, options);
      return true;
    case "else":
      compileElse(state, node, options);
      return true;
    case "end":
      compileEnd(state, node, options);
      return true;
    case "loop":
      compileLoop(state, node, options);
      return true;
    case "while":
      compileWhile(state, node, options);
      return true;
    case "until":
      compileUntil(state, node, options);
      return true;
    case "repeat":
      compileRepeat(state, node, options);
      return true;
    case "import":
      throw compileError(options, node, "imports are only supported at top level");
    case "deferred":
      throw compileError(
        options,
        node,
        "deferred declarations are only supported at top level",
      );
    case ";":
      throw compileError(options, node, "; without matching :");
    default:
      return false;
  }
}

function compileIf(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  state.blockStack.push("if");
  state.ifStack.push({
    falseJumpIndex: state.instructions.length,
    hasElse: false,
  });
  state.instructions.push(
    withSource({ op: "JUMP_IF_FALSE", target: -1 }, node, options),
  );
}

function compileElse(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  requireCurrentBlock(
    state,
    "if",
    "else without matching if",
    "else cannot appear before closing inner control flow",
    node,
    options,
  );
  const frame = currentIfFrame(state, "else without matching if", node, options);

  if (frame.hasElse) {
    throw compileError(options, node, "else after else");
  }

  frame.afterJumpIndex = state.instructions.length;
  frame.hasElse = true;

  state.instructions.push(withSource({ op: "JUMP", target: -1 }, node, options));
  patchJumpIfFalse(state, frame.falseJumpIndex, state.instructions.length);
}

function compileEnd(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  requireCurrentBlock(
    state,
    "if",
    "end without matching if",
    "end cannot close if before inner loop",
    node,
    options,
  );
  const frame = state.ifStack.pop();

  if (frame === undefined) {
    throw compileError(options, node, "end without matching if");
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

function compileLoop(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  state.blockStack.push("loop");
  state.loopStack.push({ startIndex: state.instructions.length });
}

function compileWhile(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  requireCurrentBlock(
    state,
    "loop",
    "while without matching loop",
    "while cannot appear before closing inner control flow",
    node,
    options,
  );
  const frame = currentLoopFrame(
    state,
    "while without matching loop",
    node,
    options,
  );

  if (frame.whileJumpIndex !== undefined) {
    throw compileError(options, node, "while after while");
  }

  frame.whileJumpIndex = state.instructions.length;
  state.instructions.push(
    withSource({ op: "JUMP_IF_FALSE", target: -1 }, node, options),
  );
}

function compileUntil(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  requireCurrentBlock(
    state,
    "loop",
    "until without matching loop",
    "until cannot close loop before inner if",
    node,
    options,
  );
  const frame = state.loopStack.pop();

  if (frame === undefined) {
    throw compileError(options, node, "until without matching loop");
  }

  if (frame.whileJumpIndex !== undefined) {
    throw compileError(options, node, "until cannot close loop after while");
  }

  state.blockStack.pop();
  state.instructions.push(
    withSource({ op: "JUMP_IF_FALSE", target: frame.startIndex }, node, options),
  );
}

function compileRepeat(
  state: CompilerState,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  requireCurrentBlock(
    state,
    "loop",
    "repeat without matching loop",
    "repeat cannot close loop before inner control flow",
    node,
    options,
  );
  const frame = state.loopStack.pop();

  if (frame === undefined) {
    throw compileError(options, node, "repeat without matching loop");
  }

  if (frame.whileJumpIndex === undefined) {
    throw compileError(options, node, "repeat without matching while");
  }

  state.blockStack.pop();
  state.instructions.push(
    withSource({ op: "JUMP", target: frame.startIndex }, node, options),
  );
  patchJumpIfFalse(state, frame.whileJumpIndex, state.instructions.length);
}

function currentIfFrame(
  state: CompilerState,
  errorMessage: string,
  node: AstNode,
  options: CompileProgramOptions,
): IfFrame {
  const frame = state.ifStack.at(-1);

  if (frame === undefined) {
    throw compileError(options, node, errorMessage);
  }

  return frame;
}

function currentLoopFrame(
  state: CompilerState,
  errorMessage: string,
  node: AstNode,
  options: CompileProgramOptions,
): LoopFrame {
  const frame = state.loopStack.at(-1);

  if (frame === undefined) {
    throw compileError(options, node, errorMessage);
  }

  return frame;
}

function requireCurrentBlock(
  state: CompilerState,
  kind: BlockKind,
  missingBlockError: string,
  errorMessage: string,
  node: AstNode,
  options: CompileProgramOptions,
): void {
  const current = state.blockStack.at(-1);

  if (current === undefined) {
    throw compileError(options, node, missingBlockError);
  }

  if (current !== kind) {
    throw compileError(options, node, errorMessage);
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

function compileWord(
  state: CompilerState,
  node: Word,
  options: CompileProgramOptions,
): Instruction {
  const name = node.name;
  const builtIn = compileBuiltInWord(name);

  if (builtIn !== undefined) {
    return withSource(builtIn, node, options);
  }

  const target = state.definitions.get(name);

  if (target !== undefined) {
    if (target === -1) {
      recordDeferredCall(state, name, state.instructions.length);
    }

    return withSource({ op: "CALL", target }, node, options);
  }

  const variableIndex = state.variables.get(name);

  if (variableIndex !== undefined) {
    return withSource(
      {
        op: "PUSH",
        value: { kind: "address", index: variableIndex },
      },
      node,
      options,
    );
  }

  throw compileError(options, node, `Unknown word: ${name}`);
}

function recordDeferredCall(
  state: CompilerState,
  name: string,
  instructionIndex: number,
): void {
  const calls = state.deferredCalls.get(name);

  if (calls === undefined) {
    throw new Error(`Compiler error: missing deferred call list for ${name}`);
  }

  calls.push(instructionIndex);
}

function patchDeferredCalls(
  state: CompilerState,
  name: string,
  target: number,
): void {
  const calls = state.deferredCalls.get(name);

  if (calls === undefined) {
    return;
  }

  for (const instructionIndex of calls) {
    const instruction = state.instructions[instructionIndex];

    if (instruction.op !== "CALL") {
      throw new Error("Compiler error: invalid deferred call placeholder");
    }

    instruction.target = target;
  }

  state.deferredCalls.delete(name);
}

function withSource(
  instruction: Instruction,
  node: AstNode,
  options: CompileProgramOptions,
): Instruction {
  return {
    ...instruction,
    source: instructionSource(options, node),
  };
}

function instructionSource(
  options: CompileProgramOptions,
  node: AstNode,
): InstructionSource {
  return {
    sourcePath: options.sourcePath,
    span: node.span,
  };
}

function compileError(
  options: CompileProgramOptions,
  node: AstNode,
  message: string,
): Error {
  return new Error(
    `${formatSourceLocation(options.sourcePath, node)}: ${message}`,
  );
}

function formatSourceLocation(
  sourcePath: string | undefined,
  node: AstNode,
): string {
  return formatInstructionSourceLocation({ sourcePath, span: node.span });
}

function formatNode(node: AstNode): string {
  switch (node.kind) {
    case "integer":
      return `integer ${node.value}`;
    case "string":
      return `string ${JSON.stringify(node.value)}`;
    case "word":
      return `word ${JSON.stringify(node.name)}`;
  }
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
    case "roll":
      return { op: "ROLL" };
    case "-roll":
      return { op: "ROLL_REVERSE" };
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
    case "show":
      return { op: "SHOW" };
    case "array-new":
      return { op: "ARRAY_NEW" };
    case "array-push":
      return { op: "ARRAY_PUSH" };
    case "array-len":
      return { op: "ARRAY_LEN" };
    case "array-get":
      return { op: "ARRAY_GET" };
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
    case "read-text-file":
      return { op: "READ_TEXT_FILE" };
    case "write-text-file":
      return { op: "WRITE_TEXT_FILE" };
    case "append-text-file":
      return { op: "APPEND_TEXT_FILE" };
    case "file-exist?":
      return { op: "FILE_EXISTS" };
    case "env":
      return { op: "ENV" };
    case "args":
      return { op: "ARGS" };
    case "run-command":
      return { op: "RUN_COMMAND" };
    case "cwd":
      return { op: "CWD" };
    case "path-dirname":
      return { op: "PATH_DIRNAME" };
    case "path-resolve":
      return { op: "PATH_RESOLVE" };
    case "print":
      return { op: "PRINT" };
    case ".s":
      return { op: "PRINT_STACK" };
    case "panic":
      return { op: "PANIC" };
    case "exit":
      return { op: "EXIT" };
    default:
      return undefined;
  }
}

function isWord(node: AstNode, name: string): node is Word {
  return node.kind === "word" && node.name === name;
}

function isDeferredDeclaration(node: AstNode): node is Word {
  return isWord(node, "deferred");
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
    name === "import" ||
    name === "variable" ||
    name === "deferred" ||
    compileBuiltInWord(name) !== undefined
  );
}

function isUserWordNameTaken(state: CompilerState, name: string): boolean {
  return state.definitions.has(name) || state.variables.has(name);
}
