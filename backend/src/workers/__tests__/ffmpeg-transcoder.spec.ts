import { parseFfmpegOutTimeMs } from '../ffmpeg-transcoder.js';

describe('parseFfmpegOutTimeMs', () => {
  test('calcule 50% pour out_time_ms à mi-parcours', () => {
    const total = 100; // seconds
    const line = 'out_time_ms=50000000'; // 50s
    const pct = parseFfmpegOutTimeMs(line, total);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(50, 2);
  });

  test('retourne null si la ligne ne correspond pas', () => {
    const pct = parseFfmpegOutTimeMs('frame=100 fps=30', 100);
    expect(pct).toBeNull();
  });

  test('retourne null si la durée totale est invalide', () => {
    const pct = parseFfmpegOutTimeMs('out_time_ms=1000000', 0);
    expect(pct).toBeNull();
  });

  test('clamp à 100% quand out_time_ms dépasse la durée', () => {
    const total = 10; // seconds
    const line = 'out_time_ms=15000000'; // 15s
    const pct = parseFfmpegOutTimeMs(line, total);
    expect(pct).not.toBeNull();
    expect(pct!).toBeCloseTo(100, 6);
  });
});
