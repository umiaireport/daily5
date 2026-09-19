# `tests/hunt-ui.spec.ts`

## 1. Purpose

The focused tests use synthetic contracts to verify the Hunt browser boundary without credentials or live provider calls.

## 2. Test callbacks

- `hunt transport keeps role filtering, command paths, and replay requests explicit` — `tests/hunt-ui.spec.ts:18`.
- `hunt API errors retain server retry and state metadata` — `tests/hunt-ui.spec.ts:77`.
- `entry, role views, and final reconstruction expose the Hunt acceptance copy` — `tests/hunt-ui.spec.ts:89`.
- `hunt CSS provides keyboard targets, mobile board behavior, and reduced motion` — `tests/hunt-ui.spec.ts:109`.

The structural UI assertions deliberately check that tracer code does not read whale-only target and budget fields. Browser mounting and complete service journeys remain pending coordinator integration.
