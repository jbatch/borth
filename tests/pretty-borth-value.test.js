import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";

test("pretty printer summarizes known Borth structures by default", () => {
  assert.equal(
    pretty(
      '["main.borth" [["word" "dup"]] 0 [["PUSH" 10]] 1 [] [["square" 2]] [] []]',
    ),
    [
      "<compiler-state",
      '  file: "main.borth"',
      "  node-index: 0/1",
      "  instructions: <array 1>",
      "  allow-top-level-code: 1",
      "  block-stack: []",
      '  words: <map 1: "square">',
      "  variables: <map 0>",
      "  deferred-calls: <map 0>",
      ">",
    ].join("\n"),
  );
});

test("pretty printer can still show raw arrays", () => {
  assert.equal(pretty('["word" "dup"]', "--raw"), '["word" "dup"]');
});

function pretty(input, ...args) {
  const result = spawnSync(
    process.execPath,
    ["tools/pretty-borth-value.js", ...args, input],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr);
  }

  return result.stdout.trimEnd();
}
