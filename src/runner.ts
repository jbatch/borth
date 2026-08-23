import { compile } from "./compiler.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { execute } from "./vm.js";

export function run(source: string): void {
  const tokens = lex(source);
  const program = parse(tokens);
  const bytecode = compile(program);

  execute(bytecode);
}
