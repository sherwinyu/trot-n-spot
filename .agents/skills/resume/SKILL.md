---
name: resume
description: Report what needs the human now, across every active initiative — the newest checkpoint diffed against Linear, open PRs and `main`. Use when returning after a gap, asking what to do next, or deciding what to dispatch.
argument-hint: "short | long"
disable-model-invocation: true
---

# Resume

Reconstruct where the work stands from durable artifacts alone, and name the single
next human action. Cross-project by default: the question is "across everything, what
needs me now", so start from the live issues and let them tell you which initiatives
are active. Working inside one initiative that you have already named is
[`wayfinder`](../wayfinder/SKILL.md)'s job, not this skill's.

The state mechanics — what a checkpoint, claim and evidence comment look like, and how
staleness is measured — are in `docs/agents/project-state.md`. The Linear call behind
each read below is a row of the operation table in `docs/agents/issue-tracker.md`;
paths are from the repo root, since this file is also reachable through
`.claude/skills/resume/`.

**Report and stop.** This skill reads. It writes no comment, changes no issue state,
edits no code, and continues no plan it finds mid-flight — including a plan that looks
one step from done. Whoever reads the report decides what happens next.

## Modes

`short` is the default: the single next human action and nothing else, sized for a
phone screen — at most five lines, no headings, no preamble. Name the action, the
issue or PR it lands on, and one clause of why now.

`long` adds, in this order: goal, what changed since the last checkpoint, claims and
open PRs with their staleness, contradictions found, the single next human action, and
what agents can proceed with unattended. One initiative per block; still terse.

Both modes name **exactly one** next human action across all initiatives. Choose it in
this order, stopping at the first that applies:

1. a contradiction that would make a dispatch wrong — a claim on an issue whose PR
   already merged, a `ready-for-agent` issue whose blocker is `Done` or `Canceled` but
   whose `blockedBy` edge was never resolved, an empty frontier while the phase says
   `executing`. A `ready-for-agent` issue behind an *open* blocker is the intended
   output of ticketing, not a contradiction;
2. the highest-priority `ready-for-human` issue, oldest first within a priority;
3. the `Blocked on human:` line of the newest checkpoint of the most recently updated
   initiative;
4. otherwise: nothing needs the human, and the frontier is what agents can take.

## Process

### 1. Fix the reference point

```bash
git fetch origin main && git rev-parse --short origin/main
```

Every staleness statement in the report is relative to this SHA, and the report quotes
it. Without a checkout, say so in the report and mark every base SHA unverified rather
than dropping the check.

### 2. Find the active initiatives

Do not guess which parent issues are live. Derive them with the "Read the active
initiatives" row of `issue-tracker.md` — one call per label and per live state, unioned
client-side — and collect the distinct `parentId`s. Those parents are the active
initiatives. A live issue with no parent stays in the report as its own single-issue
initiative, which is how a parentless `ready-for-human` bug still reaches precedence
rule 2. An initiative with no live child is finished or dormant, and stays out.

### 3. Read the newest checkpoint per initiative

Of the top-level comments whose body starts `## Checkpoint`, the one with the greatest
`createdAt` — by timestamp, not by position, because the listing carries no documented
sort argument and reading the wrong end silently reports the *oldest* checkpoint as
current. Adjacent identical bodies are one checkpoint posted twice. An initiative with
no checkpoint is reported as unshaped, not as an error.

### 4. Gather reality

Independently of what the checkpoint says:

- child issue states, labels, `blockedBy` edges, and which children carry a `## Claim`
  comment;
- open PRs: `gh pr list --limit 100 --json number,title,headRefName,isDraft,updatedAt,statusCheckRollup`.
  `--limit` is not optional: the default is 30 and the truncation is silent. A PR
  belongs to an initiative when its `headRefName` starts `devin/<child issue key>-`;
- for every claim and every `## Evidence` comment, its base SHA measured against
  `origin/main` with the staleness recipe in `project-state.md`.

### 5. Diff and report the disagreements

The checkpoint is a claim about the world. Compare it line by line against what step 4
found and report every disagreement, naming both sides:

| Checkpoint says | Reality | Report as |
| --- | --- | --- |
| `Frontier:` lists an issue | issue is `Done`, claimed, or blocked | frontier drifted |
| `Blocked on human:` cites an issue | that issue is not labelled `ready-for-human` | queue drifted |
| `Inspect next:` names a PR | PR merged, closed, or checks red | evidence drifted |
| nothing about a PR | an open PR references an issue of this initiative | untracked work |
| a phase | the child states map to a different phase in `project-state.md` | phase drifted |

Staleness is path-scoped, per the recipe in `project-state.md`: a base that is an
ancestor of `origin/main` with no intervening commits on the paths the work touches is
current, however far behind it looks. Anything else is reported with the commits that
moved underneath it, and described as unverified rather than broken.

Whether a claimed session is still running is not decidable from the artifacts. Report
what the claim records — runtime, session URL, age, and the last commit on its branch —
and state that liveness is unknown. Devin sessions are the exception: their status can
be inspected, so check it when the claim names one.

Done when exactly one next human action is named. In `long`, additionally, every active
initiative has either a diff line or an explicit "checkpoint matches reality"; `short`
reports the action alone and keeps the diff to itself.
