# Project Spec: Toy Stack-Based Language

## Goal

Build a small experimental stack-based programming language for fun and learning.

The project is inspired by Tsoding's Porth, particularly the idea of starting with a tiny language and progressively bootstrapping its implementation. However, this is not intended to be a Porth clone.

The language should evolve organically as we use it. Part of the project is learning how to think and program in a stack-based paradigm rather than designing a complete language upfront.

The eventual goal is:

```text
source
  -> lexer / parser
  -> AST
  -> compiler
  -> bytecode
  -> VM
```

Eventually, the compiler and potentially other tooling should be rewritten in the language itself, allowing the original TypeScript implementation to be discarded.

## Host Language

Use TypeScript for the initial implementation.

The TypeScript implementation is considered temporary bootstrap infrastructure. Do not design the project around permanently depending on TypeScript.

Prefer simple, readable code over abstractions and frameworks.

## Core Philosophy

### 1. Start extremely small

The initial language should have the smallest useful kernel possible.

Do not add features speculatively.

When we encounter something we need, ask:

```text
Does this need to be a VM primitive, or can it be expressed using existing language features?
```

Prefer implementing things in the language itself where practical.

### 2. The language is stack-oriented

The primary mental model is transforming a value stack.

For example:

```text
10 20 +
```

Conceptually:

```text
[]
[10]
[10, 20]
[30]
```

Operations should have describable stack effects.

For example:

```text
dup  ( A -- A A )
swap ( A B -- B A )
drop ( A -- )
+    ( A B -- C )
```

Stack effects are initially documentation/convention rather than necessarily a formal type system.

### 3. Do not prematurely imitate Forth

The language may resemble Forth because it is concatenative and stack-based, but syntax, semantics, control flow, functions, data structures, and other features should be allowed to evolve naturally.

Avoid adding traditional C/Python-style constructs simply because they are familiar.

### 4. Keep the kernel small

The VM should understand only operations that genuinely require VM support.

For example, `dup` is a natural primitive because it directly manipulates the VM's stack.

Higher-level operations should preferably be defined in the language itself.

There should be an ongoing distinction between:

```text
VM primitives
    -> language definitions / standard library
    -> user programs
```

This boundary should evolve as the language evolves.

## Initial Architecture

Implement four major stages:

```text
Source
  -> Lexer
  -> Parser
  -> AST
  -> Compiler
  -> Bytecode
  -> Virtual Machine
```

Keep these components independent.

### Lexer

Initially the lexer can be extremely simple.

The language will likely begin with whitespace-separated words/tokens.

Support whatever literal syntax is actually needed by the first implementation, probably:

- integers
- identifiers/words
- punctuation required by definitions

Do not build a sophisticated lexer until the language needs one.

### Parser

Produce a simple AST representing the source program.

Do not over-design the AST.

The parser should be easy to modify as the language evolves.

### Compiler

Compile AST nodes into a simple bytecode representation.

Initially bytecode can simply be an array of instructions/opcodes rather than an actual binary file format.

For example:

```text
PUSH 10
PUSH 20
ADD
```

could initially be represented however is simplest for the VM.

The eventual goal is to support a real byte-oriented representation, but do not optimise or complicate this prematurely.

### VM

The VM owns execution state.

At minimum:

```text
instruction pointer
value stack
```

Later it may gain:

```text
call stack
environment / dictionary
heap
```

The VM repeatedly:

1. Fetches the instruction at the instruction pointer.
2. Executes it.
3. Advances or modifies the instruction pointer.
4. Continues until HALT.

The VM should not know about source syntax or ASTs.

## Initial Kernel

Start with only enough primitives to execute simple stack programs.

A likely starting point:

```text
HALT
PUSH
DROP
DUP
SWAP

ADD
SUB
MUL
DIV

JUMP
JUMP_IF_FALSE

CALL
RET
```

This is a starting point, not a final specification.

Some of these may prove unnecessary initially. Some additional primitive may become necessary.

The important principle is:

```text
Every kernel primitive should earn its place.
```

For example, if a useful operation can be expressed entirely in the language using existing primitives, prefer doing that rather than adding another VM opcode.

## Language Evolution

The first milestone should be extremely small.

Something like:

```text
10 20 + print
```

should eventually produce:

```text
30
```

From there, evolve toward:

```text
user-defined words
control flow
quotations / code-as-data
data structures
strings
file I/O
modules
```

but do not implement these all upfront.

Instead, use the language to solve increasingly interesting problems and let missing features emerge naturally.

A useful progression might eventually be:

```text
arithmetic
  -> functions / words
  -> branching
  -> loops / recursion
  -> data structures
  -> strings
  -> file I/O
  -> source manipulation
  -> lexer
  -> parser
  -> AST manipulation
  -> compiler
```

The interesting milestone is when the language becomes capable of implementing its own compiler.

## Bootstrapping Goal

The long-term architecture should eventually become:

```text
TypeScript
    -> bootstrap compiler / VM

Your language
    -> compiler written in your language
    -> bytecode
    -> VM
```

Eventually the compiler should be able to compile itself.

The TypeScript implementation can then become merely the bootstrap mechanism used to get the first self-hosting version running.

The VM and compiler do not need to be self-hosted simultaneously. Treat them as separate milestones.

## Design Constraints

- TypeScript initially.
- No external dependencies unless genuinely useful.
- Keep the implementation small and readable.
- Prefer explicit code over elaborate architecture.
- Do not build a full language spec yet.
- Do not prematurely implement optimisation.
- Do not prematurely implement a sophisticated type system.
- Do not prematurely design a binary executable format.
- Do not add features just because conventional languages have them.
- Document interesting design decisions as they arise.
- When something can either be a primitive or a language-level definition, prefer the latter unless there is a compelling reason for VM support.

Most importantly:

```text
The language itself is the experiment.
```

We are deliberately interested in discovering what it feels like to program in a stack-based language and allowing the language's design to emerge from actually using it.

## First Task

Create the TypeScript project and implement the smallest complete pipeline:

```text
source
-> tokens
-> AST
-> bytecode
-> VM
```

It should be possible to run a tiny program from the command line and see its result.

Start with integer literals and a handful of stack/arithmetic operations.

Do not implement anything beyond what is needed for this first vertical slice.

## Milestone 0: TypeScript Hello World

Status: done.

The repository currently contains TypeScript boilerplate and an executable hello world.

## Milestone 1: Smallest Complete Stack Program

Goal:

```text
10 20 + print
```

should run through:

```text
source -> tokens -> AST -> bytecode -> VM
```

and print:

```text
30
```

Out of scope for milestone 1:

- user-defined words
- control flow
- quotations
- strings
- files as source input, unless we decide the CLI needs it immediately
- a binary bytecode format
- optimisation

Initial primitive decisions:

- `PUSH` exists because integer literals need to place values on the VM stack.
- `DROP`, `DUP`, and `SWAP` exist because reshaping the stack is fundamental in a stack language.
- Arithmetic primitives currently operate on integers.
- Comparisons currently return `1` for true and `0` for false.
- `PRINT` exists temporarily as host I/O so we can observe programs from the CLI.
- `HALT` exists so bytecode has an explicit stopping point.

## Milestone 2: Small Documented Programs

Goal:

```sh
yarn borth -- examples/add.borth
```

should read source from a file and run it through the existing pipeline.

Comment decision:

- `#` starts a whole-line comment after optional leading whitespace.
- Inline comments are intentionally not supported yet.

## Milestone 3: First Conditional

Goal:

```text
10 20 < if
  999 print
end
```

should print `999`.

Conditional decision:

- The condition is ordinary code that leaves an integer flag on the stack.
- `if` consumes the flag.
- `0` is false. Any other integer is true.
- Source-level `if ... end` compiles to bytecode-level `JUMP_IF_FALSE`.
- Source-level `if ... else ... end` compiles to `JUMP_IF_FALSE` and `JUMP`.
- `else` belongs to the nearest unmatched `if`.

Testing decision:

- Use Node's built-in test runner.
- Prefer behavior tests for control flow over exhaustive primitive tests.
- `run` accepts a write callback so tests can capture `print` output directly.

## Milestone 4: User-Defined Words

Goal:

```text
: square
  dup *
;

10 square print
```

should print `100`.

Definition decision:

- `:` starts a word definition.
- The next token is the word name.
- `;` ends the definition.
- Calling a user-defined word is just writing its name.
- User-defined words compile to `CALL`; definitions end with `RET`.
- The VM has a call stack for return addresses.
- Definitions must appear before use for now.

## Milestone 5: Recursion

Goal:

```text
: fact
  dup 2 < if
    drop 1
  else
    dup 1 - fact *
  end
;

5 fact print
```

should print `120`.

Recursion decision:

- Self-recursion works because a word is registered before its body is compiled.
- The recursive call compiles to `CALL` like any other user-defined word.
- Mutual recursion and other forward references are intentionally unsupported for now.

Debugging decision:

- `.s` prints the current value stack without changing it.
- Stack output is formatted from bottom to top, with the top of the stack on the right.

## Milestone 6: Strings

Goal:

```text
"hello, borth" print
```

should print `hello, borth`.

String decision:

- Strings are the second value type after integers.
- Runtime stack values are currently `number | string`.
- Strings can contain whitespace, but cannot span source lines.
- Supported escapes are `\"`, `\\`, and `\n`.
- Stack manipulation words operate on all values.
- Arithmetic, comparison, and conditional flags still require numbers.

## Milestone 7: Prelude

Goal:

Common helper words should be available to every program without becoming VM
primitives unless they genuinely need VM support.

Prelude decision:

- `prelude.borth` is loaded before every user program.
- The prelude is written in Borth and should stay small.
- Prelude words are treated like normal user-defined words after loading.
- User programs cannot redefine prelude words.
- Initial prelude words are `not`, `and`, `or`, `nip`, and `tuck`.
- `rot` is a VM primitive for now because the current language cannot express
  `( A B C -- B C A )` using only `drop`, `dup`, `swap`, and `over`.

## Milestone 8: Basic Input

Goal:

```text
read-line print
```

should read one stdin line and print it back.

Input decision:

- `read-line` is the first input primitive.
- Stack effect: `( -- string )`.
- `read-line` is compiled to a VM instruction because it crosses the host IO
  boundary.
- The VM receives input through an injected callback so tests can stay
  deterministic.
- The CLI provides the real stdin-backed input callback.
