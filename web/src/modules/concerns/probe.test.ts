import { describe, expect, it } from "vitest";
import { opusPacketMs, sniffFile, sniffVoice, voiceDuration } from "./probe";

const bytes = (...parts: (number[] | string | Uint8Array)[]) => new Uint8Array(parts.flatMap((part) =>
  typeof part === "string" ? [...part].map((char) => char.charCodeAt(0)) : [...part]));
const u16le = (value: number) => [value & 0xff, value >> 8];
const u32le = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24];
const u64le = (value: number) => { const out: number[] = []; let rest = BigInt(value); for (let i = 0; i < 8; i++) { out.push(Number(rest & 0xffn)); rest >>= 8n; } return out; };
const chars = (text: string) => [...text].map((char) => char.charCodeAt(0));

// EBML builder: ids keep their marker bits; sizes are one-byte vints, or 8-byte for larger bodies.
const size = (length: number) => length < 127 ? [0x80 | length] : [0x01, 0, 0, 0, (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff];
const el = (id: number[], body: number[]) => [...id, ...size(body.length), ...body];
const unknown = (id: number[]) => [...id, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
/** 20 ms CELT Opus packet (config 31, one frame). */
const PACKET = [0xf8, 0, 0];
type WebmOptions = { declared?: number; tracks?: number; codec?: string; lacing?: boolean; encoded?: boolean; packet?: number[]; step?: number };
/** A WebM shaped like Chrome's MediaRecorder output: unknown-size Segment/Clusters, one Opus track, SimpleBlocks. */
function webm(clusters: { at: number; blocks: number }[], options: WebmOptions = {}) {
  const { declared, tracks = 1, codec = "A_OPUS", lacing = false, encoded = false, packet = PACKET, step = 20 } = options;
  const header = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], chars("webm")));
  const info = el([0x15, 0x49, 0xa9, 0x66], [...el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40]),
    ...(declared === undefined ? [] : el([0x44, 0x89], [...new Uint8Array(new Float64Array([declared]).buffer)].reverse()))]);
  const entry = (number: number) => el([0xae], [...el([0xd7], [number]), ...el([0x83], [2]), ...el([0x86], chars(codec)),
    ...(encoded ? el([0x6d, 0x80], []) : [])]);
  const trackElements = el([0x16, 0x54, 0xae, 0x6b], Array.from({ length: tracks }, (_, index) => entry(index + 1)).flat());
  const body = clusters.flatMap(({ at, blocks }) => [...unknown([0x1f, 0x43, 0xb6, 0x75]), ...el([0xe7], [at >> 8, at & 0xff]),
    ...Array.from({ length: blocks }, (_, index) => el([0xa3], [0x81, (index * step) >> 8, (index * step) & 0xff, lacing ? 0x82 : 0x80, ...packet])).flat()]);
  return new Uint8Array([...header, ...unknown([0x18, 0x53, 0x80, 0x67]), ...info, ...trackElements, ...body]);
}
/** Clusters of 50 × 20 ms packets each, 1 s apart. */
const seconds = (count: number, options?: WebmOptions) => webm(Array.from({ length: count }, (_, index) => ({ at: index * 1000, blocks: 50 })), options);

function oggPage(granule: number, packets: number[][], { first = false, serial = 7, continued = false, laces }: { first?: boolean; serial?: number; continued?: boolean; laces?: number[] } = {}) {
  const table = laces ?? packets.map((packet) => packet.length);
  return bytes("OggS", [0, (first ? 2 : 0) | (continued ? 1 : 0)], u64le(granule), u32le(serial), [0, 0, 0, 0], [0, 0, 0, 0], [table.length], table, ...packets);
}
const HEAD = [...chars("OpusHead"), 1, 1, ...u16le(312), 0x80, 0xbb, 0, 0, 0, 0, 0];
const TAGS = [...chars("OpusTags"), 0, 0, 0, 0, 0, 0, 0, 0];
const ogg = (granule: number, audio: number[][], audioOptions = {}) =>
  new Uint8Array([...oggPage(0, [HEAD], { first: true }), ...oggPage(0, [TAGS]), ...oggPage(granule, audio, audioOptions)]);

describe("concern media probing", () => {
  it("serves only proven image/PDF bytes inline and everything else as a download", () => {
    expect(sniffFile(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffFile(bytes([0x89], "PNG\r\n\x1a\n"))).toBe("image/png");
    expect(sniffFile(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp");
    expect(sniffFile(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffFile(bytes("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"))).toBe("application/octet-stream");
    expect(sniffFile(bytes("<!doctype html><script>alert(1)</script>"))).toBe("application/octet-stream");
    expect(sniffVoice(bytes("<html>"))).toBeNull();
    // MP4/AAC timing comes from uploader-controlled tables, so it is not a voice note type.
    expect(sniffVoice(bytes([0, 0, 0, 24], "ftypM4A "))).toBeNull();
  });

  it("validates Opus packet TOCs", () => {
    expect(opusPacketMs(new Uint8Array([0xf8]))).toBe(20);
    expect(opusPacketMs(new Uint8Array([0xf9, 0]))).toBe(40);
    expect(opusPacketMs(new Uint8Array([0xfb, 6]))).toBe(120);
    expect(opusPacketMs(new Uint8Array([0xfb, 7]))).toBeNull(); // 140 ms exceeds the Opus packet limit.
    expect(opusPacketMs(new Uint8Array([0xfb, 0]))).toBeNull(); // Zero frames.
    expect(opusPacketMs(new Uint8Array([0xfb]))).toBeNull();
    expect(opusPacketMs(new Uint8Array([]))).toBeNull();
  });

  it("measures recorder WebM by its packets, so understated headers and timestamps cannot hide audio", () => {
    expect(sniffVoice(seconds(2))).toBe("audio/webm");
    expect(voiceDuration(seconds(2), "audio/webm")).toBeCloseTo(2, 3);
    expect(voiceDuration(seconds(2, { declared: 100 }), "audio/webm")).toBeCloseTo(2, 3);
    // Every block stamped at 0 still plays 50 × 20 ms of audio.
    expect(voiceDuration(webm([{ at: 0, blocks: 50 }], { step: 0 }), "audio/webm")).toBeCloseTo(1, 3);
    // Longer declared or timestamp spans win too (over-reporting is refused, never under-reporting).
    expect(voiceDuration(seconds(1, { declared: 5000 }), "audio/webm")).toBeCloseTo(5, 3);
  });

  it("puts a five-minute WebM on the right side of the limit", () => {
    expect(voiceDuration(seconds(300), "audio/webm")).toBeCloseTo(300, 3);
    const over = new Uint8Array([...seconds(300), ...el([0xa3], [0x81, 0, 0, 0x80, ...PACKET])]);
    expect(voiceDuration(over, "audio/webm")).toBeCloseTo(300.02, 3);
  });

  it("fails closed for WebM it cannot fully account for", () => {
    expect(voiceDuration(seconds(1, { lacing: true }), "audio/webm")).toBeNull();
    expect(voiceDuration(seconds(1, { tracks: 2 }), "audio/webm")).toBeNull();
    expect(voiceDuration(seconds(1, { codec: "A_VORBIS" }), "audio/webm")).toBeNull();
    expect(voiceDuration(seconds(1, { encoded: true }), "audio/webm")).toBeNull();
    expect(voiceDuration(seconds(1, { packet: [0xfb, 0] }), "audio/webm")).toBeNull();
    const whole = seconds(1);
    expect(voiceDuration(whole.subarray(0, whole.length - 2), "audio/webm")).toBeNull(); // Truncated final block.
    expect(voiceDuration(webm([]), "audio/webm")).toBeNull(); // No audio.
    expect(voiceDuration(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x80]), "audio/webm")).toBeNull();
    // Another track's blocks cannot be skipped silently.
    const foreign = new Uint8Array([...seconds(1), ...el([0xa3], [0x82, 0, 0, 0x80, ...PACKET])]);
    expect(voiceDuration(foreign, "audio/webm")).toBeNull();
  });

  it("measures Ogg Opus by its packets and final granule", () => {
    const audio = Array.from({ length: 150 }, () => [0xf8, 0]);
    expect(sniffVoice(ogg(48000 * 3 + 312, audio))).toBe("audio/ogg");
    expect(voiceDuration(ogg(48000 * 3 + 312, audio), "audio/ogg")).toBeCloseTo(3, 3);
    // An understated granule cannot hide 150 × 20 ms of packets.
    expect(voiceDuration(ogg(312 + 4800, audio), "audio/ogg")).toBeCloseTo(3, 3);
    // A packet spanning two pages is counted once, from its own TOC.
    const big = [0xf8, ...new Array(300).fill(0)];
    const spanning = new Uint8Array([...oggPage(0, [HEAD], { first: true }), ...oggPage(0, [TAGS]),
      ...oggPage(-1, [big.slice(0, 255)], { laces: [255] }), ...oggPage(312 + 960, [big.slice(255)], { continued: true })]);
    expect(voiceDuration(spanning, "audio/ogg")).toBeCloseTo(0.02, 3);
  });

  it("fails closed for Ogg it cannot fully account for", () => {
    const audio = [[0xf8, 0]];
    const whole = ogg(1272, audio);
    expect(voiceDuration(whole.subarray(0, whole.length - 1), "audio/ogg")).toBeNull(); // Truncated.
    expect(voiceDuration(new Uint8Array([...oggPage(0, [HEAD], { first: true }), ...oggPage(0, [TAGS]), ...oggPage(1272, audio, { serial: 8 })]), "audio/ogg")).toBeNull(); // Second stream.
    expect(voiceDuration(new Uint8Array([...oggPage(0, [TAGS], { first: true }), ...oggPage(1272, audio)]), "audio/ogg")).toBeNull(); // No OpusHead.
    expect(voiceDuration(ogg(1272, audio, { continued: true }), "audio/ogg")).toBeNull(); // Continuation without an open packet.
    expect(voiceDuration(ogg(1272, [[0xfb, 0]]), "audio/ogg")).toBeNull(); // Invalid TOC.
    expect(voiceDuration(new Uint8Array([...oggPage(0, [HEAD], { first: true }), ...oggPage(0, [TAGS])]), "audio/ogg")).toBeNull(); // No audio.
    expect(voiceDuration(new Uint8Array([...oggPage(0, [HEAD], { first: true }), ...oggPage(0, [TAGS]),
      ...oggPage(-1, [new Array(255).fill(0xf8)], { laces: [255] })]), "audio/ogg")).toBeNull(); // Ends inside a packet.
  });
});
