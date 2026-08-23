import { compile } from "./compiler.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { execute, type ExecuteOptions, type VmState } from "./vm.js";

export type RunOptions = ExecuteOptions;

export function run(source: string, options: RunOptions = {}): VmState {
  const tokens = lex(source);
  const program = parse(tokens);
  const bytecode = compile(program);

  return execute(bytecode, options);
}
