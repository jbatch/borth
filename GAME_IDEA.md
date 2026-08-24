# Borth Game Idea

## Working Premise

Borth may have a game inside it.

Writing Borth already feels a little like solving assembly puzzles: given a
stack effect such as:

```text
( A B -- A )
```

the player asks:

```text
What body transforms the stack into that shape?
```

For example:

```text
drop
```

The broader game idea is to turn the journey of bootstrapping a programming
language into a sequence of small, concrete puzzles. The player starts with
almost nothing, solves stack-transformation problems, earns new words, builds a
standard library, and eventually assembles enough tooling to write something
large: a game, a compiler, or a self-hosting subset of Borth.

## Core Loop

Each puzzle gives the player:

- a target stack effect
- a limited set of available words
- one or more example tests
- an optional goal such as shorter code, fewer primitives, or clearer factoring

The player writes a Borth word that satisfies the tests.

For example:

```text
Goal:
  Define nip

Stack effect:
  ( A B -- B )

Allowed words:
  drop dup swap over

One possible solution:
  swap drop
```

After solving a puzzle, that word can become part of the player's toolbox for
later puzzles.

## Progression

The campaign should mirror the actual language-building journey:

```text
stack shuffling
-> arithmetic
-> named words
-> conditionals
-> loops
-> variables
-> strings
-> token scanning
-> lexer
-> parser
-> compiler
-> self-hosting
```

This makes the unlock tree meaningful. The player is not collecting arbitrary
abilities; they are earning the pieces needed to build a language from first
principles.

## Puzzle Scale

Early puzzles should be tiny and local:

```text
2dup  ( A B -- A B A B )
tuck  ( A B -- B A B )
nip   ( A B -- B )
not   ( flag -- flag )
```

Middle puzzles should introduce control flow and state:

```text
count-to-five
max
abs
factorial
random-between
```

Later puzzles should become language-tooling tasks:

```text
skip-spaces
next-token
classify-token
lex-print
parse-token
compile-word
```

The late game is compelling because the puzzles stop being artificial. They are
pieces of a real compiler pipeline.

## Design Principles

- Keep the first playable slice extremely small.
- Make the stack visible at every step.
- Prefer puzzles that teach one idea at a time.
- Let solved words become real tools, not just badges.
- Keep VM primitives rare and meaningful.
- Make the distinction between primitive, prelude word, and user word part of
  the game.
- Reward factoring and readability, not only shortest solutions.
- Use tests as the puzzle contract.

## Possible Modes

### Stack Puzzle Mode

Small isolated challenges based on stack effects.

This is the easiest place to start because it needs only the existing language,
test harness, and stack inspection.

### Prelude Builder

The player builds up a reusable prelude. Each solved word becomes available in
future levels.

This mode maps directly onto the real `prelude.borth` idea.

### Bootstrap Campaign

A longer campaign where every chapter builds toward a working compiler.

Possible chapter arc:

```text
Chapter 1: Shape the Stack
Chapter 2: Name Reusable Words
Chapter 3: Choose and Repeat
Chapter 4: Hold State
Chapter 5: Inspect Text
Chapter 6: Split Source Into Tokens
Chapter 7: Parse Structure
Chapter 8: Emit Bytecode
Chapter 9: Compile Yourself
```

### Constraint Challenges

Optional variants of the same puzzle:

```text
Solve without rot.
Solve using only three words.
Solve without adding a VM primitive.
Make the stack effect easier to read by factoring a helper.
```

These could teach the design tradeoff that already exists in the project:

```text
Should this be a VM primitive, a prelude word, or just user code?
```

## First Playable Slice

A realistic first slice could be:

1. Load a puzzle definition from a simple data file.
2. Show the target stack effect and allowed words.
3. Let the player submit a Borth definition.
4. Run hidden and visible test cases.
5. Show stack traces for failures.
6. Unlock the solved word for the next puzzle.

The first slice should not need graphics, animation, persistence, scoring, or a
large puzzle catalog. The important thing is proving that stack-effect puzzles
feel good and that the unlock loop works.

## Open Questions

- Is the game mostly an educational puzzle game, or a narrative campaign about
  bootstrapping?
- Should there be one canonical solution per puzzle, or should many solutions
  pass the same tests?
- How should readability be judged, if at all?
- Should the player be allowed to invent helper words inside a puzzle?
- When a puzzle seems painful, is that a clue to add a prelude word or a VM
  primitive?
- Does the game live inside this repository as a mode/tool, or start as a design
  track alongside the language?

## Current Bias

Do not build the game yet.

For now, keep this as a sideline design note while Borth continues evolving.
The useful next step is to notice when normal language milestones also make good
puzzles, then capture those puzzle shapes as they appear.
