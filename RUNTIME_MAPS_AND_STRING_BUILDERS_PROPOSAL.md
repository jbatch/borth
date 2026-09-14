# Runtime Maps And String Builders Proposal

Draft proposal for the next performance-oriented language/runtime slice.

## Why This Slice

The array-builder work removed the largest known immutable-array construction
cost from the Borth-written compiler. The remaining obvious pressure points are:

- compiler lookup maps are still array-backed association lists
- generated C emission writes one small string at a time
- repeated string concatenation still copies the full prefix each time

The shape is similar to array builders: keep ordinary values predictable, but
add narrow mutable construction/runtime helpers for places where repeated
copying is the point of the bottleneck.

## Part 1: String Builders

### Proposed Public Words

```text
str-builder-new    ( -- builder )
str-builder-push   ( builder string -- builder )
str-builder-len    ( builder -- len )
str-builder-freeze ( builder -- string )

str-join           ( strings separator -- string )
str-concat         ( strings -- string )
```

`str-builder-freeze` should make the builder unusable afterward, matching
`array-builder-freeze`.

`str-join` should accept an array of strings and insert the separator between
items. Empty arrays return `""`. `str-concat` can be a tiny Borth word:

```text
: str-concat
  ""
  str-join
;
```

### Why A Runtime Primitive

Borth can already concatenate strings with `str-cat`, but a loop like this:

```text
""
loop
  ...
while
  str-cat
repeat
```

copies the growing prefix over and over. A string builder is a runtime concern
because strings are opaque runtime values and only the runtime can append into a
growable character buffer without creating a new Borth string every step.

### Implementation Order

1. Add `StringBuilderValue` to the TypeScript VM value model.
2. Add bytecode ops:

```text
STR_BUILDER_NEW
STR_BUILDER_PUSH
STR_BUILDER_LEN
STR_BUILDER_FREEZE
```

3. Teach the TypeScript compiler and VM those four ops.
4. Teach the Borth compiler and Borth VM those four instruction names.
5. Expose the same operations in the C runtime and C emitter.
6. Implement `str-join` and `str-concat` in `lib/strings.borth`.
7. Add profiling counters:

```text
str-builder-new
str-builder-push copied-bytes=...
str-builder-freeze
str-join
```

The C runtime already has an internal `BorthStringBuilder`; this step should
turn that into a heap-owned runtime value, while continuing to use local
temporary builders for purely internal helper code like `show`.

## Part 2: C Emitter Output Buffering

### Current Problem

The native self-build path currently emits generated C through many
`append-text-file` calls. A recent profile of:

```text
node dist/main.js examples/borth-compiler.borth build examples/borth-compiler.borth --emit-c /private/tmp/borth-compiler.c -o /private/tmp/borth-compiler --keep-c
```

showed roughly:

```text
append-text-file: 31285 bytes=434822
str-cat: 52790 copied-bytes=1144029
```

The byte count is not scary. The call count is.

### Proposed Emitter Shape

Add a source-producing word:

```text
emit-c-program-source ( instructions -- source )
```

Then make the file-writing word boring:

```text
write-c-program ( instructions file-path -- )
  swap
  emit-c-program-source
  swap
  write-text-file
;
```

The emitter should carry a string builder through the generation pass:

```text
c-builder-line ( builder line -- builder )
```

This avoids both repeated file appends and repeated prefix-copying through
`str-cat`.

### Why Not Array Of Lines First

With array builders, an array-of-lines approach is now much less bad than it was
before. It would also make some tests pleasant because generated source is a
value.

But for the C emitter, direct string-builder emission is still the clearer
performance lesson:

- no intermediate array of tens of thousands of strings
- no final array traversal just to join
- the stack effect mirrors "write this generated text"

`str-join` should still exist because it is generally useful library code.

## Part 3: Runtime Maps

### Proposed Public Words

Keep the existing map surface first:

```text
map-new   ( -- map )
map-get   ( map key -- value found? )
map-has?  ( map key -- found? )
map-set   ( map key value -- map )
map-size  ( map -- size )
```

Add iteration only when a real compiler task asks for it:

```text
map-keys   ( map -- keys )
map-values ( map -- values )
```

### Key Equality

Start with the same equality domain as `=`:

- integers
- strings

Reject array, builder, and future object keys until there is a deliberate value
equality story for heap objects.

### Mutability Choice

There are two plausible designs:

1. `map-set` returns a new immutable map, like `array-push`.
2. `map-set` mutates the map runtime object and returns the same map.

For compiler internals, option 2 is much faster and probably the right first
slice. Maps are already threaded through compiler state as explicit state, so
the aliasing risk is mostly local and understandable.

If we want the array-builder distinction to stay crisp, use this split instead:

```text
map-new          ( -- map )
map-get          ( map key -- value found? )
map-has?         ( map key -- found? )
map-size         ( map -- size )

map-builder-new  ( -- builder )
map-builder-set  ( builder key value -- builder )
map-builder-get  ( builder key -- value found? )
map-builder-size ( builder -- size )
map-builder-freeze ( builder -- map )
```

That design is more principled, but it is also larger. My bias is to start with
mutable runtime `map-set`, document it plainly, and revisit immutable maps only
when Borth has a broader value-semantics story.

### Representation

TypeScript VM:

```ts
type MapValue = {
  kind: "map";
  items: Map<string, { key: Value; value: Value }>;
};
```

Use a tagged hash key such as:

```text
i:123
s:hello
```

This keeps lookup simple while preserving the original key for future
inspection.

C runtime:

- `BORTH_VALUE_MAP`
- `BorthMap` heap object
- open-addressed hash table or simple bucket array
- string and integer keys only
- grow when load factor gets too high

For the first C runtime version, separate chaining is probably easiest to read:

```c
typedef struct BorthMapEntry {
  BorthValue key;
  BorthValue value;
  struct BorthMapEntry *next;
} BorthMapEntry;

typedef struct {
  BorthMapEntry **buckets;
  size_t bucket_count;
  size_t len;
} BorthMap;
```

### Migration From `lib/map.borth`

`lib/map.borth` currently defines maps as arrays of `[key value]` pairs.

Once all execution targets support runtime maps, replace that file with a small
compatibility/documentation layer or remove the implementation entirely. Avoid
leaving `: map-new ... ;` definitions around after namespace validation starts
rejecting user words that collide with built-ins.

## Suggested Milestones

### Milestone A: String Builder Core

- TypeScript value, bytecode, compiler, VM
- Borth compiler and Borth VM parity
- C runtime and C emitter parity
- focused tests for push/freeze/frozen errors

Learning target: mutable construction values for opaque strings.

### Milestone B: `str-join`

- implement `str-join` in `lib/strings.borth`
- implement `str-concat` as a tiny helper
- add tests for empty, one item, multiple items, and separator behavior

Learning target: standard library word built on top of a narrow primitive.

### Milestone C: C Emitter Builder Refactor

- add `emit-c-program-source`
- rewrite emitter helpers to thread a string builder
- call `write-text-file` once
- profile native self-build before/after

Learning target: generated text as a value, plus fewer host boundary crossings.

### Milestone D: Runtime Map Core

- TypeScript runtime map
- Borth compiler and Borth VM parity
- C runtime and C emitter parity
- keep the existing `map-*` public stack effects
- update `lib/map.borth` migration story

Learning target: when a data structure graduates from Borth library code into
the runtime.

### Milestone E: Compiler Map Migration

- compile the compiler with runtime maps
- profile lookup-heavy workloads
- compare old array-backed map counts with new map counters

Learning target: using measurement to justify a VM primitive.

## Open Questions

- Should `map-set` be explicitly mutable, or should maps get a builder/freeze
  split like arrays?
- Should `str-builder-len` report bytes or characters? Current strings are
  indexed by JS/C string length behavior, so bytes/code units are the practical
  answer for now.
- Should `str-join` validate every array item before building, or fail at the
  first non-string during the loop?
- Should generated C become an inspectable string artifact before writing, or
  should `write-c-program` remain the only public C-emitter entry point?
- Should map iteration preserve insertion order? The current array-backed map
  does. A hash map would not unless we store order deliberately.

## Recommended First Step

Start with string builders.

They are smaller than maps, they directly improve C emitter output, and they
reuse a runtime idea that already exists in C internally. After that, `str-join`
is a small satisfying library feature. Runtime maps can follow once the new
builder pattern has been carried through all three execution targets.
