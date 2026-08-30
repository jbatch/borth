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
- Runtime stack values now include numbers, strings, and addresses.
- Strings can contain whitespace, but cannot span source lines.
- Supported escapes are `\"`, `\\`, and `\n`.
- Stack manipulation words operate on all values.
- Arithmetic, ordering comparisons, and conditional flags still require numbers.

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
- `2dup` is a prelude word because `( A B -- A B A B )` can be expressed as
  `over over`.
- `rot` is a VM primitive for now because the current language cannot express
  `( A B C -- B C A )` using only `drop`, `dup`, `swap`, and `over`.
- `roll` and `-roll` are VM primitives because they move stack values at a
  runtime-selected depth. They are useful pressure valves while exploring
  parser code, but should not replace factoring or clearer loop stack shapes.

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

## Milestone 9: Integer Input

Goal:

```text
read-int 2 * print
```

with input `21` should print `42`.

Integer input decision:

- `read-int` reads one line through the same input callback as `read-line`.
- Stack effect: `( -- number )`.
- Leading and trailing whitespace is ignored.
- The whole trimmed line must be an integer.
- Invalid input throws instead of partially parsing.

## Milestone 10: Random Numbers

Goal:

```text
1 100 random-between print
```

should print a random integer from `1` to `100`, inclusive.

Random decision:

- `random` is a VM primitive because it crosses the host entropy boundary.
- Stack effect: `random ( max -- n )`.
- `random` returns an integer from `0` to `max - 1`.
- `max` must be a positive integer.
- The VM receives randomness through an injected callback so tests can stay
  deterministic.
- `random-between ( min max -- n )` is implemented in `prelude.borth`.
- `random-between` is inclusive on both ends.

## Milestone 11: Post-Condition Loops

Goal:

```text
1 loop
  dup print
  1 +
  dup 6 =
until
drop
```

should print `1` through `5`.

Loop decision:

- The initial loop syntax is `loop ... until`.
- `loop` marks the start of a post-condition loop.
- `until` consumes a numeric flag from the top of the stack.
- `until` exits when the flag is non-zero.
- `until` jumps back to the matching `loop` when the flag is `0`.
- `until` compiles to the existing `JUMP_IF_FALSE`; no VM opcode is needed.
- Nested control-flow blocks must close in order.

## Milestone 12: Variable Cells

Goal:

```text
variable count
0 count !
count @ print
```

should print `0`.

Variable decision:

- Variables are globally scoped, like user-defined words.
- `variable name` is compiler syntax, similar to `: name ... ;`.
- A variable declaration allocates one mutable VM cell initialized to `0`.
- After declaration, the variable name becomes a word.
- Running a variable word pushes its address.
- Addresses are their own value type, not plain numbers.
- `@` fetches from an address: `( addr -- A )`.
- `!` stores into an address: `( A addr -- )`.

## Milestone 13: String Equality

Goal:

```text
"yes" read-line = if
  "matched" print
end
```

should print `matched` when the user enters `yes`.

String equality decision:

- `=` compares two numbers or two strings and returns a numeric flag.
- Mixed-type equality throws instead of silently returning false.
- Ordering comparisons remain number-only.

## Milestone 14: String Concatenation

Goal:

```text
"hello, " "borth" str-cat print
```

should print:

```text
hello, borth
```

String concatenation decision:

- `str-cat` is a VM primitive for now because strings are opaque runtime values.
- `+` remains numeric only; string concatenation is explicit.
- `show ( A -- string )` formats a value as a debug string. Strings are quoted,
  matching `.s`, so debug messages can distinguish `"hello"` from a word-like
  string.
- This is a small step toward source manipulation and eventually writing lexer-like
  programs in Borth.

## Milestone 15: String Inspection

Goal:

```text
"hello" str-len print
"hello" 1 3 str-slice print
"hello" "l" 3 str-index-of print
```

should print:

```text
5
ell
3
```

String inspection decision:

- `str-len`, `str-slice`, and `str-index-of` are VM primitives because strings
  are still opaque runtime values.
- String indexes are zero-based.
- `str-slice ( string start length -- string )` throws when the requested range
  is outside the string.
- `str-index-of ( string needle start -- index )` returns `-1` when `needle` is
  not found.
- These words are the next step toward lexer-like programs without introducing
  arrays or token data structures yet.

## Milestone 15a: Arrays

Goal:

```text
array-new "integer" array-push 123 array-push show print
```

should print:

```text
["integer" 123]
```

Array decision:

- Arrays are runtime values constructed with words, not source literals.
- Initial array words are `array-new`, `array-push`, `array-len`, and
  `array-get`.
- `array-push ( array A -- array )` returns a new array value rather than
  mutating the input array. This keeps aliases through variables predictable.
- `array-get` uses zero-based indexes and throws when the requested index is
  outside the array.
- Arrays are intended as the first high-level container for token lists and
  simple token records.

## Milestone 15b: Fatal Errors

Goal:

```text
"boom" panic
```

should stop the current run with the error message `boom`.

Fatal error decision:

- `panic ( string -- never )` is a VM primitive because only the VM can halt the
  current instruction stream immediately.
- `panic` consumes a string message and throws it as the runtime error.
- Later explicit result values may be useful, but compiler-style failures are
  fatal for now. This keeps early compiler library words from returning magic
  sentinel values or accidentally continuing with a broken stack shape.

## Milestone 16: Pre-Test Loops

Goal:

```text
0

loop
  dup 5 <
while
  dup print
  1 +
repeat

drop
```

should print `0` through `4`.

Pre-test loop decision:

- `loop ... until` remains the post-condition loop form. It runs the body at
  least once and exits when `until` consumes a non-zero flag.
- `loop ... while ... repeat` is the pre-condition loop form. The words between
  `loop` and `while` compute a numeric flag before each body run.
- `while` consumes the flag. It exits when the flag is `0`.
- `repeat` jumps back to the matching `loop`.
- `while` and `repeat` compile to existing `JUMP_IF_FALSE` and `JUMP`
  instructions; no VM opcode is needed.
- This shape keeps the condition as ordinary stack code before the control word
  that consumes it.

## Milestone 17: Module Imports

Goal:

```text
import "lexer-lib.borth"

"10 20 +" lex-src
```

should make words from `lexer-lib.borth` available to the importing file.

Import decision:

- `import` is top-level syntax followed by a string path.
- Imported paths are resolved relative to the importing file.
- Imports are transitive. If `a.borth` imports `b.borth`, importing `a.borth`
  also makes `b.borth`'s definitions available.
- Importing the same file more than once is ignored after the first successful
  import.
- Import cycles throw.
- Imported modules compile into the same global compiler state as the entry
  program. There is no separate bytecode object or linker yet.
- Imported modules can contain imports, variable declarations, and word
  definitions.
- Imported modules cannot contain loose top-level executable code. This keeps
  library code from running just because it was imported.
- Reusable Borth modules live under `lib/` as they emerge from examples. Keep
  these modules free of top-level test code so they remain importable.
- Source files are lexed and parsed independently rather than concatenated into
  one large source string. This preserves a path toward useful file/line/column
  error reporting.
- No VM opcode is needed; imports are a source loading and compiler-session
  feature.

## Milestone 18: First Borth Compiler Library Slice

Goal:

```text
"10 20 +" lex-src parse-tokens compile-nodes .s
```

should leave an inspectable instruction array like:

```text
[[["PUSH" 10] ["PUSH" 20] ["ADD"] ["HALT"]]]
```

Compiler library decision:

- `lib/lexer.borth` turns a source string into an array of token strings.
- `lib/parser.borth` turns token strings into simple node arrays such as
  `["integer" 10]`, `["string" "hello"]`, and `["word" "+"]`.
- `lib/compiler.borth` turns parser nodes into instruction arrays.
- String literal parsing currently strips surrounding quotes but does not yet
  process escape sequences.
- A single node compiles to an array of instructions, even when it currently
  emits only one instruction. This keeps the contract ready for future words
  that expand into zero, one, or many instructions.
- The current instruction format is intentionally inspectable data, not a final
  bytecode format. Use "instructions" for this Borth-level representation.
- Compiler failures use `panic` for now so invalid input stops immediately
  instead of continuing with a broken stack shape.
- `array-append` lives in `lib/array.borth` because more than one Borth library
  now needs small array-manipulation helpers.

## Milestone 19: First Borth VM Library Slice

Goal:

```text
"10 20 +" lex-src parse-tokens compile-nodes run-bytecode
```

should run through Borth library code for:

```text
source string -> token strings -> node arrays -> instruction arrays -> VM stack
```

and produce:

```text
[30]
```

VM library decision:

- `lib/vm.borth` is a tiny interpreter for the inspectable instruction arrays
  produced by `lib/compiler.borth`.
- The VM state is threaded as `instructions ip stack`.
- Current instruction support covers straight-line primitives, including
  literal `PUSH`, arithmetic, comparisons, stack operations, string operations,
  array operations, `PRINT`, `PRINT_STACK`, `SHOW`, `PANIC`, and `HALT`.
- The Borth VM implementations of `STR_LEN`, `STR_CAT`, `STR_SLICE`,
  `STR_INDEX_OF`, `ARRAY_NEW`, `ARRAY_PUSH`, `ARRAY_LEN`, and `ARRAY_GET`
  delegate to the existing outer Borth words. This keeps the interpreter slice
  small while preserving the same runtime behavior as normal source programs.
- The Borth VM handlers validate VM stack depth before delegation. Type checks,
  index checks, and string range checks still belong to the primitive words
  being called.
- `run-bytecode ( instructions -- stack )` returns the interpreted VM value
  stack rather than printing trace output.

Array helper decision:

- `array-pop` lives in `lib/array.borth` as ordinary Borth code.
- It rebuilds the array prefix and is intentionally O(n).
- Do not promote it to a TypeScript VM primitive until the inefficiency blocks
  the next small language milestone.

## Near-Term Roadmap: Toward a Borth Compiler

The long-term goal is still a compiler written in Borth. The next milestones
should be small programs that force only one or two new language features at a
time.

### Example-Driven Feature Ladder

This is a rough order for expanding the Borth-written compiler. Each step names
the next useful language feature and the smallest existing example it should
make possible through the Borth compiler/VM path.

| Step | Feature pressure | Example unlocked | Notes |
| --- | --- | --- | --- |
| 1 | More straight-line primitives | `add.borth`, `stack-debug.borth` | Compile and execute `print`, `.s`, stack words, and basic arithmetic beyond `+`. |
| 2 | String literals | `hello.borth` | Parse and compile string nodes, then support `PUSH` of strings in the Borth VM. |
| 3 | User-defined words | `square.borth` | Add definitions, `CALL`, `RET`, and a Borth compiler dictionary. |
| 4 | Imports of definition-only modules | `math-lib.borth`, `import-math.borth` | Decide how a Borth compiler session loads and shares module definitions. |
| 5 | Basic conditionals | `if.borth` | Compile `if/end` using `JUMP_IF_FALSE` placeholders. |
| 6 | Else branches | `else.borth` | Add `JUMP` and patch both false-branch and after-branch targets. |
| 7 | Recursion | `fact.borth` | Register word names before compiling bodies so self-calls can resolve. |
| 8 | Host input primitives | `double-input.borth`, `echo.borth` | Decide how the Borth VM crosses the host IO boundary. |
| 9 | Loop control flow | `while-count.borth` | Compile `loop/while/repeat`; later add `loop/until`. |
| 10 | Variable cells | `counter.borth` | Add address values, global memory cells, `@`, and `!`. |
| 11 | String operations | `introduce.borth` | Compile and execute string concatenation plus stack reshaping. |
| 12 | Larger recursive programs | `fib.borth`, `fizzbuzz.borth` | Exercise nested branches, multiple definitions, `mod`, and deeper stack effects. |
| 13 | Entropy and interactive loops | `random-print.borth`, `guess.borth` | Add `random` once host effects and loop state are already understood. |
| 14 | Compiler-oriented strings and arrays | `lexer.borth`, `parse-token.borth`, `str-to-int.borth` | Support the data manipulation needed for the compiler to grow itself. |
| 15 | Full current self-hosting slice | `borth-compiler.borth` | Keep extending the Borth compiler/VM until this example covers more of the language. |

The order is allowed to change when an earlier feature turns out to need a
smaller supporting feature first.

### Proposed Milestone: Broaden Primitive Compilation

Extend `compile-word` beyond `"+"` to a small table of ordinary VM words:
arithmetic, stack operations, `print`, and `.s`.

Likely language work:

- Use nested `if` briefly if the list stays tiny.
- Add `case` / `match` compiler syntax once word dispatch becomes repetitive
  enough that it hides the compiler logic.

### Proposed Milestone: Control-Flow Compilation

Add Borth compiler support for `if`, `else`, `end`, and later loops.

Likely language work:

- Introduce placeholders and patching for jump targets.
- This may force array update/replace helpers, because existing arrays can only
  append and read.

### Roadmap Bias

- Prefer changing stack effects and factoring words before adding deep stack
  access.
- Prefer recomputing cheap pure values over preserving many intermediates on
  the stack.
- Add VM primitives only when Borth cannot inspect or construct the value
  directly.
