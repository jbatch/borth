import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

function outputOf(source) {
  const output = [];

  run(source, {
    write: (value) => output.push(value),
  });

  return output;
}

test("user-defined words can transform the stack", () => {
  assert.deepEqual(
    outputOf(`
      : square
        dup *
      ;

      10 square print
    `),
    [100],
  );
});

test("definitions are skipped during normal execution", () => {
  assert.deepEqual(
    outputOf(`
      : noisy
        999 print
      ;

      111 print
    `),
    [111],
  );
});

test("definitions can call earlier definitions", () => {
  assert.deepEqual(
    outputOf(`
      : square
        dup *
      ;

      : fourth-power
        square square
      ;

      2 fourth-power print
    `),
    [16],
  );
});

test("using a word before it is defined throws", () => {
  assert.throws(
    () =>
      outputOf(`
        10 square print

        : square
          dup *
        ;
      `),
    /Unknown word: square/,
  );
});

test("unclosed definitions throw", () => {
  assert.throws(
    () =>
      outputOf(`
        : square
          dup *
      `),
    /definition square without closing ;/,
  );
});

test("user-defined words can call themselves recursively", () => {
  assert.deepEqual(
    outputOf(`
      : fact
        dup 2 < if
          drop 1
        else
          dup 1 - fact *
        end
      ;

      5 fact print
    `),
    [120],
  );
});

test("recursive calls unwind the call stack", () => {
  const state = run(
    `
      : fact
        dup 2 < if
          drop 1
        else
          dup 1 - fact *
        end
      ;

      5 fact
    `,
    { write: () => undefined },
  );

  assert.deepEqual(state.stack, [120]);
  assert.deepEqual(state.callStack, []);
});

test(".s prints the stack without changing it", () => {
  assert.deepEqual(outputOf("10 20 .s + .s"), ["[10 20]", "[30]"]);
});
