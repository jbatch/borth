import type { Value } from "./value.js";

export type Instruction =
  | { op: "PUSH"; value: Value }
  | { op: "ALLOC_VARIABLE" }
  | { op: "DROP" }
  | { op: "DUP" }
  | { op: "SWAP" }
  | { op: "OVER" }
  | { op: "ROT" }
  | { op: "ROLL" }
  | { op: "ROLL_REVERSE" }
  | { op: "ADD" }
  | { op: "SUB" }
  | { op: "MUL" }
  | { op: "DIV" }
  | { op: "MOD" }
  | { op: "EQ" }
  | { op: "LT" }
  | { op: "GT" }
  | { op: "STR_LEN" }
  | { op: "STR_CAT" }
  | { op: "STR_SLICE" }
  | { op: "STR_INDEX_OF" }
  | { op: "SHOW" }
  | { op: "ARRAY_NEW" }
  | { op: "ARRAY_PUSH" }
  | { op: "ARRAY_LEN" }
  | { op: "ARRAY_GET" }
  | { op: "FETCH" }
  | { op: "STORE" }
  | { op: "RANDOM" }
  | { op: "CALL"; target: number }
  | { op: "JUMP"; target: number }
  | { op: "JUMP_IF_FALSE"; target: number }
  | { op: "READ_LINE" }
  | { op: "READ_INT" }
  | { op: "READ_TEXT_FILE" }
  | { op: "PRINT" }
  | { op: "PRINT_STACK" }
  | { op: "PANIC" }
  | { op: "RET" }
  | { op: "HALT" };
