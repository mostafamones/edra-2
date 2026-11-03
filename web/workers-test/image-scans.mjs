// Same real entropy-coded 10,001-scan fixture as sol-avatar-scan-original.txt.
// Tiny AC scans visit an entire 2048-square component: exercise CPU amplification
// without pretending that adding empty SOS headers proves decoder acceptance.
export function manyScanCmyk(size = 2048, scans = 10001) {
  const segment = (marker, payload) => Buffer.from([255, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
  const frame = segment(0xc2, [8, size >> 8, size & 255, size >> 8, size & 255, 4, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0]);
  const tables = segment(0xc4, [0, 1, ...Array(15).fill(0), 0, 0x10, 0, 2, ...Array(14).fill(0), 0xe0, 0x10]);
  const dc = segment(0xda, [4, 1, 0, 2, 0, 3, 0, 4, 0, 0, 0, 0]);
  const ac = Buffer.concat([segment(0xda, [1, 1, 0, 1, 63, 0]), Buffer.from([0x3f, 0xff, 0, 0x3f, 0xff, 0, 0x5f])]);
  return Buffer.concat([Buffer.from([255, 216]), segment(0xdb, [0, ...Array(64).fill(1)]), frame, tables, dc,
    Buffer.alloc(Math.ceil(size / 8) ** 2 / 2), ...Array(scans - 1).fill(ac), Buffer.from([255, 217])]);
}
