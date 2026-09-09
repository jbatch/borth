import assert from "node:assert/strict";
import test from "node:test";

import { run } from "../dist/runner.js";

test("C emitter writes debug instruction lines and clears its inputs", () => {
  const appends = [];
  const output = [];

  run(
    `
      import "lib/c-emitter.borth"

      array-new
        array-new "PUSH" array-push 10 array-push array-push
        array-new "HALT" array-push array-push
      "program.c" write-c-program
      .s
    `,
    {
      appendTextFile: (path, contents) => appends.push([path, contents]),
      write: (value) => output.push(value),
    },
  );

  assert.deepEqual(appends, [
    ["program.c", '["PUSH" 10]\n'],
    ["program.c", '["HALT"]\n'],
  ]);
  assert.deepEqual(output, ["[]"]);
});
