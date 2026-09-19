# Hunt UI focused tests

## 1. Purpose

`tests/hunt-ui.spec.ts` verifies the browser transport boundary and the source-level UI contracts that can run without a browser mount. It uses deterministic synthetic Hunt views and reveal data.

## 2. Test callbacks

- `hunt transport keeps role filtering, command paths, and replay requests explicit` — `tests/hunt-ui.spec.ts:18`: checks all queue, room, role-filtered match, command, and replay routes plus command JSON.
- `hunt API errors retain server retry and state metadata` — `tests/hunt-ui.spec.ts:77`: checks structured `HuntApiError` fields.
- `entry, role views, and final reconstruction expose the Hunt acceptance copy` — `tests/hunt-ui.spec.ts:89`: checks entry/lobby/board/reveal copy and verifies tracer source does not render whale-private fields.
- `hunt CSS provides keyboard targets, mobile board behavior, and reduced motion` — `tests/hunt-ui.spec.ts:109`: checks scoped interaction, board, mobile, decoy, and reduced-motion rules.

Run the file with the Node 24 test runner and the repository's TypeScript loader when the `tsx` wrapper is available. The full Playwright journey still needs coordinator navigation and mounted Hunt routes.
