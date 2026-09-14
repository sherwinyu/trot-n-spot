<!-- markdownlint-disable MD013 MD040 -->

# Git Workflow

Prefix commit messages with a categorical tag in square brackets:

| Tag | Scope |
| --- | --- |
| `[Testing]` | Test-related changes |
| `[CI]` | Continuous integration changes |
| `[UI]` | User interface changes |
| `[Debug]` | Debugging tools and utilities |
| `[Dev]` | Developer experience improvements |
| `[Sync]` | Sync/collaboration changes |
| `[Data]` | Data model and database changes |
| `[Server]` | Backend server changes |
| `[Native]` | Expo / native platform changes |
| `[Auth]` | Authentication changes |
| `[Fix]` | Bug fixes |
| `[Refactor]` | Code refactoring |

## One ticket, one branch, one PR

The default for agent work: one Linear issue → one branch cut from current `main` →
one pull request into `main`. Each PR is independently reviewable and independently
mergeable, and carries its own `## Evidence` comment (see
[`agents/project-state.md`](./agents/project-state.md)).

Work that depends on a PR still in review waits and branches from the new `main`
after that PR merges. Stack only when there is a genuine implementation dependency
that makes independent merging impractical — the later change cannot compile, run or
be reviewed without the earlier one. Ticket bookkeeping is not such a dependency.

Granularity is decided when tickets are written: scope each ticket so that it is one
reviewable PR. If several existing tickets can only sensibly ship as one PR, that is a
ticketing mistake, not a licence to fan out — merge or re-cut the tickets, or state in
the PR body which issues it closes and post the same `## Evidence` comment on each.

Branch names: `<runtime>/<issue-key>-<slug>`, for example
`codex/she-123-agent-workflow` or `devin/she-123-agent-workflow`. Use the same
issue key in the PR title/body and attach the PR to Linear. If the user requests
a PR before a tracking issue exists, use a descriptive branch, then link the
issue when it is created; PR discovery must also inspect explicit links.

## Integration and release

Target `main` for ordinary PRs. Opening a PR does not merge it or publish an app
update. Native builds and EAS profiles are documented in `AGENTS.md`, `CLAUDE.md`,
and `eas.json`; no Oryoki `prod` branch or Bun promotion command applies here.
