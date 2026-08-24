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

test("if runs its body for a non-zero flag", () => {
  assert.deepEqual(outputOf("1 if 111 print end"), [111]);
});

test("if skips its body for a zero flag", () => {
  assert.deepEqual(outputOf("0 if 111 print end"), []);
});

test("if else runs the true branch for a non-zero flag", () => {
  assert.deepEqual(outputOf("1 if 111 print else 222 print end"), [111]);
});

test("if else runs the false branch for a zero flag", () => {
  assert.deepEqual(outputOf("0 if 111 print else 222 print end"), [222]);
});

test("else belongs to the nearest unmatched if", () => {
  assert.deepEqual(
    outputOf("1 if 0 if 111 print else 222 print end else 333 print end"),
    [222],
  );
});

test("else after a closed inner if belongs to the outer if", () => {
  assert.deepEqual(
    outputOf("0 if 1 if 111 print end else 222 print end"),
    [222],
  );
});

test("else without if throws", () => {
  assert.throws(() => outputOf("else"), /else without matching if/);
});

test("duplicate else throws", () => {
  assert.throws(
    () => outputOf("1 if 111 print else 222 print else 333 print end"),
    /else after else/,
  );
});

test("if without end throws", () => {
  assert.throws(
    () => outputOf("1 if 111 print else 222 print"),
    /if without matching end/,
  );
});

test("loop until repeats until the flag is non-zero", () => {
  assert.deepEqual(outputOf("1 loop dup print 1 + dup 4 = until drop"), [
    1,
    2,
    3,
  ]);
});

test("loop until runs its body at least once", () => {
  assert.deepEqual(outputOf("0 loop 1 + dup print 1 until drop"), [1]);
});

test("loop while repeat checks the condition before each body run", () => {
  assert.deepEqual(
    outputOf("0 loop dup 3 < while 1 + dup print repeat drop"),
    [1, 2, 3],
  );
});

test("loop while repeat can skip its body", () => {
  assert.deepEqual(
    outputOf("3 loop dup 3 < while 1 + dup print repeat drop"),
    [],
  );
});

test("until without loop throws", () => {
  assert.throws(() => outputOf("1 until"), /until without matching loop/);
});

test("while without loop throws", () => {
  assert.throws(() => outputOf("1 while"), /while without matching loop/);
});

test("repeat without loop throws", () => {
  assert.throws(() => outputOf("repeat"), /repeat without matching loop/);
});

test("repeat without while throws", () => {
  assert.throws(() => outputOf("loop 1 repeat"), /repeat without matching while/);
});

test("loop without until throws", () => {
  assert.throws(() => outputOf("1 loop dup"), /loop without matching until/);
});

test("definitions cannot close with an unclosed loop", () => {
  assert.throws(
    () =>
      outputOf(`
        : broken
          loop
            1
        ;
      `),
    /definition broken has loop without matching until/,
  );
});

test("loop and if blocks must not cross", () => {
  assert.throws(
    () => outputOf("loop 1 if 1 until end"),
    /until cannot close loop before inner if/,
  );
});

test("while loops must close with repeat", () => {
  assert.throws(
    () => outputOf("loop 1 while 2 until"),
    /until cannot close loop after while/,
  );
});

test("loop while repeat blocks must not cross", () => {
  assert.throws(
    () => outputOf("loop 1 while 1 if repeat end"),
    /repeat cannot close loop before inner control flow/,
  );
});
