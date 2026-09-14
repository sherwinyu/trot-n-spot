# Agent verification

Use the existing [AGENTS.md](../AGENTS.md) testing guide and
[browser E2E guide](../e2e/README.md) for setup and screenshot recipes.
Source `scripts/env.sh` in agent shell calls. This repo uses npm and
`package-lock.json`, Node from `.nvmrc`, and Expo.

| Change | Verification |
| --- | --- |
| Skills/docs only | Check frontmatter, resource links, Claude symlinks, shell template syntax, and `git diff --check`; no app build required |
| TypeScript / app logic | `npx tsc --noEmit` and `npm test -- --ci --runInBand` |
| Migrations / RLS / RPCs | `scripts/db-test.sh` against local Postgres |
| Browser flows | `node e2e/run-e2e.js`; see `e2e/README.md` for prerequisites and captured evidence |
| UI appearance | `npx expo start --web`, browser automation/screenshots; device screenshots for native differences |
| Native capabilities | Relevant Maestro/device flow; see `AGENTS.md` before rebuilding |

Jest is configured in `package.json` and `jest.setup.js`. There is no configured
lint script. Use the current package scripts rather than older setup examples.
Report actual command results and unavailable environments in evidence; do not
claim a browser check verifies real camera, GPS, push, or native offline storage.
