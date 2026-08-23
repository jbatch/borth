import type { Program } from "./ast.js";
import type { Instruction } from "./bytecode.js";

export function compile(program: Program): Instruction[] {
  const instructions: Instruction[] = [];

  for (const node of program.body) {
    switch (node.kind) {
      case "integer":
        instructions.push({ op: "PUSH", value: node.value });
        break;
      case "word":
        instructions.push(compileWord(node.name));
        break;
    }
  }

  instructions.push({ op: "HALT" });
  return instructions;
}

function compileWord(name: string): Instruction {
  switch (name) {
    case "+":
      return { op: "ADD" };
    case "print":
      return { op: "PRINT" };
    default:
      throw new Error(`Unknown word: ${name}`);
  }
}
