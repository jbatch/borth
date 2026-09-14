import type { InstructionSource } from "./source-location.js";
import type { Value } from "./value.js";

export type Instruction = InstructionData & {
  source?: InstructionSource;
};

type InstructionData =
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
  | { op: "STR_BUILDER_NEW" }
  | { op: "STR_BUILDER_PUSH" }
  | { op: "STR_BUILDER_LEN" }
  | { op: "STR_BUILDER_FREEZE" }
  | { op: "MAP_NEW" }
  | { op: "MAP_GET" }
  | { op: "MAP_HAS" }
  | { op: "MAP_SET" }
  | { op: "MAP_SIZE" }
  | { op: "RECORD_NEW" }
  | { op: "RECORD_COPY" }
  | { op: "RECORD_GET" }
  | { op: "RECORD_SET" }
  | { op: "SHOW" }
  | { op: "ARRAY_NEW" }
  | { op: "ARRAY_PUSH" }
  | { op: "ARRAY_LEN" }
  | { op: "ARRAY_GET" }
  | { op: "ARRAY_BUILDER_NEW" }
  | { op: "ARRAY_BUILDER_PUSH" }
  | { op: "ARRAY_BUILDER_LEN" }
  | { op: "ARRAY_BUILDER_GET" }
  | { op: "ARRAY_BUILDER_SET" }
  | { op: "ARRAY_BUILDER_FREEZE" }
  | { op: "FETCH" }
  | { op: "STORE" }
  | { op: "RANDOM" }
  | { op: "CLOCK_MS" }
  | { op: "CALL"; target: number }
  | { op: "JUMP"; target: number }
  | { op: "JUMP_IF_FALSE"; target: number }
  | { op: "READ_LINE" }
  | { op: "READ_INT" }
  | { op: "READ_TEXT_FILE" }
  | { op: "WRITE_TEXT_FILE" }
  | { op: "APPEND_TEXT_FILE" }
  | { op: "FILE_EXISTS" }
  | { op: "ENV" }
  | { op: "ARGS" }
  | { op: "RUN_COMMAND" }
  | { op: "CWD" }
  | { op: "PATH_DIRNAME" }
  | { op: "PATH_RESOLVE" }
  | { op: "PRINT" }
  | { op: "PRINT_STACK" }
  | { op: "PANIC" }
  | { op: "EXIT" }
  | { op: "RET" }
  | { op: "HALT" };
