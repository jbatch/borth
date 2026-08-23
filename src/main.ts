import { run } from "./runner.js";

const source = process.argv.slice(2).join(" ");

if (source.length === 0) {
  console.error('usage: yarn dev -- "10 20 + print"');
  process.exitCode = 1;
} else {
  try {
    run(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  }
}
