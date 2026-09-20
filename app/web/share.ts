import type { RoundResult } from '../shared/types';
import { money, percent } from './components/Visuals';

export async function downloadScorecard(result: RoundResult): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  ctx.fillStyle = '#0b1016';
  ctx.fillRect(0, 0, 1200, 630);
  ctx.strokeStyle = '#23323a';
  for (let x = 0; x < 1200; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  ctx.fillStyle = '#69ddbb';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('WHALE ARENA', 70, 80);
  ctx.fillStyle = '#85939e';
  ctx.font = '20px sans-serif';
  ctx.fillText(
    `SYNTHETIC TUTORIAL · ${result.complete ? 'FIVE-ROUND RESULT' : `ROUND ${result.index} OF 5`}`,
    70,
    130,
  );
  ctx.fillStyle = '#f2f5f6';
  ctx.font = 'bold 92px sans-serif';
  ctx.fillText(percent(result.sessionReturnPct), 65, 275);
  ctx.font = '28px sans-serif';
  ctx.fillText(`${money(result.sessionEquity)} virtual portfolio`, 70, 333);
  ctx.fillStyle = '#69ddbb';
  ctx.font = '22px sans-serif';
  ctx.fillText(
    `This round ${percent(result.returnPct)}  ·  Equal weight ${percent(result.benchmarkPct)}`,
    70,
    425,
  );
  ctx.fillStyle = '#94a1ad';
  ctx.font = '21px sans-serif';
  ctx.fillText('Three tokens. Two clues. One decision.', 70, 516);
  ctx.font = '17px sans-serif';
  ctx.fillText('Fictional market data. Simulated results. No real funds.', 70, 565);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Could not export the scorecard.'))),
      'image/png',
    ),
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `whale-arena-round-${result.index}.png`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
