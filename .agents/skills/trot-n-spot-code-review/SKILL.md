---
name: trot-n-spot-code-review
description: Review Trot n Spot changes for simplicity, reuse, architectural boundaries, offline behavior, and consistency with the app's existing conventions. Use for repository-specific review of a diff or PR.
allowed-tools: [Read, Grep, Glob, Bash]
---

# Trot n Spot Code Review

Adapted from Oryoki's architecture review. Read `AGENTS.md`, `CLAUDE.md`,
the originating Linear issue, and `docs/agents/skill-overrides.md` first.
Use `docs/testing.md` for verification commands and
`docs/agents/project-state.md` for evidence and base-SHA conventions.

## Review principles

- Question wrappers, derivable fields, and intermediate collections. Trace actual
  consumers before recommending removal; serialization and RPCs also consume data.
- Search for existing primitives before adding similar code. Extend a shared API
  only when the new behavior belongs to its contract; avoid speculative abstraction.
- Verify reasons for complexity in code and tests. Mark unsupported explanations
  as hypotheses, with the specific evidence needed to resolve them.
- Keep data access, domain operations, platform adapters, and rendering at their
  existing boundaries. Report concrete violations, not preferred directory fashions.

## Repository boundaries

| Area | Responsibility |
| --- | --- |
| `app/`, `components/` | Expo routes, navigation, rendering, user interactions |
| `hooks/` | Data access and reusable application operations |
| `providers/` | Session, pack, journey, and sync lifecycle coordination |
| `lib/` | Shared logic and platform adapters: photos, notifications, persistence, sync |
| `types/database.ts` | Database types and explicit query projections |
| `supabase/migrations/`, `supabase/functions/` | Database invariants, authorization, server behavior |

Confirm the current implementation before relying on this map. Business logic belongs
in hooks and lib rather than being duplicated across route components.

## Checks that matter here

1. **Pack and quest contracts.** Membership changes use the existing pack RPCs;
   completion uses `complete_quest`. Check targeted/open quest behavior, authorization,
   and the atomic first-completion race. UI checks alone cannot enforce these rules.
2. **Location privacy.** Finder-facing list/detail queries use
   `QUEST_COLUMNS_NO_LOCATION`. Trace separately fetched creator/completed-quest
   location through rendering and caching so it cannot leak to another role.
3. **Offline lifecycle.** Review `lib/offline.ts`, `lib/sync.ts`, and `SyncProvider`.
   Preserve client UUIDs, queue ordering, retry/drop semantics, and last-good feed
   caching. Check reconnect, foreground, and session/pack changes where affected.
4. **Platform behavior.** Keep native photo uploads on the FormData/file-URI path,
   respect compression in `lib/photos.ts`, and use `lib/notify.ts` for web alerts.
   Verify platform storage and notification paths rather than assuming web proves
   native behavior.
5. **Database changes.** Compare RLS, grants, and RPC behavior with the existing
   migrations and `supabase/tests/`. Check search paths and authorization on privileged
   functions. A client-side filter is not a substitute for database authorization.
6. **Data intentionality.** For each added structure, identify its contract, producers,
   transformations, and consumers. When a field appears unused, verify all boundaries
   before proposing removal. Use
   [trot-n-spot-type-analysis](../trot-n-spot-type-analysis/SKILL.md) for deeper analysis.
7. **Tests.** Match tests to the changed behavior: Jest for logic and queue semantics,
   plain Postgres for RLS/RPCs, browser E2E for user flows, device/Maestro for native
   features. Follow `docs/testing.md`; report commands and actual results.

## Workflow and output

1. Fix the diff base and read the issue/spec; distinguish requested behavior from
   incidental refactoring.
2. Inspect changed files, callers, types, and tests. Use `rg` to find duplication and
   trace boundaries before declaring a problem.
3. Prioritize reproducible bugs and contract violations. For each finding include
   file/line, triggering scenario, consequence, evidence, and a focused remedy.
4. Separate verified findings, open hypotheses, and optional simplifications.
   Recommend consolidation only when the shared semantics are demonstrated.
5. Summarize coverage and residual risk. If no actionable findings, say so and identify
   what remains unverified. When publishing a review round, follow the issue/PR
   evidence format in `docs/agents/project-state.md`.

Do not run deployment or remote database mutations as review verification.
