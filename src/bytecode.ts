export type Instruction =
  | { op: "PUSH"; value: number }
  | { op: "DROP" }
  | { op: "DUP" }
  | { op: "SWAP" }
  | { op: "ADD" }
  | { op: "SUB" }
  | { op: "MUL" }
  | { op: "DIV" }
  | { op: "MOD" }
  | { op: "EQ" }
  | { op: "LT" }
  | { op: "GT" }
  | { op: "PRINT" }
  | { op: "HALT" };
