#ifndef BORTH_RUNTIME_H
#define BORTH_RUNTIME_H

typedef struct BorthRuntime BorthRuntime;

BorthRuntime *borth_runtime_new(void);
BorthRuntime *borth_runtime_new_with_args(int argc, char **argv);
void borth_runtime_free(BorthRuntime *runtime);

void borth_op_push_int(BorthRuntime *runtime, long value);
void borth_op_push_string(BorthRuntime *runtime, const char *value);
void borth_op_drop(BorthRuntime *runtime);
void borth_op_dup(BorthRuntime *runtime);
void borth_op_swap(BorthRuntime *runtime);
void borth_op_over(BorthRuntime *runtime);
void borth_op_rot(BorthRuntime *runtime);
void borth_op_roll(BorthRuntime *runtime);
void borth_op_roll_reverse(BorthRuntime *runtime);
void borth_op_add(BorthRuntime *runtime);
void borth_op_sub(BorthRuntime *runtime);
void borth_op_mul(BorthRuntime *runtime);
void borth_op_div(BorthRuntime *runtime);
void borth_op_mod(BorthRuntime *runtime);
void borth_op_eq(BorthRuntime *runtime);
void borth_op_lt(BorthRuntime *runtime);
void borth_op_gt(BorthRuntime *runtime);
void borth_op_str_len(BorthRuntime *runtime);
void borth_op_str_cat(BorthRuntime *runtime);
void borth_op_str_slice(BorthRuntime *runtime);
void borth_op_str_index_of(BorthRuntime *runtime);
void borth_op_show(BorthRuntime *runtime);
void borth_op_array_new(BorthRuntime *runtime);
void borth_op_array_push(BorthRuntime *runtime);
void borth_op_array_len(BorthRuntime *runtime);
void borth_op_array_get(BorthRuntime *runtime);
void borth_op_array_builder_new(BorthRuntime *runtime);
void borth_op_array_builder_push(BorthRuntime *runtime);
void borth_op_array_builder_len(BorthRuntime *runtime);
void borth_op_array_builder_get(BorthRuntime *runtime);
void borth_op_array_builder_set(BorthRuntime *runtime);
void borth_op_array_builder_freeze(BorthRuntime *runtime);
void borth_op_alloc_variable(BorthRuntime *runtime);
void borth_op_fetch(BorthRuntime *runtime);
void borth_op_store(BorthRuntime *runtime);
void borth_op_random(BorthRuntime *runtime);
void borth_op_clock_ms(BorthRuntime *runtime);
void borth_op_read_line(BorthRuntime *runtime);
void borth_op_read_int(BorthRuntime *runtime);
void borth_op_read_text_file(BorthRuntime *runtime);
void borth_op_write_text_file(BorthRuntime *runtime);
void borth_op_append_text_file(BorthRuntime *runtime);
void borth_op_file_exists(BorthRuntime *runtime);
void borth_op_env(BorthRuntime *runtime);
void borth_op_args(BorthRuntime *runtime);
void borth_op_run_command(BorthRuntime *runtime);
void borth_op_cwd(BorthRuntime *runtime);
void borth_op_path_dirname(BorthRuntime *runtime);
void borth_op_path_resolve(BorthRuntime *runtime);
int borth_op_pop_condition(BorthRuntime *runtime);
void borth_op_push_return(BorthRuntime *runtime, long return_address);
long borth_op_pop_return(BorthRuntime *runtime);
void borth_op_invalid_return(BorthRuntime *runtime);
void borth_op_panic(BorthRuntime *runtime);
void borth_op_exit(BorthRuntime *runtime);
void borth_op_print_stack(BorthRuntime *runtime);

void borth_op_print(BorthRuntime *runtime);

#endif
