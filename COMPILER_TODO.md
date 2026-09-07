# Compiler TODOs

Living tracker for picking the next small compiler or self-hosting task.

Status labels:

- `Quick win`: narrow, low-risk cleanup or parity fix.
- `Doable now`: implementable with the current language and library shape, but
  needs a little more care.
- `Needs extra state/work`: likely needs a state-shape change, helper library
  growth, or a more deliberate design step.
- `Blocked / wait`: not worth forcing until the surrounding system grows.

## Suggested Next Order

1. Add unresolved deferred-word validation to the Borth compiler.
2. Add import tracking and cycle detection.
3. Centralize compiler namespace validation.
4. Improve source-aware compiler errors.

## Compiler Parity Gaps

These are differences between the TypeScript bootstrap compiler/runtime path and
the Borth-written compiler/VM path.

### Quick Win

- Check unresolved deferred words before `compile-nodes` returns. The
  TypeScript compiler fails with `deferred word never defined: name`; the Borth
  compiler records and patches deferred call sites, but does not yet do the
  final unresolved-deferred validation pass.

### Doable Now

- Centralize name validation so words, variables, deferred words, built-in
  words, and reserved syntax all share one collision rule.

### Needs Extra State/Work

- Suppress duplicate imports. The TypeScript runner tracks loaded modules by
  normalized absolute path; the Borth compiler does not yet carry an imported
  module set.
- Detect import cycles. This probably wants a second `loadingModules` style set
  in compiler state so cycles can be reported before recursive import blows up.
- Decide how prelude loading should work in the self-hosted path. The
  TypeScript runner automatically loads `prelude.borth`; raw Borth
  `compile-nodes` starts from an empty inner compiler dictionary plus hardcoded
  primitive names.
- Improve source-aware compiler errors. Borth compiler state has file path and
  node index, but most panics still report generic messages.

### Blocked / Wait

- Full "compile normal source exactly like `yarn borth`" parity probably wants
  a Borth-side runner/session abstraction, not just `compile-nodes`.
- Carriage-return lexing is small, but awkward to do cleanly until string
  escape and character handling are a little more settled.

## Explicit TODOs In Code

These are TODO comments that already exist in the codebase.

### Quick Win

- Replace stale top-level-code helper wording around
  `assert-top-level-code-allowed` now that imports compile real module files.
- Validate that `variable` has a following word node before reading it.
- Validate `panic`'s operand in `lib/vm.borth`, or remove the TODO if delegating
  to the outer `panic` primitive is considered enough for this VM slice.
- Refresh the stale roadmap section at the end of `SPEC.md`; several
  "proposed" milestones are now implemented.

### Doable Now

- Add reserved/built-in namespace checks across `record-word-name`,
  `declare-deferred-word`, `define-variable`, `compile-define`, and
  `compile-deferred`.
- Report more specific unclosed-block errors at end of source or module
  compilation by inspecting the top open block before panicking.
- Add string escape handling to the Borth lexer/parser so it matches the
  TypeScript lexer more closely.

### Needs Extra State/Work

- Add imported/being-imported module maps to compiler state and thread them
  through `module-compiler-new`.
- Add map iteration or map-values helpers so deferred-finalization and import
  bookkeeping can inspect maps cleanly.

### Blocked / Wait

- Revisit which path helpers can move from host primitives into Borth once
  module loading has stabilized.
- Replace the byte-at-a-time stdin loop in `src/main.ts` only once input grows
  past the tiny bootstrap needs.

## Notes

- "Compiler parity" and "end-to-end parity" are slightly different. The Borth
  compiler and Borth VM may gain support separately, so new instruction
  mappings should be tested both as compiler output and as VM behavior.
- Imported module behavior is intentionally stricter than entry-program
  behavior: modules can declare imports, variables, and words, but cannot run
  loose top-level executable code.
- Deferred declarations should stay module-local for now. Letting a parent
  module declare a deferred word and expecting an imported child to satisfy or call it
  creates coupling that is not useful yet.
