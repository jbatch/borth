#ifndef BORTH_RUNTIME_H
#define BORTH_RUNTIME_H

typedef struct BorthRuntime BorthRuntime;

BorthRuntime *borth_runtime_new(void);
void borth_runtime_free(BorthRuntime *runtime);

void borth_op_push_int(BorthRuntime *runtime, long value);
void borth_op_add(BorthRuntime *runtime);
void borth_op_sub(BorthRuntime *runtime);
void borth_op_mul(BorthRuntime *runtime);
void borth_op_div(BorthRuntime *runtime);
void borth_op_mod(BorthRuntime *runtime);
void borth_op_eq(BorthRuntime *runtime);
void borth_op_lt(BorthRuntime *runtime);
void borth_op_gt(BorthRuntime *runtime);

void borth_op_print(BorthRuntime *runtime);

#endif
