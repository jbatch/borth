#include "borth_runtime.h"

#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>
#include <sys/select.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

typedef struct BorthString BorthString;
typedef struct BorthArray BorthArray;
typedef struct BorthArrayBuilder BorthArrayBuilder;
typedef struct BorthStringBuilder BorthStringBuilder;
typedef struct BorthMap BorthMap;
typedef struct BorthMapEntry BorthMapEntry;
typedef struct BorthRecord BorthRecord;

typedef enum {
  BORTH_VALUE_INT,
  BORTH_VALUE_STRING,
  BORTH_VALUE_ARRAY,
  BORTH_VALUE_ARRAY_BUILDER,
  BORTH_VALUE_STRING_BUILDER,
  BORTH_VALUE_MAP,
  BORTH_VALUE_RECORD,
} BorthValueKind;

typedef struct {
  BorthValueKind kind;
  union {
    long integer;
    BorthString *string;
    BorthArray *array;
    BorthArrayBuilder *array_builder;
    BorthStringBuilder *string_builder;
    BorthMap *map;
    BorthRecord *record;
  } as;
} BorthValue;

struct BorthString {
  char *chars;
  size_t len;
};

struct BorthArray {
  BorthValue *items;
  size_t len;
  size_t capacity;
};

struct BorthArrayBuilder {
  BorthValue *items;
  size_t len;
  size_t capacity;
  bool frozen;
};

struct BorthStringBuilder {
  char *items;
  size_t len;
  size_t capacity;
  bool frozen;
};

struct BorthMapEntry {
  BorthValue key;
  BorthValue value;
  BorthMapEntry *next;
};

struct BorthMap {
  BorthMapEntry **buckets;
  size_t bucket_count;
  size_t len;
};

struct BorthRecord {
  BorthString *shape;
  BorthValue *fields;
  size_t len;
};

typedef struct {
  BorthValue *items;
  size_t len;
  size_t capacity;
} BorthValueStack;

typedef struct {
  BorthValue *items;
  size_t len;
  size_t capacity;
} BorthValueMemory;

typedef struct {
  long *items;
  size_t len;
  size_t capacity;
} BorthReturnStack;

typedef enum {
  BORTH_HEAP_STRING,
  BORTH_HEAP_ARRAY,
  BORTH_HEAP_ARRAY_BUILDER,
  BORTH_HEAP_STRING_BUILDER,
  BORTH_HEAP_MAP,
  BORTH_HEAP_RECORD,
} BorthHeapObjectKind;

typedef struct {
  BorthHeapObjectKind kind;
  void *value;
} BorthHeapObject;

typedef struct {
  BorthHeapObject *items;
  size_t len;
  size_t capacity;
} BorthHeap;

typedef struct {
  bool enabled;
  size_t heap_strings;
  size_t heap_arrays;
  size_t heap_array_builders;
  size_t heap_string_builders;
  size_t heap_maps;
  size_t heap_records;
  size_t array_new;
  size_t array_push;
  size_t array_push_copied_items;
  size_t array_len;
  size_t array_get;
  size_t array_builder_new;
  size_t array_builder_push;
  size_t array_builder_len;
  size_t array_builder_get;
  size_t array_builder_set;
  size_t array_builder_freeze;
  size_t str_cat;
  size_t str_cat_copied_bytes;
  size_t str_builder_new;
  size_t str_builder_push;
  size_t str_builder_push_copied_bytes;
  size_t str_builder_len;
  size_t str_builder_freeze;
  size_t map_new;
  size_t map_get;
  size_t map_has;
  size_t map_set;
  size_t map_size;
  size_t record_new;
  size_t record_copy;
  size_t record_get;
  size_t record_set;
  size_t record_get_field;
  size_t record_set_field;
  size_t read_text_file;
  size_t read_text_file_bytes;
  size_t write_text_file;
  size_t write_text_file_bytes;
  size_t append_text_file;
  size_t append_text_file_bytes;
  size_t run_command;
} BorthProfile;

// TODO: Consider replacing this runtime-owned heap with reference counting once
// native values need more precise lifetimes than "free everything at shutdown".

struct BorthRuntime {
  BorthValueStack stack;
  BorthValueMemory memory;
  BorthReturnStack return_stack;
  BorthHeap heap;
  BorthProfile profile;
  int argc;
  char **argv;
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

static void *borth_malloc(size_t size, const char *message) {
  void *result = malloc(size);

  if (result == NULL) {
    borth_panic(message);
  }

  return result;
}

static void *borth_realloc(void *value, size_t size, const char *message) {
  void *result = realloc(value, size);

  if (result == NULL) {
    borth_panic(message);
  }

  return result;
}

static BorthValue borth_value_int(long value) {
  BorthValue result;
  result.kind = BORTH_VALUE_INT;
  result.as.integer = value;
  return result;
}

static BorthValue borth_value_bool(bool value) {
  BorthValue result;
  result.kind = BORTH_VALUE_INT;
  result.as.integer = value ? 1 : 0;
  return result;
}

static BorthValue borth_value_string(BorthString *value) {
  BorthValue result;
  result.kind = BORTH_VALUE_STRING;
  result.as.string = value;
  return result;
}

static BorthValue borth_value_array(BorthArray *value) {
  BorthValue result;
  result.kind = BORTH_VALUE_ARRAY;
  result.as.array = value;
  return result;
}

static BorthValue borth_value_array_builder(BorthArrayBuilder *value) {
  BorthValue result;
  result.kind = BORTH_VALUE_ARRAY_BUILDER;
  result.as.array_builder = value;
  return result;
}

static BorthValue borth_value_string_builder(BorthStringBuilder *value) {
  BorthValue result;
  result.kind = BORTH_VALUE_STRING_BUILDER;
  result.as.string_builder = value;
  return result;
}

static BorthValue borth_value_map(BorthMap *value) {
  BorthValue result;
  result.kind = BORTH_VALUE_MAP;
  result.as.map = value;
  return result;
}

static BorthValue borth_value_record(BorthRecord *value) {
  BorthValue result;
  result.kind = BORTH_VALUE_RECORD;
  result.as.record = value;
  return result;
}

static void borth_heap_grow(BorthRuntime *runtime) {
  size_t next_capacity = runtime->heap.capacity * 2;
  runtime->heap.items = borth_realloc(
      runtime->heap.items,
      next_capacity * sizeof(BorthHeapObject),
      "failed to grow runtime heap");
  runtime->heap.capacity = next_capacity;
}

static void borth_heap_register(
    BorthRuntime *runtime,
    BorthHeapObjectKind kind,
    void *value) {
  if (runtime->heap.len == runtime->heap.capacity) {
    borth_heap_grow(runtime);
  }

  runtime->heap.items[runtime->heap.len].kind = kind;
  runtime->heap.items[runtime->heap.len].value = value;
  runtime->heap.len += 1;
}

static void borth_profile_print(BorthRuntime *runtime) {
  if (!runtime->profile.enabled) {
    return;
  }

  fprintf(stderr, "[borth profile]\n");
  fprintf(stderr, "heap-strings: %zu\n", runtime->profile.heap_strings);
  fprintf(stderr, "heap-arrays: %zu\n", runtime->profile.heap_arrays);
  fprintf(
      stderr,
      "heap-array-builders: %zu\n",
      runtime->profile.heap_array_builders);
  fprintf(
      stderr,
      "heap-string-builders: %zu\n",
      runtime->profile.heap_string_builders);
  fprintf(stderr, "heap-maps: %zu\n", runtime->profile.heap_maps);
  fprintf(stderr, "heap-records: %zu\n", runtime->profile.heap_records);
  fprintf(stderr, "array-new: %zu\n", runtime->profile.array_new);
  fprintf(
      stderr,
      "array-push: %zu copied-items=%zu\n",
      runtime->profile.array_push,
      runtime->profile.array_push_copied_items);
  fprintf(stderr, "array-len: %zu\n", runtime->profile.array_len);
  fprintf(stderr, "array-get: %zu\n", runtime->profile.array_get);
  fprintf(
      stderr,
      "array-builder-new: %zu\n",
      runtime->profile.array_builder_new);
  fprintf(
      stderr,
      "array-builder-push: %zu\n",
      runtime->profile.array_builder_push);
  fprintf(
      stderr,
      "array-builder-len: %zu\n",
      runtime->profile.array_builder_len);
  fprintf(
      stderr,
      "array-builder-get: %zu\n",
      runtime->profile.array_builder_get);
  fprintf(
      stderr,
      "array-builder-set: %zu\n",
      runtime->profile.array_builder_set);
  fprintf(
      stderr,
      "array-builder-freeze: %zu\n",
      runtime->profile.array_builder_freeze);
  fprintf(
      stderr,
      "str-cat: %zu copied-bytes=%zu\n",
      runtime->profile.str_cat,
      runtime->profile.str_cat_copied_bytes);
  fprintf(
      stderr,
      "str-builder-new: %zu\n",
      runtime->profile.str_builder_new);
  fprintf(
      stderr,
      "str-builder-push: %zu copied-bytes=%zu\n",
      runtime->profile.str_builder_push,
      runtime->profile.str_builder_push_copied_bytes);
  fprintf(
      stderr,
      "str-builder-len: %zu\n",
      runtime->profile.str_builder_len);
  fprintf(
      stderr,
      "str-builder-freeze: %zu\n",
      runtime->profile.str_builder_freeze);
  fprintf(stderr, "map-new: %zu\n", runtime->profile.map_new);
  fprintf(stderr, "map-get: %zu\n", runtime->profile.map_get);
  fprintf(stderr, "map-has: %zu\n", runtime->profile.map_has);
  fprintf(stderr, "map-set: %zu\n", runtime->profile.map_set);
  fprintf(stderr, "map-size: %zu\n", runtime->profile.map_size);
  fprintf(stderr, "record-new: %zu\n", runtime->profile.record_new);
  fprintf(stderr, "record-copy: %zu\n", runtime->profile.record_copy);
  fprintf(stderr, "record-get: %zu\n", runtime->profile.record_get);
  fprintf(stderr, "record-set: %zu\n", runtime->profile.record_set);
  fprintf(stderr, "record-get-field: %zu\n", runtime->profile.record_get_field);
  fprintf(stderr, "record-set-field: %zu\n", runtime->profile.record_set_field);
  fprintf(
      stderr,
      "read-text-file: %zu bytes=%zu\n",
      runtime->profile.read_text_file,
      runtime->profile.read_text_file_bytes);
  fprintf(
      stderr,
      "write-text-file: %zu bytes=%zu\n",
      runtime->profile.write_text_file,
      runtime->profile.write_text_file_bytes);
  fprintf(
      stderr,
      "append-text-file: %zu bytes=%zu\n",
      runtime->profile.append_text_file,
      runtime->profile.append_text_file_bytes);
  fprintf(stderr, "run-command: %zu\n", runtime->profile.run_command);
}

static char *borth_copy_chars(const char *chars, size_t len) {
  char *result = borth_malloc(len + 1, "failed to allocate string contents");
  memcpy(result, chars, len);
  result[len] = '\0';
  return result;
}

static BorthString *borth_string_new(
    BorthRuntime *runtime,
    const char *chars,
    size_t len) {
  BorthString *result =
      borth_malloc(sizeof(BorthString), "failed to allocate string");
  result->chars = borth_copy_chars(chars, len);
  result->len = len;

  borth_heap_register(runtime, BORTH_HEAP_STRING, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_strings += 1;
  }
  return result;
}

static BorthString *borth_string_take_chars(
    BorthRuntime *runtime,
    char *chars,
    size_t len) {
  BorthString *result =
      borth_malloc(sizeof(BorthString), "failed to allocate string");
  result->chars = chars;
  result->len = len;

  borth_heap_register(runtime, BORTH_HEAP_STRING, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_strings += 1;
  }
  return result;
}

static BorthArray *borth_array_new(BorthRuntime *runtime, size_t capacity) {
  BorthArray *result =
      borth_malloc(sizeof(BorthArray), "failed to allocate array");
  result->len = 0;
  result->capacity = capacity < 4 ? 4 : capacity;
  result->items = borth_malloc(
      result->capacity * sizeof(BorthValue),
      "failed to allocate array items");

  borth_heap_register(runtime, BORTH_HEAP_ARRAY, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_arrays += 1;
  }
  return result;
}

static BorthArrayBuilder *borth_array_builder_new(BorthRuntime *runtime) {
  BorthArrayBuilder *result =
      borth_malloc(sizeof(BorthArrayBuilder), "failed to allocate array builder");
  result->len = 0;
  result->capacity = 4;
  result->items = borth_malloc(
      result->capacity * sizeof(BorthValue),
      "failed to allocate array builder items");
  result->frozen = false;

  borth_heap_register(runtime, BORTH_HEAP_ARRAY_BUILDER, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_array_builders += 1;
  }
  return result;
}

static BorthStringBuilder *borth_string_builder_new(BorthRuntime *runtime) {
  BorthStringBuilder *result = borth_malloc(
      sizeof(BorthStringBuilder),
      "failed to allocate string builder");
  result->len = 0;
  result->capacity = 64;
  result->items =
      borth_malloc(result->capacity, "failed to allocate string builder items");
  result->items[0] = '\0';
  result->frozen = false;

  borth_heap_register(runtime, BORTH_HEAP_STRING_BUILDER, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_string_builders += 1;
  }
  return result;
}

static size_t borth_hash_bytes(const char *chars, size_t len) {
  size_t hash = 1469598103934665603UL;

  for (size_t i = 0; i < len; i += 1) {
    hash ^= (unsigned char)chars[i];
    hash *= 1099511628211UL;
  }

  return hash;
}

static size_t borth_map_key_hash(BorthValue key, const char *op) {
  switch (key.kind) {
    case BORTH_VALUE_INT:
      return ((size_t)key.as.integer * 2654435761UL) ^ 0x01UL;
    case BORTH_VALUE_STRING:
      return borth_hash_bytes(key.as.string->chars, key.as.string->len) ^ 0x02UL;
    default:
      borth_panic(op);
  }

  return 0;
}

static bool borth_map_keys_equal(BorthValue left, BorthValue right) {
  if (left.kind != right.kind) {
    return false;
  }

  switch (left.kind) {
    case BORTH_VALUE_INT:
      return left.as.integer == right.as.integer;
    case BORTH_VALUE_STRING:
      return left.as.string->len == right.as.string->len &&
          memcmp(left.as.string->chars, right.as.string->chars, left.as.string->len) == 0;
    default:
      return false;
  }
}

static BorthMap *borth_map_new(BorthRuntime *runtime) {
  BorthMap *result = borth_malloc(sizeof(BorthMap), "failed to allocate map");
  result->bucket_count = 16;
  result->len = 0;
  result->buckets = borth_malloc(
      result->bucket_count * sizeof(BorthMapEntry *),
      "failed to allocate map buckets");
  memset(result->buckets, 0, result->bucket_count * sizeof(BorthMapEntry *));

  borth_heap_register(runtime, BORTH_HEAP_MAP, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_maps += 1;
  }
  return result;
}

static BorthRecord *borth_record_new(
    BorthRuntime *runtime,
    BorthString *shape,
    BorthValue *fields,
    size_t len) {
  BorthRecord *result =
      borth_malloc(sizeof(BorthRecord), "failed to allocate record");
  result->shape = shape;
  result->len = len;

  if (len == 0) {
    result->fields = NULL;
  } else {
    result->fields = borth_malloc(
        len * sizeof(BorthValue),
        "failed to allocate record fields");
    memcpy(result->fields, fields, len * sizeof(BorthValue));
  }

  borth_heap_register(runtime, BORTH_HEAP_RECORD, result);
  if (runtime->profile.enabled) {
    runtime->profile.heap_records += 1;
  }
  return result;
}

static BorthMapEntry *borth_map_find_entry(
    BorthMap *map,
    BorthValue key,
    size_t hash) {
  size_t bucket_index = hash % map->bucket_count;

  for (BorthMapEntry *entry = map->buckets[bucket_index];
       entry != NULL;
       entry = entry->next) {
    if (borth_map_keys_equal(entry->key, key)) {
      return entry;
    }
  }

  return NULL;
}

static void borth_map_grow(BorthMap *map) {
  size_t next_bucket_count = map->bucket_count * 2;
  BorthMapEntry **next_buckets = borth_malloc(
      next_bucket_count * sizeof(BorthMapEntry *),
      "failed to grow map buckets");
  memset(next_buckets, 0, next_bucket_count * sizeof(BorthMapEntry *));

  for (size_t i = 0; i < map->bucket_count; i += 1) {
    BorthMapEntry *entry = map->buckets[i];

    while (entry != NULL) {
      BorthMapEntry *next = entry->next;
      size_t bucket_index =
          borth_map_key_hash(entry->key, "MAP_SET requires map keys to be integers or strings") %
          next_bucket_count;
      entry->next = next_buckets[bucket_index];
      next_buckets[bucket_index] = entry;
      entry = next;
    }
  }

  free(map->buckets);
  map->buckets = next_buckets;
  map->bucket_count = next_bucket_count;
}

static void borth_map_set(BorthMap *map, BorthValue key, BorthValue value) {
  size_t hash =
      borth_map_key_hash(key, "MAP_SET requires map keys to be integers or strings");
  BorthMapEntry *entry = borth_map_find_entry(map, key, hash);

  if (entry != NULL) {
    entry->value = value;
    return;
  }

  if ((map->len + 1) * 4 > map->bucket_count * 3) {
    borth_map_grow(map);
    hash = borth_map_key_hash(
        key,
        "MAP_SET requires map keys to be integers or strings");
  }

  size_t bucket_index = hash % map->bucket_count;
  entry = borth_malloc(sizeof(BorthMapEntry), "failed to allocate map entry");
  entry->key = key;
  entry->value = value;
  entry->next = map->buckets[bucket_index];
  map->buckets[bucket_index] = entry;
  map->len += 1;
}

static BorthMapEntry *borth_map_get(
    BorthMap *map,
    BorthValue key,
    const char *op) {
  size_t hash = borth_map_key_hash(key, op);
  return borth_map_find_entry(map, key, hash);
}

static void borth_array_append(BorthArray *array, BorthValue value) {
  if (array->len == array->capacity) {
    array->capacity *= 2;
    array->items = borth_realloc(
        array->items,
        array->capacity * sizeof(BorthValue),
        "failed to grow array");
  }

  array->items[array->len] = value;
  array->len += 1;
}

static void borth_array_builder_append(
    BorthArrayBuilder *builder,
    BorthValue value) {
  if (builder->frozen) {
    borth_panic("ARRAY_BUILDER_PUSH cannot push to a frozen builder");
  }

  if (builder->len == builder->capacity) {
    builder->capacity *= 2;
    builder->items = borth_realloc(
        builder->items,
        builder->capacity * sizeof(BorthValue),
        "failed to grow array builder");
  }

  builder->items[builder->len] = value;
  builder->len += 1;
}

static BorthArray *borth_array_builder_freeze(
    BorthRuntime *runtime,
    BorthArrayBuilder *builder) {
  if (builder->frozen) {
    borth_panic("ARRAY_BUILDER_FREEZE cannot freeze a frozen builder");
  }

  BorthArray *array =
      borth_malloc(sizeof(BorthArray), "failed to allocate frozen array");
  array->items = builder->items;
  array->len = builder->len;
  array->capacity = builder->capacity;

  builder->items = NULL;
  builder->len = 0;
  builder->capacity = 0;
  builder->frozen = true;

  borth_heap_register(runtime, BORTH_HEAP_ARRAY, array);
  if (runtime->profile.enabled) {
    runtime->profile.heap_arrays += 1;
  }
  return array;
}

BorthRuntime *borth_runtime_new_with_args(int argc, char **argv) {
  BorthRuntime *runtime = malloc(sizeof(BorthRuntime));

  if (runtime == NULL) {
    borth_panic("failed to allocate runtime");
  }

  runtime->stack.len = 0;
  runtime->stack.capacity = 64;
  runtime->stack.items = malloc(runtime->stack.capacity * sizeof(BorthValue));
  runtime->memory.len = 0;
  runtime->memory.capacity = 64;
  runtime->memory.items = malloc(runtime->memory.capacity * sizeof(BorthValue));
  runtime->return_stack.len = 0;
  runtime->return_stack.capacity = 64;
  runtime->return_stack.items =
      malloc(runtime->return_stack.capacity * sizeof(long));
  runtime->heap.len = 0;
  runtime->heap.capacity = 64;
  runtime->heap.items = malloc(runtime->heap.capacity * sizeof(BorthHeapObject));
  runtime->profile = (BorthProfile){0};
  runtime->profile.enabled = getenv("BORTH_PROFILE") != NULL;
  runtime->argc = argc;
  runtime->argv = argv;

  if (runtime->stack.items == NULL) {
    free(runtime);
    borth_panic("failed to allocate value stack");
  }

  if (runtime->heap.items == NULL) {
    free(runtime->return_stack.items);
    free(runtime->memory.items);
    free(runtime->stack.items);
    free(runtime);
    borth_panic("failed to allocate runtime heap");
  }

  if (runtime->memory.items == NULL) {
    free(runtime->return_stack.items);
    free(runtime->heap.items);
    free(runtime->stack.items);
    free(runtime);
    borth_panic("failed to allocate runtime memory");
  }

  if (runtime->return_stack.items == NULL) {
    free(runtime->heap.items);
    free(runtime->memory.items);
    free(runtime->stack.items);
    free(runtime);
    borth_panic("failed to allocate return stack");
  }

  return runtime;
}

BorthRuntime *borth_runtime_new(void) {
  return borth_runtime_new_with_args(0, NULL);
}

void borth_runtime_free(BorthRuntime *runtime) {
  if (runtime == NULL) {
    return;
  }

  borth_profile_print(runtime);

  for (size_t i = 0; i < runtime->heap.len; i += 1) {
    BorthHeapObject object = runtime->heap.items[i];

    switch (object.kind) {
      case BORTH_HEAP_STRING: {
        BorthString *string = object.value;
        free(string->chars);
        free(string);
        break;
      }
      case BORTH_HEAP_ARRAY: {
        BorthArray *array = object.value;
        free(array->items);
        free(array);
        break;
      }
      case BORTH_HEAP_ARRAY_BUILDER: {
        BorthArrayBuilder *builder = object.value;
        free(builder->items);
        free(builder);
        break;
      }
      case BORTH_HEAP_STRING_BUILDER: {
        BorthStringBuilder *builder = object.value;
        free(builder->items);
        free(builder);
        break;
      }
      case BORTH_HEAP_MAP: {
        BorthMap *map = object.value;

        for (size_t bucket_index = 0;
             bucket_index < map->bucket_count;
             bucket_index += 1) {
          BorthMapEntry *entry = map->buckets[bucket_index];

          while (entry != NULL) {
            BorthMapEntry *next = entry->next;
            free(entry);
            entry = next;
          }
        }

        free(map->buckets);
        free(map);
        break;
      }
      case BORTH_HEAP_RECORD: {
        BorthRecord *record = object.value;
        free(record->fields);
        free(record);
        break;
      }
    }
  }

  free(runtime->heap.items);
  free(runtime->return_stack.items);
  free(runtime->memory.items);
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

static void borth_memory_grow(BorthRuntime *runtime) {
  size_t next_capacity = runtime->memory.capacity * 2;
  runtime->memory.items = borth_realloc(
      runtime->memory.items,
      next_capacity * sizeof(BorthValue),
      "failed to grow runtime memory");
  runtime->memory.capacity = next_capacity;
}

static void borth_return_stack_grow(BorthRuntime *runtime) {
  size_t next_capacity = runtime->return_stack.capacity * 2;
  runtime->return_stack.items = borth_realloc(
      runtime->return_stack.items,
      next_capacity * sizeof(long),
      "failed to grow return stack");
  runtime->return_stack.capacity = next_capacity;
}

static BorthValue borth_stack_pop(BorthRuntime *runtime, const char *op) {
  if (runtime->stack.len == 0) {
    borth_panic(op);
  }

  runtime->stack.len -= 1;
  return runtime->stack.items[runtime->stack.len];
}

static void borth_require_stack_depth(
    BorthRuntime *runtime,
    size_t depth,
    const char *op) {
  if (runtime->stack.len < depth) {
    borth_panic(op);
  }
}

static BorthValue borth_stack_peek(BorthRuntime *runtime, const char *op) {
  borth_require_stack_depth(runtime, 1, op);
  return runtime->stack.items[runtime->stack.len - 1];
}

static long borth_pop_int(BorthRuntime *runtime, const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_INT) {
    borth_panic(op);
  }

  return value.as.integer;
}

static BorthString *borth_pop_string(BorthRuntime *runtime, const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_STRING) {
    borth_panic(op);
  }

  return value.as.string;
}

static BorthArray *borth_pop_array(BorthRuntime *runtime, const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_ARRAY) {
    borth_panic(op);
  }

  return value.as.array;
}

static BorthArrayBuilder *borth_pop_array_builder(
    BorthRuntime *runtime,
    const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_ARRAY_BUILDER) {
    borth_panic(op);
  }

  return value.as.array_builder;
}

static BorthStringBuilder *borth_pop_string_builder(
    BorthRuntime *runtime,
    const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_STRING_BUILDER) {
    borth_panic(op);
  }

  return value.as.string_builder;
}

static BorthMap *borth_pop_map(BorthRuntime *runtime, const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_MAP) {
    borth_panic(op);
  }

  return value.as.map;
}

static bool borth_strings_equal(BorthString *left, BorthString *right) {
  return left->len == right->len &&
      memcmp(left->chars, right->chars, left->len) == 0;
}

static BorthRecord *borth_pop_record(
    BorthRuntime *runtime,
    BorthString *expected_shape,
    const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_RECORD) {
    borth_panic(op);
  }

  if (!borth_strings_equal(value.as.record->shape, expected_shape)) {
    borth_panic(op);
  }

  return value.as.record;
}

static BorthRecord *borth_pop_record_cstr(
    BorthRuntime *runtime,
    const char *expected_shape,
    const char *op) {
  BorthValue value = borth_stack_pop(runtime, op);

  if (value.kind != BORTH_VALUE_RECORD) {
    borth_panic(op);
  }

  BorthString *actual_shape = value.as.record->shape;
  size_t expected_len = strlen(expected_shape);

  if (actual_shape->len != expected_len ||
      memcmp(actual_shape->chars, expected_shape, expected_len) != 0) {
    borth_panic(op);
  }

  return value.as.record;
}

static size_t borth_pop_index(
    BorthRuntime *runtime,
    const char *op,
    const char *name) {
  long value = borth_pop_int(runtime, op);

  if (value < 0) {
    borth_panic(name);
  }

  return (size_t)value;
}

static void borth_builder_init(BorthStringBuilder *builder) {
  builder->len = 0;
  builder->capacity = 64;
  builder->items =
      borth_malloc(builder->capacity, "failed to allocate string builder");
  builder->items[0] = '\0';
  builder->frozen = false;
}

static void borth_builder_grow(BorthStringBuilder *builder, size_t needed) {
  while (builder->capacity < needed) {
    builder->capacity *= 2;
  }

  builder->items = borth_realloc(
      builder->items,
      builder->capacity,
      "failed to grow string builder");
}

static void borth_builder_append_chars(
    BorthStringBuilder *builder,
    const char *chars,
    size_t len) {
  if (builder->frozen) {
    borth_panic("STR_BUILDER_PUSH cannot push to a frozen builder");
  }

  size_t needed = builder->len + len + 1;

  if (needed > builder->capacity) {
    borth_builder_grow(builder, needed);
  }

  memcpy(builder->items + builder->len, chars, len);
  builder->len += len;
  builder->items[builder->len] = '\0';
}

static void borth_builder_append_cstr(
    BorthStringBuilder *builder,
    const char *chars) {
  borth_builder_append_chars(builder, chars, strlen(chars));
}

static void borth_builder_append_char(BorthStringBuilder *builder, char value) {
  borth_builder_append_chars(builder, &value, 1);
}

static void borth_builder_append_int(BorthStringBuilder *builder, long value) {
  char buffer[32];
  int len = snprintf(buffer, sizeof(buffer), "%ld", value);

  if (len < 0 || (size_t)len >= sizeof(buffer)) {
    borth_panic("failed to format integer");
  }

  borth_builder_append_chars(builder, buffer, (size_t)len);
}

static void borth_builder_append_debug_string(
    BorthStringBuilder *builder,
    BorthString *string) {
  borth_builder_append_char(builder, '"');

  for (size_t i = 0; i < string->len; i += 1) {
    char value = string->chars[i];

    switch (value) {
      case '"':
        borth_builder_append_cstr(builder, "\\\"");
        break;
      case '\\':
        borth_builder_append_cstr(builder, "\\\\");
        break;
      case '\n':
        borth_builder_append_cstr(builder, "\\n");
        break;
      default:
        borth_builder_append_char(builder, value);
        break;
    }
  }

  borth_builder_append_char(builder, '"');
}

static void borth_builder_append_value(
    BorthStringBuilder *builder,
    BorthValue value);

static void borth_builder_append_array(
    BorthStringBuilder *builder,
    BorthArray *array) {
  borth_builder_append_char(builder, '[');

  for (size_t i = 0; i < array->len; i += 1) {
    if (i > 0) {
      borth_builder_append_char(builder, ' ');
    }

    borth_builder_append_value(builder, array->items[i]);
  }

  borth_builder_append_char(builder, ']');
}

static void borth_builder_append_value(
    BorthStringBuilder *builder,
    BorthValue value) {
  switch (value.kind) {
    case BORTH_VALUE_INT:
      borth_builder_append_int(builder, value.as.integer);
      break;
    case BORTH_VALUE_STRING:
      borth_builder_append_debug_string(builder, value.as.string);
      break;
    case BORTH_VALUE_ARRAY:
      borth_builder_append_array(builder, value.as.array);
      break;
    case BORTH_VALUE_ARRAY_BUILDER:
      if (value.as.array_builder->frozen) {
        borth_builder_append_cstr(builder, "<array-builder:frozen>");
      } else {
        borth_builder_append_cstr(builder, "<array-builder:");
        borth_builder_append_int(builder, (long)value.as.array_builder->len);
        borth_builder_append_char(builder, '>');
      }
      break;
    case BORTH_VALUE_STRING_BUILDER:
      if (value.as.string_builder->frozen) {
        borth_builder_append_cstr(builder, "<string-builder:frozen>");
      } else {
        borth_builder_append_cstr(builder, "<string-builder:");
        borth_builder_append_int(builder, (long)value.as.string_builder->len);
        borth_builder_append_char(builder, '>');
      }
      break;
    case BORTH_VALUE_MAP:
      borth_builder_append_cstr(builder, "<map:");
      borth_builder_append_int(builder, (long)value.as.map->len);
      borth_builder_append_char(builder, '>');
      break;
    case BORTH_VALUE_RECORD:
      borth_builder_append_cstr(builder, "<record:");
      borth_builder_append_chars(
          builder,
          value.as.record->shape->chars,
          value.as.record->shape->len);
      borth_builder_append_char(builder, '>');
      break;
  }
}

static BorthString *borth_string_from_builder(
    BorthRuntime *runtime,
    BorthStringBuilder *builder) {
  return borth_string_new(runtime, builder->items, builder->len);
}

static BorthString *borth_read_line_string(BorthRuntime *runtime) {
  BorthStringBuilder builder;
  borth_builder_init(&builder);

  while (true) {
    int value = getchar();

    if (value == EOF) {
      if (builder.len == 0) {
        free(builder.items);
        borth_panic("READ_LINE reached end of input");
      }

      break;
    }

    if (value == '\n') {
      break;
    }

    borth_builder_append_char(&builder, (char)value);
  }

  if (builder.len > 0 && builder.items[builder.len - 1] == '\r') {
    builder.len -= 1;
    builder.items[builder.len] = '\0';
  }

  BorthString *result = borth_string_from_builder(runtime, &builder);
  free(builder.items);
  return result;
}

static long borth_parse_int_input(BorthString *input) {
  const char *start = input->chars;
  const char *end = input->chars + input->len;

  while (start < end && isspace((unsigned char)*start)) {
    start += 1;
  }

  while (end > start && isspace((unsigned char)*(end - 1))) {
    end -= 1;
  }

  if (start == end) {
    borth_panic("READ_INT expected an integer");
  }

  if (*start == '-') {
    start += 1;
  }

  if (start == end) {
    borth_panic("READ_INT expected an integer");
  }

  for (const char *cursor = start; cursor < end; cursor += 1) {
    if (!isdigit((unsigned char)*cursor)) {
      borth_panic("READ_INT expected an integer");
    }
  }

  errno = 0;
  char *parse_end = NULL;
  long value = strtol(input->chars, &parse_end, 10);

  if (errno == ERANGE || parse_end == input->chars) {
    borth_panic("READ_INT expected an integer");
  }

  return value;
}

static BorthString *borth_read_file(BorthRuntime *runtime, BorthString *path) {
  FILE *file = fopen(path->chars, "rb");

  if (file == NULL) {
    borth_panic(strerror(errno));
  }

  BorthStringBuilder builder;
  borth_builder_init(&builder);
  char buffer[4096];

  while (true) {
    size_t bytes_read = fread(buffer, 1, sizeof(buffer), file);

    if (bytes_read > 0) {
      borth_builder_append_chars(&builder, buffer, bytes_read);
    }

    if (bytes_read < sizeof(buffer)) {
      if (ferror(file)) {
        fclose(file);
        free(builder.items);
        borth_panic("READ_TEXT_FILE failed while reading file");
      }

      break;
    }
  }

  if (fclose(file) != 0) {
    free(builder.items);
    borth_panic("READ_TEXT_FILE failed while closing file");
  }

  BorthString *result = borth_string_from_builder(runtime, &builder);
  if (runtime->profile.enabled) {
    runtime->profile.read_text_file += 1;
    runtime->profile.read_text_file_bytes += result->len;
  }
  free(builder.items);
  return result;
}

static void borth_write_file(
    BorthRuntime *runtime,
    BorthString *path,
    BorthString *contents,
    const char *mode,
    const char *op) {
  FILE *file = fopen(path->chars, mode);

  if (file == NULL) {
    borth_panic(strerror(errno));
  }

  if (contents->len > 0 &&
      fwrite(contents->chars, 1, contents->len, file) != contents->len) {
    fclose(file);
    borth_panic(op);
  }

  if (fclose(file) != 0) {
    borth_panic(op);
  }

  if (runtime->profile.enabled) {
    if (strcmp(mode, "ab") == 0) {
      runtime->profile.append_text_file += 1;
      runtime->profile.append_text_file_bytes += contents->len;
    } else {
      runtime->profile.write_text_file += 1;
      runtime->profile.write_text_file_bytes += contents->len;
    }
  }
}

static BorthString *borth_getcwd_string(BorthRuntime *runtime) {
  size_t capacity = 256;
  char *buffer = borth_malloc(capacity, "failed to allocate cwd buffer");

  while (getcwd(buffer, capacity) == NULL) {
    if (errno != ERANGE) {
      free(buffer);
      borth_panic(strerror(errno));
    }

    capacity *= 2;
    buffer = borth_realloc(buffer, capacity, "failed to grow cwd buffer");
  }

  BorthString *result = borth_string_new(runtime, buffer, strlen(buffer));
  free(buffer);
  return result;
}

static bool borth_path_is_absolute(const char *path) {
  return path[0] == '/';
}

static BorthString *borth_path_dirname(
    BorthRuntime *runtime,
    BorthString *path) {
  size_t len = path->len;

  while (len > 1 && path->chars[len - 1] == '/') {
    len -= 1;
  }

  if (len == 0) {
    return borth_string_new(runtime, ".", 1);
  }

  for (size_t i = len; i > 0; i -= 1) {
    if (path->chars[i - 1] == '/') {
      if (i == 1) {
        return borth_string_new(runtime, "/", 1);
      }

      return borth_string_new(runtime, path->chars, i - 1);
    }
  }

  return borth_string_new(runtime, ".", 1);
}

static BorthString *borth_normalize_absolute_path(
    BorthRuntime *runtime,
    const char *path) {
  char *copy = borth_copy_chars(path, strlen(path));
  size_t max_segments = strlen(path) + 1;
  char **segments =
      borth_malloc(max_segments * sizeof(char *), "failed to allocate path");
  size_t segment_count = 0;
  char *saveptr = NULL;

  for (char *part = strtok_r(copy, "/", &saveptr);
       part != NULL;
       part = strtok_r(NULL, "/", &saveptr)) {
    if (strcmp(part, ".") == 0 || strcmp(part, "") == 0) {
      continue;
    }

    if (strcmp(part, "..") == 0) {
      if (segment_count > 0) {
        segment_count -= 1;
      }

      continue;
    }

    segments[segment_count] = part;
    segment_count += 1;
  }

  BorthStringBuilder builder;
  borth_builder_init(&builder);
  borth_builder_append_char(&builder, '/');

  for (size_t i = 0; i < segment_count; i += 1) {
    if (i > 0) {
      borth_builder_append_char(&builder, '/');
    }

    borth_builder_append_cstr(&builder, segments[i]);
  }

  BorthString *result = borth_string_from_builder(runtime, &builder);
  free(builder.items);
  free(segments);
  free(copy);
  return result;
}

static BorthString *borth_path_resolve(
    BorthRuntime *runtime,
    BorthString *base,
    BorthString *path) {
  BorthStringBuilder builder;
  borth_builder_init(&builder);

  if (borth_path_is_absolute(path->chars)) {
    borth_builder_append_chars(&builder, path->chars, path->len);
  } else if (borth_path_is_absolute(base->chars)) {
    borth_builder_append_chars(&builder, base->chars, base->len);
    borth_builder_append_char(&builder, '/');
    borth_builder_append_chars(&builder, path->chars, path->len);
  } else {
    BorthString *cwd = borth_getcwd_string(runtime);
    borth_builder_append_chars(&builder, cwd->chars, cwd->len);
    borth_builder_append_char(&builder, '/');
    borth_builder_append_chars(&builder, base->chars, base->len);
    borth_builder_append_char(&builder, '/');
    borth_builder_append_chars(&builder, path->chars, path->len);
  }

  BorthString *result = borth_normalize_absolute_path(runtime, builder.items);
  free(builder.items);
  return result;
}

static void borth_read_process_outputs(
    int stdout_fd,
    int stderr_fd,
    BorthStringBuilder *stdout_builder,
    BorthStringBuilder *stderr_builder) {
  bool stdout_open = true;
  bool stderr_open = true;

  while (stdout_open || stderr_open) {
    fd_set read_fds;
    FD_ZERO(&read_fds);
    int max_fd = -1;

    if (stdout_open) {
      FD_SET(stdout_fd, &read_fds);
      max_fd = stdout_fd;
    }

    if (stderr_open) {
      FD_SET(stderr_fd, &read_fds);
      if (stderr_fd > max_fd) {
        max_fd = stderr_fd;
      }
    }

    int ready = select(max_fd + 1, &read_fds, NULL, NULL, NULL);

    if (ready < 0) {
      if (errno == EINTR) {
        continue;
      }

      borth_panic("RUN_COMMAND failed while waiting for command output");
    }

    if (stdout_open && FD_ISSET(stdout_fd, &read_fds)) {
      char buffer[4096];
      ssize_t bytes_read = read(stdout_fd, buffer, sizeof(buffer));

      if (bytes_read > 0) {
        borth_builder_append_chars(
            stdout_builder,
            buffer,
            (size_t)bytes_read);
      } else if (bytes_read == 0) {
        close(stdout_fd);
        stdout_open = false;
      } else if (errno != EINTR) {
        borth_panic("RUN_COMMAND failed while reading stdout");
      }
    }

    if (stderr_open && FD_ISSET(stderr_fd, &read_fds)) {
      char buffer[4096];
      ssize_t bytes_read = read(stderr_fd, buffer, sizeof(buffer));

      if (bytes_read > 0) {
        borth_builder_append_chars(
            stderr_builder,
            buffer,
            (size_t)bytes_read);
      } else if (bytes_read == 0) {
        close(stderr_fd);
        stderr_open = false;
      } else if (errno != EINTR) {
        borth_panic("RUN_COMMAND failed while reading stderr");
      }
    }
  }
}

static long borth_wait_exit_code(pid_t child_pid) {
  int status = 0;

  while (waitpid(child_pid, &status, 0) < 0) {
    if (errno == EINTR) {
      continue;
    }

    borth_panic("RUN_COMMAND failed while waiting for command");
  }

  if (WIFEXITED(status)) {
    return WEXITSTATUS(status);
  }

  if (WIFSIGNALED(status)) {
    return 128 + WTERMSIG(status);
  }

  return 1;
}

// Borth Ops

void borth_op_push_int(BorthRuntime *runtime, long value) {
  borth_stack_push(runtime, borth_value_int(value));
}

void borth_op_push_string(BorthRuntime *runtime, const char *value) {
  borth_stack_push(
      runtime,
      borth_value_string(borth_string_new(runtime, value, strlen(value))));
}

void borth_op_drop(BorthRuntime *runtime) {
  borth_stack_pop(runtime, "DROP requires a value on the stack");
}

void borth_op_dup(BorthRuntime *runtime) {
  borth_stack_push(
      runtime,
      borth_stack_peek(runtime, "DUP requires a value on the stack"));
}

void borth_op_swap(BorthRuntime *runtime) {
  borth_require_stack_depth(runtime, 2, "SWAP requires 2 values on the stack");

  BorthValue right = borth_stack_pop(runtime, "SWAP requires 2 values on the stack");
  BorthValue left = borth_stack_pop(runtime, "SWAP requires 2 values on the stack");

  borth_stack_push(runtime, right);
  borth_stack_push(runtime, left);
}

void borth_op_over(BorthRuntime *runtime) {
  borth_require_stack_depth(runtime, 2, "OVER requires 2 values on the stack");
  borth_stack_push(runtime, runtime->stack.items[runtime->stack.len - 2]);
}

void borth_op_rot(BorthRuntime *runtime) {
  borth_require_stack_depth(runtime, 3, "ROT requires 3 values on the stack");

  BorthValue c = borth_stack_pop(runtime, "ROT requires 3 values on the stack");
  BorthValue b = borth_stack_pop(runtime, "ROT requires 3 values on the stack");
  BorthValue a = borth_stack_pop(runtime, "ROT requires 3 values on the stack");

  borth_stack_push(runtime, b);
  borth_stack_push(runtime, c);
  borth_stack_push(runtime, a);
}

void borth_op_roll(BorthRuntime *runtime) {
  long depth_value = borth_pop_int(runtime, "ROLL requires integers on the stack");

  if (depth_value < 0) {
    borth_panic("ROLL requires depth to be a non-negative integer");
  }

  size_t depth = (size_t)depth_value;
  borth_require_stack_depth(runtime, depth + 1, "ROLL requires enough stack values");

  size_t index = runtime->stack.len - 1 - depth;
  BorthValue value = runtime->stack.items[index];

  memmove(
      runtime->stack.items + index,
      runtime->stack.items + index + 1,
      (runtime->stack.len - index - 1) * sizeof(BorthValue));
  runtime->stack.items[runtime->stack.len - 1] = value;
}

void borth_op_roll_reverse(BorthRuntime *runtime) {
  long depth_value =
      borth_pop_int(runtime, "ROLL_REVERSE requires integers on the stack");

  if (depth_value < 0) {
    borth_panic("ROLL_REVERSE requires depth to be a non-negative integer");
  }

  size_t depth = (size_t)depth_value;
  borth_require_stack_depth(
      runtime,
      depth + 1,
      "ROLL_REVERSE requires enough stack values");

  BorthValue value =
      borth_stack_pop(runtime, "ROLL_REVERSE requires a value on the stack");
  size_t index = runtime->stack.len - depth;

  memmove(
      runtime->stack.items + index + 1,
      runtime->stack.items + index,
      (runtime->stack.len - index) * sizeof(BorthValue));
  runtime->stack.items[index] = value;
  runtime->stack.len += 1;
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
  BorthValue right = borth_stack_pop(runtime, "EQ requires values on the stack");
  BorthValue left = borth_stack_pop(runtime, "EQ requires values on the stack");

  if (left.kind == BORTH_VALUE_INT && right.kind == BORTH_VALUE_INT) {
    borth_stack_push(
        runtime,
        borth_value_bool(left.as.integer == right.as.integer));
    return;
  }

  if (left.kind == BORTH_VALUE_STRING && right.kind == BORTH_VALUE_STRING) {
    borth_stack_push(
        runtime,
        borth_value_bool(
            left.as.string->len == right.as.string->len &&
            memcmp(
                left.as.string->chars,
                right.as.string->chars,
                left.as.string->len) == 0));
    return;
  }

  borth_panic("EQ requires matching integers or strings on the stack");
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

void borth_op_str_len(BorthRuntime *runtime) {
  BorthString *value =
      borth_pop_string(runtime, "STR_LEN requires strings on the stack");
  borth_stack_push(runtime, borth_value_int((long)value->len));
}

void borth_op_str_cat(BorthRuntime *runtime) {
  BorthString *right =
      borth_pop_string(runtime, "STR_CAT requires strings on the stack");
  BorthString *left =
      borth_pop_string(runtime, "STR_CAT requires strings on the stack");
  size_t len = left->len + right->len;
  char *chars = borth_malloc(len + 1, "failed to allocate concatenated string");

  memcpy(chars, left->chars, left->len);
  memcpy(chars + left->len, right->chars, right->len);
  chars[len] = '\0';
  if (runtime->profile.enabled) {
    runtime->profile.str_cat += 1;
    runtime->profile.str_cat_copied_bytes += len;
  }

  borth_stack_push(
      runtime,
      borth_value_string(borth_string_take_chars(runtime, chars, len)));
}

void borth_op_str_slice(BorthRuntime *runtime) {
  size_t length = borth_pop_index(
      runtime,
      "STR_SLICE requires integers on the stack",
      "STR_SLICE requires length to be a non-negative integer");
  size_t start = borth_pop_index(
      runtime,
      "STR_SLICE requires integers on the stack",
      "STR_SLICE requires start to be a non-negative integer");
  BorthString *value =
      borth_pop_string(runtime, "STR_SLICE requires strings on the stack");

  if (start > value->len) {
    borth_panic("STR_SLICE start is past end of string");
  }

  if (length > value->len - start) {
    borth_panic("STR_SLICE range is past end of string");
  }

  borth_stack_push(
      runtime,
      borth_value_string(borth_string_new(runtime, value->chars + start, length)));
}

void borth_op_str_index_of(BorthRuntime *runtime) {
  size_t start = borth_pop_index(
      runtime,
      "STR_INDEX_OF requires integers on the stack",
      "STR_INDEX_OF requires start to be a non-negative integer");
  BorthString *needle =
      borth_pop_string(runtime, "STR_INDEX_OF requires strings on the stack");
  BorthString *value =
      borth_pop_string(runtime, "STR_INDEX_OF requires strings on the stack");

  if (start > value->len) {
    borth_panic("STR_INDEX_OF start is past end of string");
  }

  if (needle->len == 0) {
    borth_stack_push(runtime, borth_value_int((long)start));
    return;
  }

  if (needle->len > value->len || start > value->len - needle->len) {
    borth_stack_push(runtime, borth_value_int(-1));
    return;
  }

  for (size_t i = start; i <= value->len - needle->len; i += 1) {
    if (memcmp(value->chars + i, needle->chars, needle->len) == 0) {
      borth_stack_push(runtime, borth_value_int((long)i));
      return;
    }
  }

  borth_stack_push(runtime, borth_value_int(-1));
}

void borth_op_str_builder_new(BorthRuntime *runtime) {
  if (runtime->profile.enabled) {
    runtime->profile.str_builder_new += 1;
  }
  borth_stack_push(
      runtime,
      borth_value_string_builder(borth_string_builder_new(runtime)));
}

void borth_op_str_builder_push(BorthRuntime *runtime) {
  BorthString *value = borth_pop_string(
      runtime,
      "STR_BUILDER_PUSH requires strings on the stack");
  BorthStringBuilder *builder = borth_pop_string_builder(
      runtime,
      "STR_BUILDER_PUSH requires a string builder on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.str_builder_push += 1;
    runtime->profile.str_builder_push_copied_bytes += value->len;
  }
  borth_builder_append_chars(builder, value->chars, value->len);
  borth_stack_push(runtime, borth_value_string_builder(builder));
}

void borth_op_str_builder_len(BorthRuntime *runtime) {
  BorthStringBuilder *builder = borth_pop_string_builder(
      runtime,
      "STR_BUILDER_LEN requires a string builder on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.str_builder_len += 1;
  }
  borth_stack_push(runtime, borth_value_int((long)builder->len));
}

void borth_op_str_builder_freeze(BorthRuntime *runtime) {
  BorthStringBuilder *builder = borth_pop_string_builder(
      runtime,
      "STR_BUILDER_FREEZE requires a string builder on the stack");

  if (builder->frozen) {
    borth_panic("STR_BUILDER_FREEZE cannot freeze a frozen builder");
  }

  if (runtime->profile.enabled) {
    runtime->profile.str_builder_freeze += 1;
  }

  char *chars = builder->items;
  size_t len = builder->len;
  builder->items = NULL;
  builder->len = 0;
  builder->capacity = 0;
  builder->frozen = true;

  borth_stack_push(
      runtime,
      borth_value_string(borth_string_take_chars(runtime, chars, len)));
}

void borth_op_show(BorthRuntime *runtime) {
  BorthValue value =
      borth_stack_pop(runtime, "SHOW requires a value on the stack");
  BorthStringBuilder builder;
  borth_builder_init(&builder);
  borth_builder_append_value(&builder, value);

  borth_stack_push(
      runtime,
      borth_value_string(borth_string_new(runtime, builder.items, builder.len)));
  free(builder.items);
}

void borth_op_print_stack(BorthRuntime *runtime) {
  BorthStringBuilder builder;
  borth_builder_init(&builder);
  borth_builder_append_char(&builder, '[');

  for (size_t i = 0; i < runtime->stack.len; i += 1) {
    if (i > 0) {
      borth_builder_append_char(&builder, ' ');
    }

    borth_builder_append_value(&builder, runtime->stack.items[i]);
  }

  borth_builder_append_char(&builder, ']');
  printf("%s\n", builder.items);
  free(builder.items);
}

void borth_op_array_new(BorthRuntime *runtime) {
  if (runtime->profile.enabled) {
    runtime->profile.array_new += 1;
  }
  borth_stack_push(runtime, borth_value_array(borth_array_new(runtime, 4)));
}

void borth_op_array_push(BorthRuntime *runtime) {
  BorthValue value =
      borth_stack_pop(runtime, "ARRAY_PUSH requires a value on the stack");
  BorthArray *array =
      borth_pop_array(runtime, "ARRAY_PUSH requires an array on the stack");

  BorthArray *next = borth_array_new(runtime, array->len + 1);

  memcpy(next->items, array->items, array->len * sizeof(BorthValue));
  if (runtime->profile.enabled) {
    runtime->profile.array_push += 1;
    runtime->profile.array_push_copied_items += array->len;
  }
  next->items[array->len] = value;
  next->len = array->len + 1;

  borth_stack_push(runtime, borth_value_array(next));
}

void borth_op_array_len(BorthRuntime *runtime) {
  BorthArray *array =
      borth_pop_array(runtime, "ARRAY_LEN requires an array on the stack");
  if (runtime->profile.enabled) {
    runtime->profile.array_len += 1;
  }
  borth_stack_push(runtime, borth_value_int((long)array->len));
}

void borth_op_array_get(BorthRuntime *runtime) {
  size_t index = borth_pop_index(
      runtime,
      "ARRAY_GET requires integers on the stack",
      "ARRAY_GET requires index to be a non-negative integer");
  BorthArray *array =
      borth_pop_array(runtime, "ARRAY_GET requires an array on the stack");

  if (index >= array->len) {
    borth_panic("ARRAY_GET index is past end of array");
  }

  if (runtime->profile.enabled) {
    runtime->profile.array_get += 1;
  }
  borth_stack_push(runtime, array->items[index]);
}

void borth_op_array_builder_new(BorthRuntime *runtime) {
  if (runtime->profile.enabled) {
    runtime->profile.array_builder_new += 1;
  }
  borth_stack_push(
      runtime,
      borth_value_array_builder(borth_array_builder_new(runtime)));
}

void borth_op_array_builder_push(BorthRuntime *runtime) {
  BorthValue value =
      borth_stack_pop(runtime, "ARRAY_BUILDER_PUSH requires a value on the stack");
  BorthArrayBuilder *builder = borth_pop_array_builder(
      runtime,
      "ARRAY_BUILDER_PUSH requires an array builder on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.array_builder_push += 1;
  }
  borth_array_builder_append(builder, value);
  borth_stack_push(runtime, borth_value_array_builder(builder));
}

void borth_op_array_builder_len(BorthRuntime *runtime) {
  BorthArrayBuilder *builder = borth_pop_array_builder(
      runtime,
      "ARRAY_BUILDER_LEN requires an array builder on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.array_builder_len += 1;
  }
  borth_stack_push(runtime, borth_value_int((long)builder->len));
}

void borth_op_array_builder_get(BorthRuntime *runtime) {
  size_t index = borth_pop_index(
      runtime,
      "ARRAY_BUILDER_GET requires integers on the stack",
      "ARRAY_BUILDER_GET requires index to be a non-negative integer");
  BorthArrayBuilder *builder = borth_pop_array_builder(
      runtime,
      "ARRAY_BUILDER_GET requires an array builder on the stack");

  if (index >= builder->len) {
    borth_panic("ARRAY_BUILDER_GET index is past end of builder");
  }

  if (runtime->profile.enabled) {
    runtime->profile.array_builder_get += 1;
  }
  borth_stack_push(runtime, builder->items[index]);
}

void borth_op_array_builder_set(BorthRuntime *runtime) {
  BorthValue value =
      borth_stack_pop(runtime, "ARRAY_BUILDER_SET requires a value on the stack");
  size_t index = borth_pop_index(
      runtime,
      "ARRAY_BUILDER_SET requires integers on the stack",
      "ARRAY_BUILDER_SET requires index to be a non-negative integer");
  BorthArrayBuilder *builder = borth_pop_array_builder(
      runtime,
      "ARRAY_BUILDER_SET requires an array builder on the stack");

  if (builder->frozen) {
    borth_panic("ARRAY_BUILDER_SET cannot set a frozen builder");
  }

  if (index >= builder->len) {
    borth_panic("ARRAY_BUILDER_SET index is past end of builder");
  }

  if (runtime->profile.enabled) {
    runtime->profile.array_builder_set += 1;
  }
  builder->items[index] = value;
  borth_stack_push(runtime, borth_value_array_builder(builder));
}

void borth_op_array_builder_freeze(BorthRuntime *runtime) {
  BorthArrayBuilder *builder = borth_pop_array_builder(
      runtime,
      "ARRAY_BUILDER_FREEZE requires an array builder on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.array_builder_freeze += 1;
  }
  borth_stack_push(
      runtime,
      borth_value_array(borth_array_builder_freeze(runtime, builder)));
}

void borth_op_map_new(BorthRuntime *runtime) {
  if (runtime->profile.enabled) {
    runtime->profile.map_new += 1;
  }
  borth_stack_push(runtime, borth_value_map(borth_map_new(runtime)));
}

void borth_op_map_get(BorthRuntime *runtime) {
  BorthValue key =
      borth_stack_pop(runtime, "MAP_GET requires a key on the stack");
  BorthMap *map =
      borth_pop_map(runtime, "MAP_GET requires a map on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.map_get += 1;
  }

  BorthMapEntry *entry = borth_map_get(
      map,
      key,
      "MAP_GET requires map keys to be integers or strings");

  if (entry == NULL) {
    borth_stack_push(runtime, borth_value_int(0));
    borth_stack_push(runtime, borth_value_int(0));
    return;
  }

  borth_stack_push(runtime, entry->value);
  borth_stack_push(runtime, borth_value_int(1));
}

void borth_op_map_has(BorthRuntime *runtime) {
  BorthValue key =
      borth_stack_pop(runtime, "MAP_HAS requires a key on the stack");
  BorthMap *map =
      borth_pop_map(runtime, "MAP_HAS requires a map on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.map_has += 1;
  }

  borth_stack_push(
      runtime,
      borth_value_bool(
          borth_map_get(
              map,
              key,
              "MAP_HAS requires map keys to be integers or strings") != NULL));
}

void borth_op_map_set(BorthRuntime *runtime) {
  BorthValue value =
      borth_stack_pop(runtime, "MAP_SET requires a value on the stack");
  BorthValue key =
      borth_stack_pop(runtime, "MAP_SET requires a key on the stack");
  BorthMap *map =
      borth_pop_map(runtime, "MAP_SET requires a map on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.map_set += 1;
  }
  borth_map_set(map, key, value);
  borth_stack_push(runtime, borth_value_map(map));
}

void borth_op_map_size(BorthRuntime *runtime) {
  BorthMap *map =
      borth_pop_map(runtime, "MAP_SIZE requires a map on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.map_size += 1;
  }
  borth_stack_push(runtime, borth_value_int((long)map->len));
}

void borth_op_record_new(BorthRuntime *runtime) {
  BorthArray *defaults =
      borth_pop_array(runtime, "RECORD_NEW requires defaults array on the stack");
  BorthString *shape =
      borth_pop_string(runtime, "RECORD_NEW requires shape string on the stack");

  if (runtime->profile.enabled) {
    runtime->profile.record_new += 1;
  }

  borth_stack_push(
      runtime,
      borth_value_record(
          borth_record_new(runtime, shape, defaults->items, defaults->len)));
}

void borth_op_record_copy(BorthRuntime *runtime) {
  BorthString *shape =
      borth_pop_string(runtime, "RECORD_COPY requires shape string on the stack");
  BorthRecord *record =
      borth_pop_record(runtime, shape, "RECORD_COPY requires matching record");

  if (runtime->profile.enabled) {
    runtime->profile.record_copy += 1;
  }

  borth_stack_push(
      runtime,
      borth_value_record(
          borth_record_new(runtime, record->shape, record->fields, record->len)));
}

void borth_op_record_get(BorthRuntime *runtime) {
  size_t index = borth_pop_index(
      runtime,
      "RECORD_GET requires integer index on the stack",
      "RECORD_GET requires index to be a non-negative integer");
  BorthString *field =
      borth_pop_string(runtime, "RECORD_GET requires field string on the stack");
  BorthString *shape =
      borth_pop_string(runtime, "RECORD_GET requires shape string on the stack");
  BorthRecord *record =
      borth_pop_record(runtime, shape, "RECORD_GET requires matching record");

  if (index >= record->len) {
    borth_panic("RECORD_GET field is missing from record");
  }

  (void)field;

  if (runtime->profile.enabled) {
    runtime->profile.record_get += 1;
  }

  borth_stack_push(runtime, record->fields[index]);
}

void borth_op_record_set(BorthRuntime *runtime) {
  size_t index = borth_pop_index(
      runtime,
      "RECORD_SET requires integer index on the stack",
      "RECORD_SET requires index to be a non-negative integer");
  BorthString *field =
      borth_pop_string(runtime, "RECORD_SET requires field string on the stack");
  BorthString *shape =
      borth_pop_string(runtime, "RECORD_SET requires shape string on the stack");
  BorthValue value =
      borth_stack_pop(runtime, "RECORD_SET requires a value on the stack");
  BorthRecord *record =
      borth_pop_record(runtime, shape, "RECORD_SET requires matching record");

  if (index >= record->len) {
    borth_panic("RECORD_SET field is missing from record");
  }

  (void)field;

  if (runtime->profile.enabled) {
    runtime->profile.record_set += 1;
  }

  record->fields[index] = value;
  borth_stack_push(runtime, borth_value_record(record));
}

void borth_op_record_get_field(
    BorthRuntime *runtime, const char *shape, const char *field, long index) {
  if (index < 0) {
    borth_panic("RECORD_GET_FIELD requires index to be a non-negative integer");
  }

  BorthRecord *record = borth_pop_record_cstr(
      runtime,
      shape,
      "RECORD_GET_FIELD requires matching record");

  if ((size_t)index >= record->len) {
    borth_panic("RECORD_GET_FIELD field is missing from record");
  }

  (void)field;

  if (runtime->profile.enabled) {
    runtime->profile.record_get_field += 1;
  }

  borth_stack_push(runtime, record->fields[index]);
}

void borth_op_record_set_field(
    BorthRuntime *runtime, const char *shape, const char *field, long index) {
  if (index < 0) {
    borth_panic("RECORD_SET_FIELD requires index to be a non-negative integer");
  }

  BorthValue value =
      borth_stack_pop(runtime, "RECORD_SET_FIELD requires a value on the stack");
  BorthRecord *record = borth_pop_record_cstr(
      runtime,
      shape,
      "RECORD_SET_FIELD requires matching record");

  if ((size_t)index >= record->len) {
    borth_panic("RECORD_SET_FIELD field is missing from record");
  }

  (void)field;

  if (runtime->profile.enabled) {
    runtime->profile.record_set_field += 1;
  }

  record->fields[index] = value;
  borth_stack_push(runtime, borth_value_record(record));
}

void borth_op_alloc_variable(BorthRuntime *runtime) {
  if (runtime->memory.len == runtime->memory.capacity) {
    borth_memory_grow(runtime);
  }

  runtime->memory.items[runtime->memory.len] = borth_value_int(0);
  runtime->memory.len += 1;
}

void borth_op_fetch(BorthRuntime *runtime) {
  size_t address = borth_pop_index(
      runtime,
      "FETCH requires integers on the stack",
      "FETCH requires address to be a non-negative integer");

  if (address >= runtime->memory.len) {
    borth_panic("FETCH address is past end of memory");
  }

  borth_stack_push(runtime, runtime->memory.items[address]);
}

void borth_op_store(BorthRuntime *runtime) {
  size_t address = borth_pop_index(
      runtime,
      "STORE requires integers on the stack",
      "STORE requires address to be a non-negative integer");
  BorthValue value =
      borth_stack_pop(runtime, "STORE requires a value on the stack");

  if (address >= runtime->memory.len) {
    borth_panic("STORE address is past end of memory");
  }

  runtime->memory.items[address] = value;
}

void borth_op_random(BorthRuntime *runtime) {
  static bool seeded = false;
  long max = borth_pop_int(runtime, "RANDOM requires integers on the stack");

  if (max <= 0) {
    borth_panic("RANDOM requires a positive integer maximum");
  }

  if (!seeded) {
    srand((unsigned int)time(NULL));
    seeded = true;
  }

  borth_stack_push(runtime, borth_value_int(rand() % max));
}

void borth_op_clock_ms(BorthRuntime *runtime) {
  struct timeval now;

  if (gettimeofday(&now, NULL) != 0) {
    borth_panic("CLOCK_MS failed to read host clock");
  }

  long milliseconds = (long)(now.tv_sec * 1000L + now.tv_usec / 1000L);
  borth_stack_push(runtime, borth_value_int(milliseconds));
}

void borth_op_read_line(BorthRuntime *runtime) {
  borth_stack_push(
      runtime,
      borth_value_string(borth_read_line_string(runtime)));
}

void borth_op_read_int(BorthRuntime *runtime) {
  BorthString *input = borth_read_line_string(runtime);
  borth_stack_push(runtime, borth_value_int(borth_parse_int_input(input)));
}

void borth_op_read_text_file(BorthRuntime *runtime) {
  BorthString *path =
      borth_pop_string(runtime, "READ_TEXT_FILE requires strings on the stack");
  borth_stack_push(runtime, borth_value_string(borth_read_file(runtime, path)));
}

void borth_op_write_text_file(BorthRuntime *runtime) {
  BorthString *contents =
      borth_pop_string(runtime, "WRITE_TEXT_FILE requires strings on the stack");
  BorthString *path =
      borth_pop_string(runtime, "WRITE_TEXT_FILE requires strings on the stack");

  borth_write_file(
      runtime,
      path,
      contents,
      "wb",
      "WRITE_TEXT_FILE failed while writing file");
}

void borth_op_append_text_file(BorthRuntime *runtime) {
  BorthString *contents =
      borth_pop_string(runtime, "APPEND_TEXT_FILE requires strings on the stack");
  BorthString *path =
      borth_pop_string(runtime, "APPEND_TEXT_FILE requires strings on the stack");

  borth_write_file(
      runtime,
      path,
      contents,
      "ab",
      "APPEND_TEXT_FILE failed while writing file");
}

void borth_op_file_exists(BorthRuntime *runtime) {
  BorthString *path =
      borth_pop_string(runtime, "FILE_EXISTS requires strings on the stack");
  borth_stack_push(runtime, borth_value_bool(access(path->chars, F_OK) == 0));
}

void borth_op_env(BorthRuntime *runtime) {
  BorthString *name =
      borth_pop_string(runtime, "ENV requires strings on the stack");
  char *value = getenv(name->chars);

  if (value == NULL) {
    borth_stack_push(
        runtime,
        borth_value_string(borth_string_new(runtime, "", 0)));
    borth_stack_push(runtime, borth_value_bool(false));
    return;
  }

  borth_stack_push(
      runtime,
      borth_value_string(borth_string_new(runtime, value, strlen(value))));
  borth_stack_push(runtime, borth_value_bool(true));
}

void borth_op_args(BorthRuntime *runtime) {
  BorthArray *args = borth_array_new(runtime, (size_t)runtime->argc);

  for (int i = 0; i < runtime->argc; i += 1) {
    borth_array_append(
        args,
        borth_value_string(
            borth_string_new(runtime, runtime->argv[i], strlen(runtime->argv[i]))));
  }

  borth_stack_push(runtime, borth_value_array(args));
}

void borth_op_run_command(BorthRuntime *runtime) {
  BorthArray *args =
      borth_pop_array(runtime, "RUN_COMMAND requires an array on the stack");
  BorthString *command =
      borth_pop_string(runtime, "RUN_COMMAND requires strings on the stack");
  if (runtime->profile.enabled) {
    runtime->profile.run_command += 1;
  }
  char **argv =
      borth_malloc((args->len + 2) * sizeof(char *), "failed to allocate argv");

  argv[0] = command->chars;

  for (size_t i = 0; i < args->len; i += 1) {
    if (args->items[i].kind != BORTH_VALUE_STRING) {
      free(argv);
      borth_panic("RUN_COMMAND requires args to contain only strings");
    }

    argv[i + 1] = args->items[i].as.string->chars;
  }

  argv[args->len + 1] = NULL;

  int stdout_pipe[2];
  int stderr_pipe[2];

  if (pipe(stdout_pipe) != 0) {
    free(argv);
    borth_panic("RUN_COMMAND failed to create stdout pipe");
  }

  if (pipe(stderr_pipe) != 0) {
    close(stdout_pipe[0]);
    close(stdout_pipe[1]);
    free(argv);
    borth_panic("RUN_COMMAND failed to create stderr pipe");
  }

  pid_t child_pid = fork();

  if (child_pid < 0) {
    close(stdout_pipe[0]);
    close(stdout_pipe[1]);
    close(stderr_pipe[0]);
    close(stderr_pipe[1]);
    free(argv);
    borth_panic("RUN_COMMAND failed to start command");
  }

  if (child_pid == 0) {
    close(stdout_pipe[0]);
    close(stderr_pipe[0]);

    if (dup2(stdout_pipe[1], STDOUT_FILENO) < 0 ||
        dup2(stderr_pipe[1], STDERR_FILENO) < 0) {
      _exit(127);
    }

    close(stdout_pipe[1]);
    close(stderr_pipe[1]);
    execvp(command->chars, argv);
    perror(command->chars);
    _exit(127);
  }

  close(stdout_pipe[1]);
  close(stderr_pipe[1]);
  free(argv);

  BorthStringBuilder stdout_builder;
  BorthStringBuilder stderr_builder;
  borth_builder_init(&stdout_builder);
  borth_builder_init(&stderr_builder);
  borth_read_process_outputs(
      stdout_pipe[0],
      stderr_pipe[0],
      &stdout_builder,
      &stderr_builder);
  long exit_code = borth_wait_exit_code(child_pid);

  borth_stack_push(runtime, borth_value_int(exit_code));
  borth_stack_push(
      runtime,
      borth_value_string(borth_string_from_builder(runtime, &stdout_builder)));
  borth_stack_push(
      runtime,
      borth_value_string(borth_string_from_builder(runtime, &stderr_builder)));
  free(stdout_builder.items);
  free(stderr_builder.items);
}

void borth_op_cwd(BorthRuntime *runtime) {
  borth_stack_push(runtime, borth_value_string(borth_getcwd_string(runtime)));
}

void borth_op_path_dirname(BorthRuntime *runtime) {
  BorthString *path =
      borth_pop_string(runtime, "PATH_DIRNAME requires strings on the stack");
  borth_stack_push(runtime, borth_value_string(borth_path_dirname(runtime, path)));
}

void borth_op_path_resolve(BorthRuntime *runtime) {
  BorthString *path =
      borth_pop_string(runtime, "PATH_RESOLVE requires strings on the stack");
  BorthString *base =
      borth_pop_string(runtime, "PATH_RESOLVE requires strings on the stack");
  borth_stack_push(
      runtime,
      borth_value_string(borth_path_resolve(runtime, base, path)));
}

int borth_op_pop_condition(BorthRuntime *runtime) {
  return borth_pop_int(runtime, "JUMP_IF_FALSE requires integers on the stack") != 0;
}

void borth_op_push_return(BorthRuntime *runtime, long return_address) {
  if (runtime->return_stack.len == runtime->return_stack.capacity) {
    borth_return_stack_grow(runtime);
  }

  runtime->return_stack.items[runtime->return_stack.len] = return_address;
  runtime->return_stack.len += 1;
}

long borth_op_pop_return(BorthRuntime *runtime) {
  if (runtime->return_stack.len == 0) {
    borth_panic("RET requires a return address");
  }

  runtime->return_stack.len -= 1;
  return runtime->return_stack.items[runtime->return_stack.len];
}

void borth_op_invalid_return(BorthRuntime *runtime) {
  (void)runtime;
  borth_panic("RET resolved an invalid return address");
}

void borth_op_panic(BorthRuntime *runtime) {
  BorthString *message =
      borth_pop_string(runtime, "PANIC requires strings on the stack");
  borth_panic(message->chars);
}

void borth_op_exit(BorthRuntime *runtime) {
  long exit_code = borth_pop_int(runtime, "EXIT requires integers on the stack");
  exit((int)exit_code);
}

void borth_op_print(BorthRuntime *runtime) {
  BorthValue value =
      borth_stack_pop(runtime, "PRINT requires a value on the stack");

  switch (value.kind) {
    case BORTH_VALUE_INT:
      printf("%ld\n", value.as.integer);
      break;
    case BORTH_VALUE_STRING:
      printf("%s\n", value.as.string->chars);
      break;
    default:
      borth_panic("PRINT does not support this value kind yet");
  }
}
