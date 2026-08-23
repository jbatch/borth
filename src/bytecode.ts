import type { Value } from "./value.js";

export type Instruction =
  | { op: "PUSH"; value: Value }
  | { op: "DROP" }
  | { op: "DUP" }
  | { op: "SWAP" }
  | { op: "OVER" }
  | { op: "ROT" }
  | { op: "ADD" }
  | { op: "SUB" }
  | { op: "MUL" }
  | { op: "DIV" }
  | { op: "MOD" }
  | { op: "EQ" }
  | { op: "LT" }
  | { op: "GT" }
  | { op: "CALL"; target: number }
  | { op: "JUMP"; target: number }
  | { op: "JUMP_IF_FALSE"; target: number }
  | { op: "READ_LINE" }
  | { op: "PRINT" }
  | { op: "PRINT_STACK" }
  | { op: "RET" }
  | { op: "HALT" };
