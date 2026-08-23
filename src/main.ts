import { existsSync, readFileSync, statSync } from "node:fs";

import { run } from "./runner.js";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('usage: yarn dev -- "10 20 + print"');
  console.error("   or: yarn dev -- examples/add.borth");
  process.exitCode = 1;
} else {
  try {
    const source = readSource(args);
    run(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  }
}

function readSource(args: string[]): string {
  if (args.length === 1 && existsSync(args[0]) && statSync(args[0]).isFile()) {
    return readFileSync(args[0], "utf8");
  }

  return args.join(" ");
}
