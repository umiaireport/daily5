import type { DailyFinalResult, DailyTicketResult } from '../../shared/daily-five.js';

export interface DailyFiveShareInput {
  readonly dailyNumber: string | number;
  readonly result: DailyFinalResult;
  readonly mode?: 'official' | 'practice';
}

function displayNumber(value: string | number): string {
  const text = String(value).replace(/^#/, '');
  return /^\d+$/.test(text) ? text.padStart(3, '0') : text;
}

function isNegative(ticket: DailyTicketResult): boolean {
  return ticket.returnPct.startsWith('-');
}

function displayMoney(value: string): string {
  const match = /^(-?)(\d+)(\.\d{2})$/.exec(value);
  if (!match) return `$${value}`;
  const [, sign, whole, decimals] = match;
  return `${sign === '-' ? '-' : ''}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${decimals === '.00' ? '' : decimals}`;
}

export function dailyOutcomeSymbol(ticket: DailyTicketResult): string {
  if (ticket.liquidated) return '💥';
  if (ticket.decision.kind === 'cash') return '⬜';
  return isNegative(ticket) ? '🟥' : '🟩';
}

export function dailyDirectionAccuracy(result: DailyFinalResult): {
  correct: number;
  total: number;
} {
  const directional = result.tickets.filter((ticket) => ticket.decision.kind === 'trade');
  return {
    correct: directional.filter((ticket) => !ticket.liquidated && !isNegative(ticket)).length,
    total: directional.length,
  };
}

/** Formats the saved final result without asset names, directions, clues, or answer mappings. */
export function buildDailyFiveShareText(input: DailyFiveShareInput): string {
  const accuracy = dailyDirectionAccuracy(input.result);
  const outcomeSummary =
    accuracy.total > 0
      ? `${accuracy.correct}/${accuracy.total} directions`
      : `${input.result.tickets.filter((ticket) => !ticket.returnPct.startsWith('-') && ticket.returnPct !== '0.00').length}/5 profitable rounds`;
  const lines = [
    `DAILY5 · DAILY FIVE #${displayNumber(input.dailyNumber)}`,
    input.result.tickets.map(dailyOutcomeSymbol).join(' '),
    input.result.tickets
      .map(
        (ticket) =>
          `R${ticket.roundIndex} ${ticket.returnPct.startsWith('-') ? '' : '+'}${ticket.returnPct}%`,
      )
      .join(' · '),
    displayMoney(input.result.totalEquity),
    `${input.result.returnPct.startsWith('-') ? '' : '+'}${input.result.returnPct}% · ${outcomeSummary}`,
    '',
    'Five rounds. One market read. Who saw it best?',
  ];
  if (input.mode === 'practice')
    lines.push('Practice variant · exact-case replay is practice only.');
  return lines.join('\n');
}

function drawText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = 400,
): void {
  context.fillStyle = color;
  context.font = `${weight} ${size}px Arial, sans-serif`;
  context.fillText(text, x, y);
}

/** Builds a 1200×630 local scorecard image from the saved final result. */
export function createDailyFiveScorecardBlob(input: DailyFiveShareInput): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Scorecard export is available in a browser.'));
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const context = canvas.getContext('2d');
    if (!context) {
      reject(new Error('The browser could not create a scorecard canvas.'));
      return;
    }
    context.fillStyle = '#0b1016';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#121a23';
    context.fillRect(54, 54, 1092, 522);
    context.strokeStyle = '#2b3945';
    context.lineWidth = 2;
    context.strokeRect(54, 54, 1092, 522);
    drawText(context, 'DAILY5', 94, 116, 24, '#69ddbb', 700);
    drawText(
      context,
      `DAILY FIVE #${displayNumber(input.dailyNumber)}`,
      94,
      158,
      42,
      '#e7edf0',
      700,
    );
    drawText(
      context,
      input.result.tickets.map(dailyOutcomeSymbol).join('   '),
      94,
      254,
      66,
      '#e7edf0',
    );
    drawText(context, 'FINAL EQUITY', 94, 332, 16, '#91a2af', 700);
    drawText(context, displayMoney(input.result.totalEquity), 94, 392, 48, '#e7edf0', 700);
    const accuracy = dailyDirectionAccuracy(input.result);
    drawText(
      context,
      `${input.result.returnPct.startsWith('-') ? '' : '+'}${input.result.returnPct}%  ·  ${accuracy.total > 0 ? `${accuracy.correct}/${accuracy.total} directions` : `${input.result.tickets.filter((ticket) => !ticket.returnPct.startsWith('-') && ticket.returnPct !== '0.00').length}/5 profitable rounds`}`,
      94,
      444,
      24,
      input.result.returnPct.startsWith('-') ? '#f09e9d' : '#69ddbb',
      700,
    );
    drawText(context, 'Five rounds. One market read. Who saw it best?', 94, 520, 18, '#91a2af');
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not encode the scorecard.'));
    }, 'image/png');
  });
}

/** Downloads the scorecard locally and never uploads the saved result. */
export async function downloadDailyFiveScorecard(
  input: DailyFiveShareInput,
  filename = `daily5-daily-five-${displayNumber(input.dailyNumber)}.png`,
): Promise<void> {
  const blob = await createDailyFiveScorecardBlob(input);
  if (typeof document === 'undefined')
    throw new Error('Scorecard export is available in a browser.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyDailyFiveShareText(input: DailyFiveShareInput): Promise<string> {
  const text = buildDailyFiveShareText(input);
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText)
    throw new Error('Clipboard access is unavailable in this browser.');
  await navigator.clipboard.writeText(text);
  return text;
}

/** Uses the browser share sheet when available and returns false when it is not supported. */
export async function shareDailyFiveNative(input: DailyFiveShareInput): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  await navigator.share({ text: buildDailyFiveShareText(input) });
  return true;
}
