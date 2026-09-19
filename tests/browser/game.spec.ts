import { expect, test } from '@playwright/test';

const capturePrefix = process.env.E2E_PRODUCTION === '1' ? 'production-' : '';

test('private game fixtures and server source cannot be downloaded', async ({ request }) => {
  for (const path of [
    '/fixtures/synthetic/scenarios.ts',
    '/server/domain/game.ts',
    '/data/whale-arena.sqlite',
  ]) {
    const response = await request.get(path);
    expect([403, 404]).toContain(response.status());
    expect(await response.text()).not.toContain('const stories');
  }
});

test('five-round expedition, clue budget, reload, benchmarks, share and leaderboard', async ({
  page,
}, testInfo) => {
  const issues: string[] = [];
  page.on('pageerror', (error) => issues.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/#practice');
  await expect(page.getByRole('heading', { name: 'Find the signal.' })).toBeVisible();
  await expect(
    page.getByText('Training waters. All tokens, clues, and outcomes in this mode are fictional.'),
  ).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    testInfo.project.name === 'mobile' ? 390 : 1440,
  );
  await page.screenshot({
    path: `docs/screenshots/${capturePrefix}viewport-${testInfo.project.name}.png`,
  });
  await page.screenshot({
    path: `docs/screenshots/${capturePrefix}arena-${testInfo.project.name}.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('link', { name: 'Play tutorial' }).click();
  await expect(page.locator('#arena-board')).toBeFocused();
  await page.getByRole('button', { name: 'Unlock Follow the Funds for Token A' }).click();
  await expect(page.getByRole('dialog')).toContainText('Transfers are not executed purchases');
  await page.getByRole('button', { name: 'Back to the arena' }).click();
  await page.getByRole('button', { name: 'Unlock Trading Footprints for Token B' }).click();
  await page.getByRole('button', { name: 'Back to the arena' }).click();
  await expect(
    page.getByRole('button', { name: 'Unlock Market Pulse for Token C' }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'View Follow the Funds for Token A' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unlock Market Pulse for Token C' }),
  ).toBeDisabled();

  for (let round = 1; round <= 5; round++) {
    await page.getByRole('slider', { name: 'Token A allocation' }).fill('60');
    await page.getByRole('slider', { name: 'Token B allocation' }).fill('30');
    await expect(page.getByRole('slider', { name: 'Token A allocation' })).toHaveValue('60');
    await page.getByRole('button', { name: 'Lock & reveal' }).click();
    await expect(page.getByText('The identities behind the signal')).toBeVisible();
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      testInfo.project.name === 'mobile' ? 390 : 1440,
    );
    if (round === 1) {
      await expect(page.getByText('+5.43%', { exact: true }).first()).toBeVisible();
      const downloadEvent = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Share scorecard' }).click();
      const download = await downloadEvent;
      expect(download.suggestedFilename()).toBe('whale-arena-round-1.png');
      await download.saveAs(
        `docs/screenshots/${capturePrefix}scorecard-${testInfo.project.name}.png`,
      );
      await page.screenshot({
        path: `docs/screenshots/${capturePrefix}reveal-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }
    if (round < 5) await page.getByRole('button', { name: `Next round · ${round + 1}/5` }).click();
  }
  await expect(page.getByText('EXPEDITION COMPLETE', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `docs/screenshots/${capturePrefix}complete-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.locator('.result-actions').getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.locator('.leader-row.you')).toContainText('YOU');
  await page.getByRole('button', { name: 'Daily challenge' }).click();
  await expect(page.getByRole('heading', { name: 'Real currents. Coming next.' })).toBeVisible();
  await page.getByRole('button', { name: 'Explore training waters' }).click();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('heading', { name: 'Find the signal.' })).toBeVisible();
  await expect(page.getByLabel('2 clues remaining')).toBeVisible();
  expect(issues).toEqual([]);
});

test('cash-only choice requires confirmation and returns zero; keyboard controls work', async ({
  page,
}) => {
  await page.goto('/#practice');
  await expect(page.getByRole('slider', { name: 'Token A allocation' })).toBeVisible();
  await page.getByRole('slider', { name: 'Token A allocation' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider', { name: 'Token A allocation' })).toHaveValue('10');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Lock & reveal' }).click();
  await expect(page.getByRole('dialog')).toContainText('all $10,000 in cash');
  await page.getByRole('button', { name: 'Lock 100% cash' }).click();
  await expect(page.locator('.score-card.featured')).toContainText('+0.00%');
  await expect(page.locator('.score-card.featured')).toContainText('$10,000.00');
});

test('failed connection gives a working recovery action', async ({ page }) => {
  await page.route('**/api/scenarios/next', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Temporarily unavailable. Please reconnect.' }),
    }),
  );
  await page.goto('/#practice');
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await page.unroute('**/api/scenarios/next');
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByRole('heading', { name: 'Find the signal.' })).toBeVisible();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('a lost choice response restores its saved result after reload', async ({ page }) => {
  await page.goto('/#practice');
  await expect(page.getByRole('button', { name: 'Lock & reveal' })).toBeVisible();
  await page.route('**/api/scenarios/*/choice', async (route) => {
    const saved = await route.fetch();
    expect(saved.status()).toBe(200);
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'The reply was lost after saving your choice.' }),
    });
  });
  await page.getByRole('button', { name: 'Lock & reveal' }).click();
  await page.getByRole('button', { name: 'Lock 100% cash' }).click();
  await expect(page.getByRole('alert')).toContainText('reply was lost');
  await page.reload();
  await expect(page.locator('.score-card.featured')).toContainText('$10,000.00');
  await expect(page.getByText('The identities behind the signal')).toBeVisible();
  await page.getByRole('button', { name: 'Next round · 2/5' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Find the signal.' })).toBeVisible();
  await expect(page.locator('.scenario-title')).toContainText('ROUND 02');
});
