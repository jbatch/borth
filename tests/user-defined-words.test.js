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
