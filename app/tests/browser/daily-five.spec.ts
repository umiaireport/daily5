import { expect, test, type Page } from '@playwright/test';

const screen = '[aria-labelledby="daily-five-title"]';
const heading = 'Read the board, then allocate.';

async function openV2(page: Page) {
  await page.goto('/#daily-five');
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(page.getByText('0 complete · 5 remaining')).toBeVisible();
  await expect(page.getByText('Round 1 of 5 · $10,000 isolated budget.')).toBeVisible();
}

test('Daily Five v2 compares evidence, saves a portfolio draft, reloads, and completes five rounds', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openV2(page);
  const cards = page.locator('.daily-five-v2__candidate');
  await expect(cards).toHaveCount(5);
  const paths = await cards
    .locator('polyline')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('points')));
  expect(new Set(paths).size).toBe(5);

  const b = page.getByRole('button', { name: /Mystery B/ }).first();
  await b.click();
  await expect(page.getByText('INSPECT · Mystery B')).toBeVisible();
  await page.locator('.daily-five-v2__clues button').first().click();
  await expect(page.locator('.daily-five__clue-answer')).toContainText('Buy volume');
  await expect(page.locator('.daily-five__clue-answer')).toContainText('Earlier hourly average');

  await page.getByRole('spinbutton', { name: 'Mystery A allocation amount percent' }).fill('20');
  await page.getByRole('spinbutton', { name: 'Mystery C allocation amount percent' }).fill('30');
  await expect(page.getByText('50% cash', { exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Mystery A allocation amount dollars' }).fill('2500');
  await expect(
    page.getByRole('spinbutton', { name: 'Mystery A allocation amount percent' }),
  ).toHaveValue('25');
  const leverageSlider = page.getByRole('slider', { name: 'Mystery A leverage slider' });
  const leverageInput = page.getByRole('spinbutton', { name: 'Mystery A leverage' });
  await leverageSlider.fill('25');
  await expect(leverageInput).toHaveValue('25');
  await leverageInput.fill('7');
  await expect(leverageSlider).toHaveValue('7');
  await page.reload();
  await expect(
    page.getByRole('spinbutton', { name: 'Mystery A allocation amount percent' }),
  ).toHaveValue('25');
  await expect(
    page.getByRole('spinbutton', { name: 'Mystery C allocation amount percent' }),
  ).toHaveValue('30');
  await expect(
    page.getByRole('spinbutton', { name: 'Mystery A allocation amount dollars' }),
  ).toHaveValue('2500');
  await expect(page.getByRole('slider', { name: 'Mystery A leverage slider' })).toHaveValue('7');
  await page.getByRole('button', { name: 'Lock portfolio & reveal' }).click();
  await expect(page.getByTestId('daily-five-reveal')).toBeVisible();
  await expect(page.getByText('Each allocation settled')).toBeVisible();
  await page.screenshot({
    path: `screenshots/daily-five-v2-reveal-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Next trade' }).click();

  let previousPaths = paths.join('|');
  for (let round = 2; round <= 5; round += 1) {
    await expect(page.getByText(`${round - 1} complete · ${6 - round} remaining`)).toBeVisible();
    const currentPaths = (
      await page
        .locator('.daily-five-v2__candidate polyline')
        .evaluateAll((elements) => elements.map((element) => element.getAttribute('points')))
    ).join('|');
    expect(currentPaths).not.toBe(previousPaths);
    previousPaths = currentPaths;
    await page.getByRole('button', { name: 'Lock portfolio & reveal' }).click();
    await expect(page.getByTestId('daily-five-reveal')).toBeVisible();
    await page
      .getByRole('button', { name: round === 5 ? 'See final score' : 'Next trade' })
      .click();
  }
  await expect(page.getByTestId('daily-five-final')).toBeVisible();
  await expect(page.getByText('5 complete · 0 remaining')).toBeVisible();
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBe(
    info.project.name === 'mobile' ? 390 : 1440,
  );
  expect(errors).toEqual([]);
});

test('Daily Five reconnects without starting another v2 attempt', async ({ page }) => {
  await openV2(page);
  let starts = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && /daily-five\/[^/]+\/attempts$/.test(request.url())) starts++;
  });
  await page.route('**/api/daily-five/attempts/*', (route) =>
    route.fulfill({ status: 503, json: { message: 'Saved progress is temporarily unavailable.' } }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  expect(starts).toBe(0);
  await page.unroute('**/api/daily-five/attempts/*');
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  expect(starts).toBe(0);
});

test('Daily Five missing attempt offers explicit practice recovery', async ({ page }, info) => {
  await openV2(page);
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('whale-arena.daily-five.attempt')!);
    localStorage.setItem(
      'whale-arena.daily-five.attempt',
      JSON.stringify({ ...stored, attemptId: 'missing-attempt' }),
    );
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Let’s recover your round.' })).toBeVisible();
  await page.screenshot({
    path: `screenshots/daily-five-v2-recovery-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Open a new attempt' }).click();
  await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(page.locator(`${screen} .daily-five-v2__header`)).toContainText('PRACTICE');
});

test('Daily Five restores a lost saved portfolio response and continuation', async ({ page }) => {
  await openV2(page);
  let submissions = 0;
  await page.route('**/api/daily-five/attempts/*/tickets', async (route) => {
    submissions++;
    expect((await route.fetch()).status()).toBe(200);
    await route.fulfill({ status: 503, json: { message: 'Reply lost after saving.' } });
  });
  await page.getByRole('button', { name: 'Lock portfolio & reveal' }).click();
  await expect(page.getByTestId('daily-five-reveal')).toBeVisible();
  expect(submissions).toBe(1);
  await page.route('**/api/daily-five/attempts/*/continue', (route) =>
    route.fulfill({ status: 503, json: { message: 'Next round is temporarily unavailable.' } }),
  );
  await page.getByRole('button', { name: 'Next trade' }).click();
  await expect(page.getByRole('alert')).toContainText('Next round is temporarily unavailable');
  await page.unroute('**/api/daily-five/attempts/*/continue');
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(page.getByRole('button', { name: 'Next trade' })).toBeEnabled();
  await page.getByRole('button', { name: 'Next trade' }).click();
  await expect(page.getByText('1 complete · 4 remaining')).toBeVisible();
});

test('Daily Five is untimed and its v2 mobile workspace stays within the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openV2(page);
  await expect(page.getByRole('timer')).toHaveCount(0);
  const e = page.getByRole('button', { name: /Mystery E/ }).first();
  await e.focus();
  await page.keyboard.press('Enter');
  await expect(e).toBeFocused();
  await expect(e).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.locator('main.daily-five').evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(320);
});
