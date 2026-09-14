# Issue tracker: Linear

Issues and specs for this repo live in the `Sherwin` team in the `sherwin`
Linear workspace. The team key is `SHE`.

## Repository mapping

- Repository: `sherwinyu/trot-n-spot` (default branch `main`).
- Project: [Trot n Spot](https://linear.app/sherwin/project/trot-n-spot-8366953bc988).
- Project ID: `a658c54c-2ef2-4bc7-8b6a-f5cdc3e07a12`.
- Team ID: `911be2e7-a217-4183-ac6a-d31c6952d672`.

For repository work, scope issue lists to this project and set this project on
new issues, including children. When updating an existing issue, preserve its
project unless a move is requested. Do not copy Oryoki's project association.

`resume` and the human queue retain the source workflow's cross-project view.
For each initiative outside Trot n Spot, resolve its own repository and default
branch before reading PRs or testing base-SHA staleness. Never compare another
repository's claims against this checkout's `main`. If its repository cannot be
resolved or accessed, mark its PR/base checks unverified. An explicit request for
Trot n Spot status scopes resume and the human queue to this project.

The operation names below describe capabilities; inspect the connected tool's
current schema. Paginate lists before treating them as complete, and request
fields/relations needed for states, labels, parents, and blocking edges.

Use the connected Linear tools for all issue operations. Do not use GitHub
Issues or `.scratch/` for project work.

## Operations

- List issues with `linear_list_issues`, scoped to team `Sherwin` and this project for repository work.
- Fetch an issue with `linear_get_issue`.
- Create or update issues with `linear_save_issue`, setting `team: "Sherwin"`
  and `project: "a658c54c-2ef2-4bc7-8b6a-f5cdc3e07a12"` when creating.
- Add comments with `linear_save_comment`.
- List comments with `linear_list_comments`.
- Create missing labels with the connected label-creation tool (currently `linear_save_issue_label`).
- Use `linear_save_issue` fields `labels`, `blockedBy`, `blocks`, `relatedTo`,
  and `parentId` for labels and native relationships.
- Use Linear's `Canceled` state for rejected or `wontfix` issues.

## Project-state operations

The formats these calls carry — checkpoint, claim, evidence — are defined in
[`project-state.md`](./project-state.md). This section only maps each operation to
its call.

| Operation | Call |
| --- | --- |
| Post a checkpoint | `linear_save_comment` with `issueId` = the parent issue and the checkpoint block as `body`. Never pass `id`: a new comment, never an edit. |
| Read the newest checkpoint | `linear_list_comments` with `issueId` = the parent issue; of the top-level comments (`parentId: null`) whose body starts `## Checkpoint`, take the one with the greatest `createdAt`. The listing is newest-first today, but carries no documented sort argument, so compare timestamps rather than trusting the position. |
| Read the active initiatives | Three `linear_list_issues` calls with `team: "Sherwin"` — `label: "ready-for-agent"`, `label: "ready-for-human"`, and `state: "In Progress"` — unioned client-side by issue id, plus `state: "In Review"` if that state is in use. One call cannot OR two labels or mix labels with states. The distinct `parentId`s of the union are the active initiatives; issues with no `parentId` stay in the union as single-issue initiatives. |
| Read the PRs of an initiative | GitHub, not Linear: `gh pr list --repo <initiative-repository> --state all --limit 100 --json number,title,body,url,mergedAt,headRefName`, or the connected GitHub tools; match explicit issue/PR links first, then `<runtime>/<issue-key>-` for each child key (branch convention in [`../git-workflow.md`](../git-workflow.md)). Always pass `--limit` and page further when truncated; the CLI default is 30. |
| Read the frontier | `linear_list_issues` with `team: "Sherwin"`, `parentId` = the parent issue, `label: "ready-for-agent"`; drop issues with an unresolved `blockedBy` edge or an existing `## Claim` comment. |
| Read the human queue | `linear_list_issues` with `label: "ready-for-human"`, unscoped by project, ordered by priority. |
| Claim an issue | `linear_save_comment` with the claim block, then `linear_save_issue` with `id` and `state: "In Progress"`. |
| Post evidence on the issue | `linear_save_comment` with the `## Evidence` block and `issueId` = the issue. |
| Post the same evidence on the PR | GitHub, not Linear: the PR-comment tool of the runtime in use (`gh pr comment <n> --body-file` from a shell). Identical body. |
| Embed a screenshot | `linear_prepare_attachment_upload`, `PUT` the bytes to the signed URL, then `linear_create_attachment_from_upload`. |
| Record ordering | `linear_save_issue` fields `blockedBy` / `blocks`. |

States available in the `Sherwin` team: `Backlog`, `Todo`, `In Progress`,
`In Review`, `Done`, `Canceled`, `Duplicate`. There are no workflow-specific states;
queues are labels.

## Labels

Canonical triage state labels are defined in `triage-labels.md`.

Category mapping:

- `bug` → `Bug`
- `enhancement` → `Feature` for new capabilities, or `Improvement` for
  improving existing behavior

Every triaged issue should have exactly one category label and one
triage-state label.

Wayfinder uses:

- `wayfinder:map`
- `wayfinder:research`
- `wayfinder:prototype`
- `wayfinder:grilling`
- `wayfinder:task`

## Triage comments

Every comment posted during triage must begin with:

> *This was generated by AI during triage.*

## Pull requests

GitHub remains the code host, but pull requests are not a separate triage
request surface. Project work is tracked in Linear issues.

Attach PRs with `linear_save_issue`'s `links` field (URL plus title), and include
the Linear issue URL in the PR body. Assigning an issue to a person is separate
from a runtime's claim. Keep review work in `In Review` until it is actually done.
