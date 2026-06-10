---
name: commenting
description: Apply the repository's TypeScript code commenting standard when writing or reviewing code. Use when adding new code, refactoring dense logic, improving maintainability, or when the user asks for better comments or clearer code documentation.
---

# Code Commenting

Use this skill when code changes need to meet the repository's commenting
standard.

## Goal

Leave touched code easier for a future engineer to understand without relying
on rollout context or obvious syntax narration.

## Workflow

1. Read [references/code-commenting.md](references/code-commenting.md) before
   making substantial comment edits.
2. Ensure every touched file begins with an accurate top-of-file module comment
   describing the file's purpose and logical role.
3. Add or update summary comments on non-trivial functions, classes,
   interfaces, type aliases, enums, and other architectural items describing why
   they exist, what responsibility they own, and what result or side effect they
   produce.
4. Add short block comments in dense logic where the reader would otherwise
   struggle to recover intent, invariants, heuristics, or side effects.
5. Remove low-value comments that only restate syntax, implementation phases, or
   future rollout plans.

## Rules

- Explain intent, ownership, invariants, heuristics, and side effects.
- Do not narrate assignments, loops, field copies, or language mechanics.
- Do not write comments that depend on phrases like "for now", "later", or
  "in this phase".
- Prefer short, precise comments, but do not skip intent when the code is
  subtle.
- If touched code is below the standard, bring it up to standard as part of the
  same change when practical.

## Language Form

- In TypeScript, use JSDoc block comments (`/** ... */`) for exported APIs,
  architectural declarations, and top-of-file module comments.
- Use `//` comments for short local notes inside dense implementation logic.
- Use JSDoc tags such as `@param`, `@returns`, and `@throws` only when they add
  information that is not already clear from the type signature or function
  name.
- Keep comments close to the code they explain, and update or remove them when
  behavior changes.
