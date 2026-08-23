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

test("strings can contain whitespace", () => {
  assert.deepEqual(outputOf('"hello, borth" print'), ["hello, borth"]);
});

test("strings support basic escapes", () => {
  assert.deepEqual(outputOf('"quote: \\"" print "slash: \\\\" print'), [
    'quote: "',
    "slash: \\",
  ]);
});

test("strings support newline escapes", () => {
  assert.deepEqual(outputOf('"one\\ntwo" print'), ["one\ntwo"]);
});

test("stack words operate on strings", () => {
  assert.deepEqual(outputOf('"hello" dup print print'), ["hello", "hello"]);
});

test(".s prints strings with quotes", () => {
  assert.deepEqual(outputOf('"hello" 123 .s'), ['["hello" 123]']);
});

test("string equality returns numeric flags", () => {
  assert.deepEqual(outputOf('"hello" "hello" = print'), [1]);
  assert.deepEqual(outputOf('"hello" "there" = print'), [0]);
});

test("string equality works in conditionals", () => {
  assert.deepEqual(outputOf('"yes" "yes" = if "ok" print end'), ["ok"]);
});

test("str-cat concatenates two strings", () => {
  assert.deepEqual(outputOf('"hello, " "borth" str-cat print'), [
    "hello, borth",
  ]);
});

test("str-cat leaves the concatenated string on the stack", () => {
  const state = run('"a" "b" str-cat', { write: () => undefined });

  assert.deepEqual(state.stack, ["ab"]);
});

test("equality requires matching supported types", () => {
  assert.throws(
    () => outputOf('"1" 1 ='),
    /EQ requires matching numbers or strings/,
  );
});

test("arithmetic requires numbers", () => {
  assert.throws(() => outputOf('"hello" 1 +'), /ADD requires numbers/);
});

test("str-cat requires strings", () => {
  assert.throws(() => outputOf('"hello" 1 str-cat'), /STR_CAT requires strings/);
});

test("conditionals require numbers", () => {
  assert.throws(
    () => outputOf('"hello" if 1 print end'),
    /JUMP_IF_FALSE requires numbers/,
  );
});

test("unterminated strings throw", () => {
  assert.throws(() => outputOf('"hello'), /Unterminated string literal/);
});

test("strings cannot span lines", () => {
  assert.throws(
    () => outputOf('"hello\nthere" print'),
    /String literal cannot span lines/,
  );
});

test("unknown string escapes throw", () => {
  assert.throws(() => outputOf('"hello\\t"'), /Unknown escape sequence: \\t/);
});
