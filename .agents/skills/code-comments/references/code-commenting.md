# TypeScript Code Commenting Standard

This document defines the required commenting standard.

This project is intentionally complex and must be implemented for long-term
maintainability, not just correctness. The plan assumes humans will need to
read, review, debug, and extend this code later.

## Purpose

Comments in this repository exist to preserve intent, ownership, and behavioral
context that would otherwise be expensive to reconstruct from dense systems
code. They are part of the implementation quality bar, not optional cleanup.

Comments must explain behavior and intent, not language syntax. They also must
not rely on implementation-rollout context to make sense.

## Required Standard

Every code change should leave the surrounding code easier to understand for a
future engineer who did not participate in the original implementation.

Required commenting standard:

- every file must begin with a module-level JSDoc block comment, describing the
  file's purpose and the logical role of the code in that file
- every non-trivial function must include a summary comment describing:
  - why the function exists
  - what responsibility it owns
  - what result or side effect it produces
- every logical operation block inside dense code must include a short
  single-line comment explaining what the operation is doing
- every class, interface, type alias, enum, and object type with architectural
  meaning must provide an explanation of why it exists, and a summary of what it
  does if that is not already obvious from its name and fields

## Language-Specific Form

Use TypeScript's documentation-comment style so the most important module and
API comments can surface in generated documentation.

TypeScript:

- use `/** ... */` at the top of a file for the module-level doc comment
- use `/** ... */` for exported functions, classes, interfaces, type aliases,
  enums, and constants when the comment should be attached to the item
- use `//` for short comments inside dense implementation blocks
- use JSDoc tags such as `@param`, `@returns`, and `@throws` only when they add
  information that is not already clear from the type signature or function name

## What Good Comments Cover

A good comment explains information that the reader cannot recover cheaply by
looking at the syntax alone.

That usually means the comment should explain one or more of these:

- the invariant a block is trying to preserve
- the reason a function or type exists in the architecture
- the ownership boundary or responsibility of a function, class, interface, or
  type alias
- the meaning of a heuristic, fallback, or edge-case branch
- the result, side effect, or contract that matters to callers

## What To Avoid

Do not write comments that only narrate the syntax the reader can already see.
Do not write comments that only make sense if someone remembers the rollout plan
or the sequence of implementation phases.

Avoid comments like:

- descriptions of obvious assignments, increments, loops, or field copies
- statements about "this phase", "for now", "later", or "eventually"
- comments that restate a type signature without explaining the purpose
- comments that explain language mechanics instead of repository behavior

## Examples

Good:

```ts
// Walk backward from the mid-function hit until we find a credible function
// start boundary that can serve as the canonical hook RVA.
```

Bad:

```ts
// Increment i by one.
```

Also bad:

```ts
// In this phase we only wire the command surface.
```

```ts
// Later steps will replace this with the real scanner.
```

## Practical Guidance For Agents

When adding or editing code:

- start by adding or updating the module-level doc comment if the file purpose
  has changed
- add function summary comments before non-trivial functions, not as an
  afterthought
- annotate dense control flow at the block level, especially around process
  execution, state transitions, heuristics, error recovery, filesystem writes,
  and signal handling
- document classes, interfaces, type aliases, and object types that carry
  architectural meaning, state coordination, or ownership boundaries
- prefer short, precise comments over long narration, but do not omit intent
  when the code is subtle

If you touch code that lacks required comments, bring it up to this standard as
part of the same change when practical.
