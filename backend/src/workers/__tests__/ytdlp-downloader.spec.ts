import { parseYtDlpProgressLine, parseYtDlpErrorCode } from '../ytdlp-downloader.js';

describe('parseYtDlpProgressLine', () => {
  test('parsing ligne complète avec progress, speed et ETA', () => {
    const line = '[download]  15.2% of 234.56MiB at 1.23MiB/s ETA 02:34';
    const res = parseYtDlpProgressLine(line);
    expect(res).not.toBeNull();
    expect(res!.progress).toBeCloseTo(15.2, 1);
    expect(res!.speed).toBe('1.23MiB/s');
    expect(res!.eta).toBe(2 * 60 + 34);
    expect(res!.totalBytes).toBeCloseTo(234.56 * 1024 * 1024, -2);
  });

  test('parsing ligne de taille seule', () => {
    const line = '[download] Destination: foo.mp4 of 1.5GiB';
    const res = parseYtDlpProgressLine(line);
    expect(res).not.toBeNull();
    expect(res!.progress).toBe(0); // par défaut si seul totalBytes est connu
    expect(res!.totalBytes).toBeCloseTo(1.5 * 1024 * 1024 * 1024, -2);
  });

  test('ligne sans informations utiles', () => {
    const line = '[download] Downloading webpage';
    const res = parseYtDlpProgressLine(line);
    expect(res).toBeNull();
  });
});

describe('parseYtDlpErrorCode', () => {
  test('détecte VIDEO_UNAVAILABLE', () => {
    expect(parseYtDlpErrorCode('ERROR: Video unavailable')).toBe('VIDEO_UNAVAILABLE');
  });
  test('détecte NETWORK_ERROR', () => {
    expect(parseYtDlpErrorCode('network timeout')).toBe('NETWORK_ERROR');
  });
  test('détecte FORMAT_ERROR', () => {
    expect(parseYtDlpErrorCode('unsupported format found')).toBe('FORMAT_ERROR');
  });
  test('renvoie undefined si non reconnu', () => {
    expect(parseYtDlpErrorCode('some other error')).toBeUndefined();
  });
});
