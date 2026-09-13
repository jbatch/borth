#include "borth_runtime.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>

typedef enum {
  BORTH_VALUE_INT,
} BorthValueKind;

typedef struct {
  BorthValueKind kind;
  union {
    long integer;
  } as;
} BorthValue;

typedef struct {
  BorthValue *items;
  size_t len;
  size_t capacity;
} BorthValueStack;

struct BorthRuntime {
  BorthValueStack stack;
};

static void borth_panic(const char *message) {
  fprintf(stderr, "runtime error: %s\n", message);
  exit(EXIT_FAILURE);
}

static void borth_assert(bool predicate, const char *message) {
  if (!predicate) {
    borth_panic(message);
  }
}

static BorthValue borth_value_int(long value) {
  BorthValue result;
  result.kind = BORTH_VALUE_INT;
  result.as.integer = value;
  return result;
}

static BorthValue borth_value_bool (bool value) {
  BorthValue result;
  result.kind = BORTH_VALUE_INT;
  result.as.integer = value ? 1 : 0;
  return result;
}

BorthRuntime *borth_runtime_new(void) {
  BorthRuntime *runtime = malloc(sizeof(BorthRuntime));

  if (runtime == NULL) {
    borth_panic("failed to allocate runtime");
  }

  runtime->stack.len = 0;
  runtime->stack.capacity = 64;
  runtime->stack.items = malloc(runtime->stack.capacity * sizeof(BorthValue));

  if (runtime->stack.items == NULL) {
    free(runtime);
    borth_panic("failed to allocate value stack");
  }

  return runtime;
}

void borth_runtime_free(BorthRuntime *runtime) {
  if (runtime == NULL) {
    return;
  }

  free(runtime->stack.items);
  free(runtime);
}

static void borth_stack_grow(BorthRuntime *runtime) {
  size_t next_capacity = runtime->stack.capacity * 2;
  BorthValue *next_items =
      realloc(runtime->stack.items, next_capacity * sizeof(BorthValue));

  if (next_items == NULL) {
    borth_panic("failed to grow value stack");
  }

  runtime->stack.items = next_items;
  runtime->stack.capacity = next_capacity;
}

static void borth_stack_push(BorthRuntime *runtime, BorthValue value) {
  if (runtime->stack.len == runtime->stack.capacity) {
    borth_stack_grow(runtime);
  }

  runtime->stack.items[runtime->stack.len] = value;
  runtime->stack.len += 1;
}

static BorthValue borth_stack_pop(BorthRuntime *runtime, const char *op) {
  if (runtime->stack.len == 0) {
    borth_panic(op);
  }

  runtime->stack.len -= 1;
  return runtime->stack.items[runtime->stack.len];
}

static long borth_pop_int(BorthRuntime *runtime, const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_INT) {
    borth_panic(op);
  }

  return value.as.integer;
}

// Borth Ops

void borth_op_push_int(BorthRuntime *runtime, long value) {
  borth_stack_push(runtime, borth_value_int(value));
}

void borth_op_add(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "ADD requires integers on the stack");
  long left = borth_pop_int(runtime, "ADD requires integers on the stack");

  borth_stack_push(runtime, borth_value_int(left + right));
}

void borth_op_sub(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "SUB requires integers on the stack");
  long left = borth_pop_int(runtime, "SUB requires integers on the stack");

  borth_stack_push(runtime, borth_value_int(left - right));
}

void borth_op_mul(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "MUL requires integers on the stack");
  long left = borth_pop_int(runtime, "MUL requires integers on the stack");

  borth_stack_push(runtime, borth_value_int(left * right));
}

void borth_op_div(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "DIV requires integers on the stack");
  long left = borth_pop_int(runtime, "DIV requires integers on the stack");
  borth_assert(right != 0, "DIV cannot divide by zero");

  borth_stack_push(runtime, borth_value_int(left / right));
}

void borth_op_mod(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "MOD requires integers on the stack");
  long left = borth_pop_int(runtime, "MOD requires integers on the stack");
  borth_assert(right != 0, "MOD cannot divide by zero");

  borth_stack_push(runtime, borth_value_int(left % right));
}

void borth_op_eq(BorthRuntime *runtime) {
  // TODO support EQ for strings
  long right = borth_pop_int(runtime, "EQ requires integers on the stack");
  long left = borth_pop_int(runtime, "EQ requires integers on the stack");

  borth_stack_push(runtime, borth_value_bool(left == right));
}

void borth_op_lt(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "LT requires integers on the stack");
  long left = borth_pop_int(runtime, "LT requires integers on the stack");

  borth_stack_push(runtime, borth_value_bool(left < right));
}

void borth_op_gt(BorthRuntime *runtime) {
  long right = borth_pop_int(runtime, "GT requires integers on the stack");
  long left = borth_pop_int(runtime, "GT requires integers on the stack");

  borth_stack_push(runtime, borth_value_bool(left > right));
}

void borth_op_print(BorthRuntime *runtime) {
  BorthValue value = borth_stack_pop(runtime, "PRINT requires a value on the stack");

  switch (value.kind) {
    case BORTH_VALUE_INT:
      printf("%ld\n", value.as.integer);
      break;
    default:
      borth_panic("PRINT does not support this value kind yet");
  }
}
