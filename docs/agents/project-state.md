# Project State

Where the state of a multi-session initiative lives, and the exact shape of every
comment that carries it. This file is the single source of truth for the checkpoint,
claim and evidence formats; other docs link here rather than restating them.

The tracker and its tool calls are in [`issue-tracker.md`](./issue-tracker.md).

## Signal budget

An issue carries a few durable writes: its fields (state, labels, assignee), its
`## Claim`, its `## Log` thread, and — on a parent — its `## Checkpoint`s.
Everything else about the work lives where a reader already looks: progress and
scoping in the session transcript, discussion and decisions in the `## Log`
thread, implementation review and verification on the pull request. The PR is
the implementing agent's surface; the issue is the human's. An issue is not a
log of the session that ran it; a stand-alone issue posts no checkpoints,
because the issue itself is the state.

The canonical blocks are append-only, and so is everything that carries the task:
briefs, answers, specs, anything a human wrote. Ephemera is only transient agent
noise — mirrored session chatter, superseded progress notes, the second copy of a
double-post — and is delete-on-sight, so that scrolling to the bottom of an issue
reaches something current. A reader trusts three things: the issue's fields, the newest
`## Checkpoint`, and the open PR. Nothing older is current and nothing older needs
diffing.

## The initiative issue

One Linear parent issue per initiative. Child issues hang off it via `parentId`,
ordering is expressed with native `blockedBy` / `blocks` edges.

The parent description may carry a human-scannable header — current phase, links,
whatever a person wants to read on a phone. It is sugar: no skill parses it and no
decision depends on it. State that matters goes in comments.

## Checkpoints

Comments on the parent issue are **append-only**. A checkpoint records what changed
since the last one and what the next reader should look at. Never edit a prior
checkpoint; publish a new one that supersedes it. Two adjacent checkpoints with
identical bodies are one checkpoint posted twice — read them as one, and delete the
second copy when it carries no replies; a duplicate with a `## Decisions` or other
reply thread keeps its thread.

```
## Checkpoint <ISO date> · <runtime>
Phase: shaping | ticketing | executing | verifying
Since last: <what changed, including merged PRs>
Settled: D<n> — <one line> (link)
Frontier: <ticket ids>
Blocked on human: <the single next decision> | none
Inspect next: <PR / evidence links>
```

`<runtime>` is the agent that wrote it, plus the skill in parentheses when one drove
the session: `devin (to-tickets)`, `claude-code-web (grilling)`, `codex`.

A checkpoint is **scanned**, in about ten seconds on a phone, so it is one line per
field and eight lines in total. Each line names the thing and links it; the issue, PR
or ADR that owns the detail carries the detail. A field that wants a paragraph — why a
decision went the way it did, what got deferred, what a ticket already says — has
outgrown the format: write it where it belongs, and link that from the line. A
checkpoint that has to be read has already failed.

`Blocked on human:` names the decision and cites the issue that carries it —
`SHE-nn` — whenever one does, so a reader can check the line against that issue's
labels instead of guessing which issue it meant.

`Phase:` is read off the child issues, not off ambition:

| Phase | Child states |
| --- | --- |
| `shaping` | no children yet, or every child is a `wayfinder:*` decision issue |
| `ticketing` | children exist and any is unlabelled or `needs-triage` |
| `executing` | at least one child `In Progress`, or a `ready-for-agent` frontier |
| `verifying` | every remaining child is `In Review`, or the only open work is a PR awaiting verification |

The newest checkpoint is a claim about the world, not the world. A reader diffs it
against the Linear issue states, the open PRs and `main`, and reports every
disagreement it finds instead of believing the comment.

## The log thread

Discussion that belongs on the issue — wayfinding, architectural debate,
technical planning, and the decisions that settle them — lives in one thread: a
single top-level `## Log` comment, created the first time the issue has
something worth keeping, with every entry a **threaded reply written as a
collapsed section**:

```
+++ <YYYY-MM-DD> — <topic, one line>
<the argument, the answer, the link that owns the detail>
+++
```

`+++` is Linear's native collapsible markdown — `<details>` renders as literal
text. Collapsed, the thread reads as a dated table of contents; one entry is one
self-contained note that links the issue, PR or ADR owning the detail.

What does not go here: implementation-level code review (the PR's review
threads — the PR is the implementing agent's surface), verification (the PR's
`## Evidence` comment), and the structured fields (claim, checkpoint, labels).

## Decisions

Settled decisions are numbered `D1..Dn` per initiative, logged as `+++` entries
in the issue's `## Log` thread — titled `D<n> — <the decision in one line>
(<link>)`, with the human's answer quoted verbatim in the body — and cited in
the `Settled:` line of the checkpoint that settled them. The number is the
durable handle: later tickets and comments cite `D4`, not a paraphrase. Numbers
are never reused, so the next free number is the maximum `D<n>` over the
parent's `## Log` thread **and** every checkpoint on the parent issue —
checkpoints with no `Settled:` line are common, so neither source alone gives
it.

A decision that constrains code graduates out of the log:

- hard to reverse → an ADR in `docs/adr/`;
- vocabulary the codebase should use → root `CONTEXT.md` (see
  [`domain.md`](./domain.md)).

Decisions about how the workflow runs stay in the log thread. A later decision
may revise an earlier one; it says which `D<n>` it revises and why.

## Frontier and queues

- **Frontier** = child issues labelled `ready-for-agent`, with no unresolved
  `blockedBy` edge, and unclaimed. These are the only issues worth dispatching.
- **Human queue** = issues labelled `ready-for-human`, cross-project,
  priority-ordered. Whatever an agent cannot finish lands here with the single next
  decision stated.

Label meanings are in [`triage-labels.md`](./triage-labels.md).

## Claims

Before touching code for an issue, post a claim comment on that issue and move it to
`In Progress`:

```
## Claim · <runtime> · <session URL> · base <sha>
```

`<sha>` is the `main` commit the work starts from. Dispatch follows the user's authorization; the claim is not a lock — it answers which runtime and session owns the issue, and from
what base, after an interruption.

## Evidence

Evidence is a review artifact, so it lives on the pull request and nowhere else —
one `## Evidence` comment per PR round:

```
## Evidence · base <sha>
Tests: <command + result>
Screenshots: <links, one per UI-visible change> | none
Residual risk: <what is still unverified> | none
```

Rules:

- Test output is mandatory: the command run and its result, not a claim that it passed.
- Any UI-visible change carries browser screenshots or native/device screenshots, as
  appropriate to the changed surface — attached to the comment, never committed to
  the repository — and the PR description itself embeds a preview image (or
  GIF/recording for animations and interactions) so reviewers see the result without
  opening the app. The capture recipe is in [`../testing.md`](../testing.md). A
  GitHub comment image lives as long as the PR that hosts it; a committed PNG is
  repo weight forever.
- Video is optional and welcome; for animated or gesture-driven changes a GIF/recording is expected.
- The issue gets the PR link and a status change, not a copy of the comment —
  the session transcript already holds the full run. Review of the diff stays in
  the PR's own threads as well; the PR is the implementing agent's surface, the
  `## Log` thread is the human's.
- Workflow comments start with their own heading — `## Checkpoint`, `## Claim`,
  `## Evidence` — with no preamble. The AI-authorship prefix that `issue-tracker.md`
  requires applies to triage comments only; readers match on the leading heading.
- Verification often happens on a laptop, so richer evidence beats minimal evidence.
- A runtime that cannot post images or reach GitHub records the evidence and the
  access limitation for an available authorized runtime to publish. Do not claim
  publication or dispatch occurred without a confirmed result; name the runtime
  that performed the work.

## Staleness

Claims and evidence both record the base `main` SHA. Anything built on a base that is
behind current `main` is flagged, not trusted:

```bash
git fetch origin main
git merge-base --is-ancestor <base-sha> origin/main   # 0 = base is an ancestor
git log --oneline <base-sha>..origin/main -- <paths the work touches>
```

An ancestor base with no intervening commits on the touched paths is current. Anything
else is reported as stale, with the commits that moved underneath it.
