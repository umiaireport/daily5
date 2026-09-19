# Daily Five reset script

## 1. Purpose

`reset-daily-five.ts` is a development-only command for replaying the current Daily Five case. It clears attempts and Daily Five progression projections while preserving the published case pack and all other game data.

## 2. Usage

Run `npm run reset:daily-five` from `whale-arena/`. The script uses `DATABASE_PATH` or `./data/whale-arena.sqlite`, refuses `NODE_ENV=production`, prints deleted row counts, and asks the developer to refresh the browser. The browser has no public restart control.

After the refresh, if the browser still points at the deleted attempt, choose **Open a new attempt** in the recovery message. To clear only the browser pointer manually, run `localStorage.removeItem('whale-arena.daily-five.attempt')` in DevTools and reload. The published case pack is preserved, so the replay uses the same Daily Five.
