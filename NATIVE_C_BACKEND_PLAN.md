# Native C Backend Plan

This is a spike plan for turning Borth bytecode into C source, then using the
system C compiler as the native-code backend.

The goal is not to design a perfect final backend. The goal is to get a small,
inspectable path from:

```text
Borth source -> bytecode -> generated C -> executable
```

This keeps the compiler shape close to the VM we already understand while
moving runtime behavior into portable C helpers.

## Mental Model

The generated C should not be a bytecode interpreter.

An interpreter would keep bytecode around at runtime, fetch one instruction,
switch on its opcode, update a program counter, and repeat.

The C backend should instead emit the program's instruction order directly:

```c
L0:
  borth_push(&rt, borth_number(10));
  goto L1;

L1:
  borth_push(&rt, borth_number(20));
  goto L2;

L2:
  borth_add(&rt);
  goto L3;
```

The generated program still delegates primitive behavior to a shared runtime,
but it does not decode bytecode after it has been compiled.

## Main Pieces

### C Runtime

The runtime is ordinary C that can be tested by itself. It owns:

- value representation
- data stack
- call stack
- variable memory
- strings
- arrays
- printing and panic behavior
- host operations such as files, env vars, cwd, and path helpers

Early versions can leak allocations and use fixed-size stacks. That is fine for
the first slice. Memory ownership can become a deliberate milestone once strings
and arrays are useful enough to stress it.

The runtime should probably live as a standalone C source string at first, then
move to a real file once editing it inside a Borth string becomes annoying.

### C Emitter

The emitter starts from compiled bytecode. It writes:

1. The C runtime source.
2. `int main(void)`.
3. Runtime initialization.
4. One C label per bytecode instruction.
5. A small C fragment for each instruction.
6. A shared return dispatcher for `RET`.

The first Borth implementation can mirror the Borth VM dispatch structure:

```text
read opcode
if opcode is PUSH, emit push helper call
if opcode is ADD, emit add helper call
if opcode is JUMP, emit goto target
...
```

The difference is that the emitter prints C instead of executing the operation.

### Build Wrapper

Later, a `build` command can make the C step feel like native compilation:

```text
borth build input.borth -o output
```

Internally that can:

1. Compile Borth to bytecode.
2. Emit temporary C.
3. Run `cc`.
4. Remove temporary files unless a debug flag asks to keep them.

The generated C should remain easy to inspect. A `--keep-c` or `emit-c` command
is important while this backend is still being learned.

## Suggested Runtime Milestones

Each milestone should include a tiny standalone C runtime test and then one
end-to-end generated Borth program.

### 1. Numbers, Stack, Add, Print

Runtime support:

- `Value` with number values only
- stack init, push, pop
- `borth_add`
- `borth_print`
- `borth_panic`

Emitter support:

- `PUSH number`
- `ADD`
- `PRINT`
- `HALT`
- fallthrough as `goto Lnext`

End-to-end target:

```borth
10 20 + print
```

Expected output:

```text
30
```

### 2. Basic Stack Operations

Runtime support:

- `drop`
- `dup`
- `swap`
- `over`
- `rot`
- `.s`

Emitter support:

- direct helper call for each matching opcode

End-to-end target:

```borth
1 2 3 rot .s
10 dup * print
```

Expected output:

```text
[2 3 1]
100
```

### 3. Arithmetic and Comparisons

Runtime support:

- subtraction
- multiplication
- division
- modulo
- equality
- less-than
- greater-than

Emitter support:

- direct helper call for each arithmetic and comparison opcode

End-to-end target:

```borth
10 3 - print
6 7 * print
10 20 < print
```

### 4. Branching and Loops

Runtime support:

- no new runtime helpers beyond numeric pop for branch conditions

Emitter support:

- `JUMP` emits `goto Ltarget`
- `JUMP_IF_FALSE` pops a number and branches when it is zero

End-to-end target:

```borth
10 20 < if
  111 print
else
  222 print
end
```

Loop target:

```borth
3 loop
  dup print
  1 -
  dup 0 =
until
drop
```

### 5. Word Calls and Returns

Runtime support:

- call stack
- push return label
- pop return label

Emitter support:

- `CALL target` pushes `index + 1`, then jumps to `target`
- `RET` jumps to one shared return dispatcher
- the shared return dispatcher switches on the popped return label

Generated shape:

```c
L12:
  borth_call_push(&rt, 13);
  goto L40;

L48:
  goto BORTH_RETURN;

BORTH_RETURN:
  switch (borth_call_pop(&rt)) {
    case 13: goto L13;
    default: borth_panic("invalid return address");
  }
```

End-to-end target:

```borth
: square dup * ;
9 square print
```

Expected output:

```text
81
```

### 6. Variables and Memory

Runtime support:

- address values
- global memory cells
- allocate variable cell
- fetch
- store

Emitter support:

- variable allocation opcode
- address literal push
- `@`
- `!`

End-to-end target:

```borth
variable count
3 count !
count @ print
```

### 7. Strings

Runtime support:

- tagged values for numbers, strings, and addresses
- string allocation and copy
- string print
- string equality
- `str-len`
- `str-cat`
- `show`

Emitter support:

- string literal escaping into C string literals
- string `PUSH`
- direct helper calls for string words

End-to-end target:

```borth
"hello, " "native" str-cat print
"abc" str-len print
```

### 8. Arrays

Runtime support:

- array value
- array allocation
- array length
- array push
- array get
- debug rendering for `show` and `.s`

Emitter support:

- array literal handling if bytecode can contain array values
- direct helper calls for array words

This is probably the point where memory ownership needs a more serious pass.

### 9. Host Boundary

Runtime support:

- stdin reads
- text file reads
- file existence
- environment variable lookup
- cwd
- path dirname
- path resolve

Emitter support:

- direct helper calls for host opcodes

These should stay runtime responsibilities. The generated program is the thing
running on the user's machine, so it should ask the OS directly.

### 10. Build Command

Runtime support:

- none

Compiler/tooling support:

- emit C to a requested file
- compile C with `cc`
- choose output executable path
- optionally keep generated C
- report `cc` failures clearly

Possible commands:

```sh
borth emit-c input.borth output.c
borth build input.borth -o output
borth build --keep-c input.borth -o output
```

## C Runtime Development Loop

Use plain C first for each runtime milestone.

Example shape:

```c
int main(void) {
  Runtime rt;
  borth_runtime_init(&rt);

  borth_push(&rt, borth_number(10));
  borth_push(&rt, borth_number(20));
  borth_add(&rt);
  borth_print(&rt);

  return 0;
}
```

That lets the runtime be compiled and tested quickly:

```sh
cc runtime.c -o /tmp/borth-runtime-test
/tmp/borth-runtime-test
```

Once the helper behavior is right, update the Borth emitter to generate the same
calls and run the end-to-end program.

## Bytecode To C Emission Rules

Normal instructions emit helper calls followed by `goto Lnext`.

```text
PUSH value       -> borth_push(&rt, value); goto Lnext;
ADD              -> borth_add(&rt); goto Lnext;
PRINT            -> borth_print(&rt); goto Lnext;
JUMP target      -> goto Ltarget;
JUMP_IF_FALSE t  -> if pop flag is zero, goto Lt; else goto Lnext;
CALL target      -> push return label; goto Ltarget;
RET              -> goto BORTH_RETURN;
HALT             -> return 0;
```

This keeps the first backend close to the VM. If that starts to feel too noisy,
a later backend can preserve word boundaries and emit C functions instead.

## Open Design Questions

- Should the runtime be embedded as one generated source file, or compiled as a
  separate object file and linked with generated C?
- When should strings and arrays stop leaking and get real ownership rules?
- Should generated C use labels and `goto`, or eventually use functions per
  word?
- How much of the host boundary belongs in the C runtime versus external helper
  libraries?
- Should native build support require `cc`, or should it look for a configurable
  compiler command?

The current answer can be conservative: generate one complete C file, require a
system `cc`, and optimize for visible, debuggable output.
