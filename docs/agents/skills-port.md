# Skill provenance and maintenance

Ported from `sherwinyu/oryoki` at commit
`7236fedc98f1f0158be1f7ccd0b93696f4aea418` (main), on 2026-09-14.

- All 33 source `.agents/skills` directories are represented, including their
  supporting references, scripts, and existing agent metadata.
- The Claude-only `explain-diff-html` skill is now shared too: 34 canonical skills.
- The 27 skills recorded in `skills-lock.json` and that lockfile are copied
  unchanged. The lockfile records their Matt Pocock upstream provenance, not the
  repository-owned custom skills. Updating vendored skills requires rechecking
  `skill-overrides.md` and referenced resources.
- `.claude/skills/*` are relative symlinks to `.agents/skills/*`, including legacy
  skills that were previously duplicate files. Edit the canonical files.
- Lowercase `skill.md` entrypoints are normalized to `SKILL.md`; custom skill
  names use hyphens and version fields live under metadata.
- `oryoki-code-review` becomes `trot-n-spot-code-review`: the same simplicity,
  reuse, boundary, and data-intentionality goals applied to this Expo app.
  Oryoki editor-specific checks are replaced with this repo's documented contracts.
- `oryoki-type-analysis` becomes `trot-n-spot-type-analysis`; debugging and
  skill-improvement instructions use the current paths and test commands.
  Historical examples remain explicitly illustrative.
- The Claude reviewer delegates to the shared Trot n Spot review skill rather
  than maintaining a second copy of the architecture checks.
- Linear workflow docs retain checkpoints, decisions, claims, evidence, staleness,
  read-only cross-project resume, and one-question grilling. Repository operations
  use Trot n Spot's project; cross-project reads resolve each initiative's repo.
- Existing Trot n Spot app guidance is retained. Git and test guidance is adapted
  to npm, Expo, Jest, native screenshots, and runtime-neutral branch names.

Oryoki's application glossary, deployment/CI workflows, personal tool settings,
and permission configuration are not dependencies of these skills and are not
part of this port. Domain docs are created lazily by `domain-modeling`.
