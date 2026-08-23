export type Instruction =
  | { op: "PUSH"; value: number }
  | { op: "DROP" }
  | { op: "DUP" }
  | { op: "SWAP" }
  | { op: "OVER" }
  | { op: "ADD" }
  | { op: "SUB" }
  | { op: "MUL" }
  | { op: "DIV" }
  | { op: "MOD" }
  | { op: "EQ" }
  | { op: "LT" }
  | { op: "GT" }
  | { op: "JUMP"; target: number }
  | { op: "JUMP_IF_FALSE"; target: number }
  | { op: "PRINT" }
  | { op: "HALT" };
