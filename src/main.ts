import { existsSync, readFileSync, readSync, statSync } from "node:fs";

import { run } from "./runner.js";

const stdinFileDescriptor = 0;
const bytesPerRead = 1;
const lineFeedByte = 10;
const carriageReturnByte = 13;

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('usage: yarn dev -- "10 20 + print"');
  console.error("   or: yarn dev -- examples/add.borth");
  process.exitCode = 1;
} else {
  try {
    const source = readSource(args);
    run(source, { read: readLineFromStdin });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  }
}

function readLineFromStdin(): string {
  const bytes: number[] = [];
  const byte = Buffer.alloc(bytesPerRead);

  // TODO: Revisit whether this should use a small stdin/line-reading dependency
  // once input gets more serious. This byte loop is intentionally minimal for now.
  while (true) {
    const bytesRead = readSync(
      stdinFileDescriptor,
      byte,
      0,
      bytesPerRead,
      null,
    );

    if (bytesRead === 0) {
      if (bytes.length === 0) {
        throw new Error("READ_LINE reached end of input");
      }

      break;
    }

    if (byte[0] === lineFeedByte) {
      break;
    }

    bytes.push(byte[0]);
  }

  if (bytes.at(-1) === carriageReturnByte) {
    bytes.pop();
  }

  return Buffer.from(bytes).toString("utf8");
}

function readSource(args: string[]): string {
  if (args.length === 1 && existsSync(args[0]) && statSync(args[0]).isFile()) {
    return readFileSync(args[0], "utf8");
  }

  return args.join(" ");
}
