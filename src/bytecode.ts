export type Instruction =
  | { op: "PUSH"; value: number }
  | { op: "ADD" }
  | { op: "PRINT" }
  | { op: "HALT" };
