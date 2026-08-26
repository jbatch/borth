import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

test("panic throws with the provided message", () => {
  assert.throws(() => run('"boom" panic'), /boom/);
});

test("panic stops later instructions from running", () => {
  const output = [];

  assert.throws(
    () =>
      run('"before" print "boom" panic "after" print', {
        write: (value) => output.push(value),
      }),
    /boom/,
  );

  assert.deepEqual(output, ["before"]);
});

test("panic requires a string message", () => {
  assert.throws(() => run("123 panic"), /PANIC requires strings/);
});
