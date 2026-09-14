# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files do not exist, proceed silently. Do not flag their
absence or suggest creating them upfront. The `/domain-modeling` skill creates
them lazily when terms or decisions are resolved.

## File structure

This repo uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal,
hypothesis, or test name, use the term as defined in `CONTEXT.md`. Do not
drift to synonyms the glossary explicitly avoids.

If the concept you need is not in the glossary, reconsider whether you are
inventing project language or note it as a real gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than
silently overriding it:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
