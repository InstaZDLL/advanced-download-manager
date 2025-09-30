import { computeAria2Progress, type Aria2Status } from '../aria2-downloader.js';

describe('computeAria2Progress', () => {
  test('calcule progress/eta/speed/totalBytes', () => {
    const status: Aria2Status = {
      status: 'active',
      totalLength: String(200 * 1024 * 1024), // 200 MiB in bytes (approx)
      completedLength: String(50 * 1024 * 1024),
      downloadSpeed: String(10 * 1024 * 1024), // 10 MB/s
      files: [{ path: '/tmp/file.bin' }],
    };

    const res = computeAria2Progress(status);
    expect(res).not.toBeNull();
    expect(res!.totalBytes).toBe(200 * 1024 * 1024);
    expect(res!.progress).toBeCloseTo(25, 3);
    // Remaining bytes = 150 MiB, at 10 MB/s => ~15s
    expect(res!.eta).toBeCloseTo(15, 0);
    expect(res!.speed).toBe('10.00MB/s');
  });

  test('retourne null si totalLength invalide', () => {
    const status: Aria2Status = {
      status: 'active',
      totalLength: '0',
      completedLength: '0',
      files: [{ path: '/tmp/file.bin' }],
    };
    expect(computeAria2Progress(status)).toBeNull();
  });

  test('retourne null si completedLength invalide', () => {
    const status: Aria2Status = {
      status: 'active',
      totalLength: '100',
      completedLength: '-1',
      files: [{ path: '/tmp/file.bin' }],
    };
    expect(computeAria2Progress(status)).toBeNull();
  });
});
