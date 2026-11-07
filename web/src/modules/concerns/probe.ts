/**
 * Trusted inspection of uploaded concern media. Types come from the bytes, never the browser.
 * Only these image/PDF types are ever served inline; anything else downloads as octet-stream.
 */
export const INLINE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
/**
 * Voice notes are Opus only: in WebM (Chromium, Edge, current Safari and Firefox recorders) or Ogg
 * (Firefox). Opus packets declare their own length, so the server can measure what a player will
 * actually play. MP4/AAC is refused: its timing comes from tables the uploader controls.
 */
export const VOICE_TYPES = ["audio/webm", "audio/ogg"] as const;
export type VoiceType = (typeof VOICE_TYPES)[number];

const ascii = (bytes: Uint8Array, at: number, text: string) =>
  bytes.length >= at + text.length && [...text].every((char, index) => bytes[at + index] === char.charCodeAt(0));

/** The served type of a file attachment: a safe inline type when the bytes prove it, else octet-stream. */
export function sniffFile(head: Uint8Array): string {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (ascii(head, 0, "\x89PNG\r\n\x1a\n")) return "image/png";
  if (ascii(head, 0, "GIF87a") || ascii(head, 0, "GIF89a")) return "image/gif";
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP")) return "image/webp";
  if (ascii(head, 0, "%PDF-")) return "application/pdf";
  return "application/octet-stream";
}

export function sniffVoice(head: Uint8Array): VoiceType | null {
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "audio/webm";
  if (ascii(head, 0, "OggS")) return "audio/ogg";
  return null;
}

/** Milliseconds of one Opus packet from its TOC (RFC 6716 §3.1–3.2), or null when the packet is invalid. */
export function opusPacketMs(packet: Uint8Array, length = packet.length): number | null {
  if (length < 1) return null;
  const config = packet[0] >> 3;
  const frame = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const code = packet[0] & 3;
  let frames = code === 0 ? 1 : 2;
  if (code === 3) {
    if (length < 2) return null;
    frames = packet[1] & 0x3f;
  }
  const ms = frame * frames;
  return frames > 0 && ms <= 120 ? ms : null;
}

/**
 * Playable length in seconds, or null when the bytes are not a well-formed, single-stream Opus
 * recording this parser fully understands. Every audio packet is counted from its own TOC; the
 * result is the maximum of that sum, the block timestamps/granule and any declared duration, so
 * understated headers or timestamps cannot hide audio. Anything ambiguous fails closed.
 */
export function voiceDuration(bytes: Uint8Array, type: VoiceType): number | null {
  try {
    const seconds = type === "audio/webm" ? webmDuration(bytes) : oggDuration(bytes);
    return seconds !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

const EBML = 0x1a45dfa3, SEGMENT = 0x18538067, INFO = 0x1549a966, TRACKS = 0x1654ae6b, TRACK_ENTRY = 0xae, CLUSTER = 0x1f43b675,
  BLOCK_GROUP = 0xa0, SIMPLE_BLOCK = 0xa3, BLOCK = 0xa1;
const MASTERS = new Set([SEGMENT, INFO, TRACKS, TRACK_ENTRY, CLUSTER, BLOCK_GROUP]);
/** Elements that could change or hide the packets a player decodes: content encodings, encrypted/virtual blocks, slices. */
const REFUSED = new Set([0x6d80, 0xaf, 0xa2, 0x8e]);

// Matroska/WebM. Recorders write unknown-size Segment/Cluster elements, often without Duration.
function webmDuration(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vint = (at: number, isId: boolean) => {
    const first = bytes[at];
    if (first === undefined || first === 0) throw new Error("vint");
    const length = Math.clz32(first) - 23;
    if (at + length > bytes.length || (isId && length > 4)) throw new Error("vint");
    let value = isId ? first : first & (0xff >> length);
    let unknown = !isId && value === (0xff >> length);
    for (let index = 1; index < length; index++) { value = value * 256 + bytes[at + index]; unknown &&= bytes[at + index] === 0xff; }
    return { value, length, unknown };
  };
  const uint = (at: number, size: number) => {
    if (size < 1 || size > 6) throw new Error("uint");
    let value = 0;
    for (let index = 0; index < size; index++) value = value * 256 + bytes[at + index];
    return value;
  };
  const text = (at: number, size: number) => new TextDecoder().decode(bytes.subarray(at, at + size)).replace(/\0+$/, "");
  let docType = "", scale = 1_000_000, declared = 0, cluster = 0, latest = 0, packets = 0, blocks = 0;
  let entries = 0, trackNumber: number | null = null, trackType: number | null = null, codec = "";
  let at = 0;
  while (at < bytes.length) {
    const id = vint(at, true);
    const size = vint(at + id.length, false);
    const body = at + id.length + size.length;
    if (at === 0 && id.value !== EBML) return null;
    if (MASTERS.has(id.value)) {
      if (size.unknown && id.value !== SEGMENT && id.value !== CLUSTER) return null;
      if (id.value === TRACK_ENTRY && ++entries > 1) return null;
      at = body;
      continue;
    }
    if (size.unknown || body + size.value > bytes.length) return null; // Truncated or unbounded: fail closed.
    if (REFUSED.has(id.value)) return null;
    switch (id.value) {
      case EBML: {
        for (let inner = body; inner < body + size.value;) {
          const child = vint(inner, true);
          const childSize = vint(inner + child.length, false);
          const start = inner + child.length + childSize.length;
          if (childSize.unknown || start + childSize.value > body + size.value) return null;
          if (child.value === 0x4282) docType = text(start, childSize.value);
          inner = start + childSize.value;
        }
        break;
      }
      case 0x2ad7b1: scale = uint(body, size.value); break;
      case 0x4489:
        if (size.value !== 4 && size.value !== 8) return null;
        declared = size.value === 4 ? view.getFloat32(body) : view.getFloat64(body);
        break;
      case 0xd7:
        if (trackNumber !== null) return null;
        trackNumber = uint(body, size.value);
        break;
      case 0x83: trackType = uint(body, size.value); break;
      case 0x86: codec = text(body, size.value); break;
      case 0xe7: cluster = uint(body, size.value); break;
      case SIMPLE_BLOCK: case BLOCK: {
        // The single track must be declared, as Opus audio, before any block.
        if (entries !== 1 || trackNumber === null || trackType !== 2 || codec !== "A_OPUS") return null;
        const track = vint(body, false);
        const header = body + track.length + 3;
        if (track.value !== trackNumber || header > body + size.value) return null;
        if ((bytes[header - 1] & 0x06) !== 0) return null; // Laced blocks hold several packets: refused.
        const ms = opusPacketMs(bytes.subarray(header, body + size.value));
        if (ms === null) return null;
        packets += ms;
        latest = Math.max(latest, (cluster + view.getInt16(body + track.length)) * scale / 1e6 + ms);
        blocks++;
        break;
      }
    }
    at = body + size.value;
  }
  if ((docType !== "webm" && docType !== "matroska") || entries !== 1 || blocks === 0 || scale < 1) return null;
  return Math.max(declared * scale / 1e9, latest / 1000, packets / 1000);
}

// Ogg Opus (RFC 7845): one logical stream; packet 0 is OpusHead, packet 1 OpusTags, then audio.
function oggDuration(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0, page = 0, serial: number | null = null, granule = 0, preSkip = -1, packets = 0, index = 0;
  let prefix: number[] = [], length = 0, open = false;
  const complete = () => {
    const first = Uint8Array.from(prefix);
    if (index === 0) {
      if (!ascii(first, 0, "OpusHead") || length < 19) return false;
      preSkip = first[10] | (first[11] << 8);
    } else if (index === 1) {
      if (!ascii(first, 0, "OpusTags")) return false;
    } else {
      const ms = opusPacketMs(first, length);
      if (ms === null) return false;
      packets += ms;
    }
    index++; prefix = []; length = 0;
    return true;
  };
  while (at < bytes.length) {
    if (at + 27 > bytes.length || !ascii(bytes, at, "OggS") || bytes[at + 4] !== 0) return null;
    const flags = bytes[at + 5];
    // Beginning-of-stream only on the first page; continuation exactly when a packet is still open.
    if (((flags & 2) !== 0) !== (page === 0) || ((flags & 1) !== 0) !== open) return null;
    const stream = view.getUint32(at + 14, true);
    if (serial === null) serial = stream; else if (stream !== serial) return null;
    const count = bytes[at + 26];
    if (at + 27 + count > bytes.length) return null;
    const table = bytes.subarray(at + 27, at + 27 + count);
    let body = at + 27 + count;
    if (body + table.reduce((sum, lace) => sum + lace, 0) > bytes.length) return null;
    for (const lace of table) {
      for (let offset = 0; offset < lace && prefix.length < 19; offset++) prefix.push(bytes[body + offset]);
      length += lace; body += lace; open = true;
      if (lace < 255) {
        if (!complete()) return null;
        open = false;
      }
    }
    const position = view.getBigInt64(at + 6, true);
    if (position >= 0n) granule = Math.max(granule, Number(position));
    at = body; page++;
  }
  if (open || preSkip < 0 || index < 3) return null;
  return Math.max((granule - preSkip) / 48000, packets / 1000);
}
