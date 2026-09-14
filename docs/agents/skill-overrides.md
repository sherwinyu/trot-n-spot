# Skill Overrides

The skills listed in `skills-lock.json` are vendored from `mattpocock/skills`;
updates can overwrite local edits. The other skills are repository-owned ports
from Oryoki; see `skills-port.md` for provenance and adaptations. `.claude/skills/*` are
symlinks to the same directories, so a skill loaded from either path is the same file and
this policy applies to it. Repo policy that differs from a vendored skill is recorded
here instead, and supersedes the skill's own instruction where the two disagree.

## Grilling cadence

**Supersedes the round behavior of the `grilling` skill** (and `grill-me` /
`grill-with-docs`, which call it). The skill asks the whole frontier in one numbered
round; in this repo:

- Ask **exactly one question at a time**, always. No channel detection, no batching
  when the frontier is wide.
- Every question carries a recommendation strong enough to accept in one word.
- Wait for the answer, recompute the frontier, ask the next single question.

The rest of `grilling` stands: the design tree, frontier recomputation, finding facts
yourself rather than asking, and stopping only when the frontier is empty.

Rationale: an answer usually reshapes the questions behind it, so a batched round
spends the user's attention on questions that are about to change. The metric is cost
per answer, not questions per round.

## Project state

Skills that record progress — `wayfinder`, `to-tickets`, `implement`, `code-review` —
use the state mechanics in [`project-state.md`](./project-state.md): append-only
checkpoint comments on the Linear parent issue, `D<n>` decisions, claim comment plus
`In Progress` before implementing, and an `## Evidence` comment per PR round. Where a
vendored skill writes local ticket or plan files instead, Linear wins. To write or read
that state directly, use the repo-local `checkpoint` and `resume` skills rather than
re-deriving the formats; `handoff` is unrelated — conversation context in a temp file,
not initiative state.

Ownership is the claim comment, not the assignee field: `wayfinder` treats an
unassigned ticket as available and assignment as claiming, so read claims instead when
computing the frontier. Assignee stays a human-facing field with no workflow meaning.


## Repository and runtime adaptation

- `AGENTS.md`, `CLAUDE.md`, and `docs/testing.md` define this app's npm/Expo/Jest
  commands. Other package-manager commands in generic examples are illustrative.
- Keep the installed Linear configuration when using setup; do not replace it
  with the GitHub/GitLab/local templates unless changing trackers is requested.
- For PR discovery in `resume` and `checkpoint`, use explicit Linear/PR links
  first, then `<runtime>/<issue-key>-<slug>` branches. The source skills' `devin/`
  examples apply to every runtime, including `codex/`, `claude/`, and `cursor/`.
  Read PRs from the initiative's repository, with pagination; connector tools can
  replace `gh` when the CLI is unavailable. See `issue-tracker.md`.
- Cross-project resume is read-only and uses each project's own repository for
  PR and staleness checks. It does not authorize dispatching unrelated work.
- For a standalone issue with no parent, `checkpoint` writes to that issue.
- Browser screenshots cover web changes; native UI changes use emulator/device
  screenshots. Follow the existing testing guide rather than an editor-specific
  Playwright fixture from a historical example.
