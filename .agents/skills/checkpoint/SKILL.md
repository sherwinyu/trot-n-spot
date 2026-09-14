---
name: checkpoint
description: Persist the resume boundary for an initiative by appending one `## Checkpoint` comment to its Linear parent issue. Use when a session ends, a decision settles, or work is handed off.
argument-hint: "parent issue key, e.g. SHE-63 (optional)"
disable-model-invocation: true
---

# Checkpoint

Write down what a fresh reader needs so this session can be deleted. One comment, one
session; the next `resume` starts from it.

The format is defined in `docs/agents/project-state.md` and the Linear calls are rows
of the operation table in `docs/agents/issue-tracker.md` (paths from the repo root:
this file is also reachable through `.claude/skills/checkpoint/`). Follow the block
there exactly, including the first line, which is how every reader finds it.

This is the durable state of an initiative, which is what makes it different from
[`handoff`](../handoff/SKILL.md): `handoff` writes throwaway conversation context to a
temp file for the next agent, a checkpoint writes the initiative's public boundary to
Linear for the next human. Ending a session on real work wants this one.

**Append, never edit.** A prior checkpoint is history: a new one supersedes it, and
correcting an earlier claim means saying so in the new body. Post the comment with no
`id`, so Linear can only create.

**No new documents.** Everything durable goes into an artifact that already exists —
the Linear issue, an ADR, `CONTEXT.md`, a doc under `docs/` — and the checkpoint links
it. A fresh file per session is the sediment this workflow exists to avoid.

## Process

### 1. Identify the initiative

The parent issue, from the argument if given, otherwise the `parentId` of the issue
this session worked on. When neither resolves it, ask once, naming the candidate you
would pick.

### 2. Read the newest checkpoint

`Since last:` is a diff, so it needs its other side: the newest top-level `##
Checkpoint` comment, by `createdAt` rather than by position in the listing.

While that comment list is in hand, scan **every** checkpoint on the issue for `D<n>`
and take the maximum — the newest checkpoint often has no `Settled:` line at all, and
numbering from it would reuse a number that later tickets already cite.

### 3. Gather what changed from reality, not memory

- merged and open PRs for this initiative's issues: `gh pr list --state all --limit 100
  --json number,title,mergedAt,headRefName`, keeping branches that start
  `devin/<child issue key>-`. `--limit` is not optional — the default of 30 rows of
  all-states history silently drops the early PRs of an initiative, and the loss lands
  in `Since last:` as an absence;
- child issues whose state or labels moved since that checkpoint;
- `main`, windowed by the previous checkpoint's `createdAt`, since the checkpoint block
  carries no base SHA of its own:
  `git fetch origin main && git log --oneline --since <previous checkpoint createdAt> origin/main`.

A session remembers what it did, not what happened around it. Anything not verified
here is left out.

### 4. Write the block

Eight lines, one per field. The checkpoint is scanned, not read (see
`project-state.md`), so each line names its thing and links it, and detail lives in the
issue, PR or ADR that owns it. Write the whole thing, then cut every clause that
restates what a linked artifact already says.

- `Phase:` read off the child states with the phase mapping in `project-state.md`, not
  chosen from ambition.
- `Since last:` what moved, including merged PRs by number.
- `Settled:` one line per decision that became final in this session, numbered from the
  next free `D<n>`, each with a link to where it was decided. A decision that revises an
  earlier one says which. No decisions settled means no `Settled:` line — not an empty
  one.
- `Frontier:` the live frontier query's result, not last checkpoint's list.
- `Blocked on human:` exactly one decision, citing the issue that carries it when one
  does, or `none`. Two decisions means picking the one that gates the others.
- `Inspect next:` the PR or evidence links worth a human's attention now.

A decision that constrains code graduates out of the log into the repo — an ADR when it
is hard to reverse, `CONTEXT.md` when it is vocabulary (see `project-state.md`). Do that
graduation in the same session, and link it from the `Settled:` line.

### 5. Append it, then refresh the header

Post the comment on the parent issue. Then, optionally, rewrite the parent
description's human-scannable header to match — it is sugar for a human on a phone,
nothing parses it, and no state may exist only there.

Done when the comment is on the parent issue, fits the eight-line budget with no line
restating a linked artifact, its `Frontier:` line equals the live frontier query, and
its `Blocked on human:` line names one decision or `none`. Report the comment's URL.
