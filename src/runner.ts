import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  compileProgram,
  createCompilerState,
  finishCompile,
} from "./compiler.js";
import { lex } from "./lexer.js";
import { parse } from "./parser.js";
import { execute, type ExecuteOptions, type VmState } from "./vm.js";

export type RunOptions = ExecuteOptions;

const preludePath = fileURLToPath(new URL("../prelude.borth", import.meta.url));
const preludeSource = readFileSync(preludePath, "utf8");

export function run(source: string, options: RunOptions = {}): VmState {
  const bytecode = compileSource(source);

  return execute(bytecode, options);
}

export function runFile(path: string, options: RunOptions = {}): VmState {
  const absolutePath = resolve(path);
  const source = readFileSync(absolutePath, "utf8");
  const bytecode = compileSource(source, absolutePath);

  return execute(bytecode, options);
}

function compileSource(source: string, sourcePath?: string) {
  const state = createCompilerState();
  const loadedModules = new Set<string>();
  const loadingModules = new Set<string>();

  function compileModuleSource(
    moduleSource: string,
    modulePath: string | undefined,
    allowTopLevelCode: boolean,
  ): void {
    const tokens = lex(moduleSource);
    const program = parse(tokens);
    const baseDir = modulePath === undefined ? process.cwd() : dirname(modulePath);

    compileProgram(state, program, {
      allowTopLevelCode,
      importModule: (importPath) => loadImportedModule(importPath, baseDir),
    });
  }

  function loadImportedModule(importPath: string, baseDir: string): void {
    const absolutePath = resolve(baseDir, importPath);

    if (loadedModules.has(absolutePath)) {
      return;
    }

    if (loadingModules.has(absolutePath)) {
      throw new Error(`import cycle involving ${absolutePath}`);
    }

    loadingModules.add(absolutePath);

    try {
      const moduleSource = readFileSync(absolutePath, "utf8");
      compileModuleSource(moduleSource, absolutePath, false);
      loadedModules.add(absolutePath);
    } finally {
      loadingModules.delete(absolutePath);
    }
  }

  compileModuleSource(preludeSource, preludePath, false);
  compileModuleSource(source, sourcePath, true);

  return finishCompile(state);
}
