# AGENTS.md

This is a learning project as much as an implementation project.

## Operating Procedure

- Move slowly and deliberately.
- Discuss what we are doing and why before each meaningful implementation step.
- Prefer short replies and ask for more detail instead of writing long, exhaustive explanations.
- Keep milestones small enough that each one teaches one or two clear ideas.
- Do not add language features speculatively.
- Update this file as our working process changes.
- Update `SPEC.md` as the language design and project goals evolve.

## Engineering Style

- Keep the TypeScript bootstrap implementation simple and readable.
- Prefer explicit code over framework-like abstractions.
- Keep lexer, parser, compiler, bytecode, and VM boundaries visible.
- Treat TypeScript as temporary bootstrap infrastructure, not the final center of gravity.
- When adding a VM primitive, explain why it belongs in the VM instead of being written in the language.

## Current Bias

- Build the smallest complete vertical slice first.
- Favor inspectable intermediate forms: tokens, AST, bytecode, stack state.
- Document interesting design decisions when they arise.
