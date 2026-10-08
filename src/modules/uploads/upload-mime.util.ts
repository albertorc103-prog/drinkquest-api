/** Validación MIME por magic bytes (sin antivirus). */

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CHAT_AUDIO_MIME = new Set([
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/x-m4a',
  'audio/wav',
]);

export type DetectedUploadKind =
  | { ok: true; mime: string; kind: 'image' | 'audio' }
  | { ok: false; reason: string };

export function detectUploadContent(
  buffer: Buffer,
  declaredMime: string | undefined,
  folder: string,
): DetectedUploadKind {
  const detected = sniffMime(buffer);
  if (!detected) {
    return { ok: false, reason: 'Contenido no reconocido o no permitido.' };
  }

  const declared = (declaredMime ?? '').toLowerCase().trim();
  if (detected.kind === 'image') {
    if (!IMAGE_MIME.has(detected.mime)) {
      return { ok: false, reason: 'Tipo de imagen no permitido.' };
    }
    // Declarado debe ser imagen coherente (o vacío).
    if (declared && !declared.startsWith('image/')) {
      return { ok: false, reason: 'Content-Type no coincide con el archivo.' };
    }
    return { ok: true, mime: detected.mime, kind: 'image' };
  }

  if (detected.kind === 'audio') {
    if (folder !== 'chat') {
      return { ok: false, reason: 'Audio solo permitido en carpeta chat.' };
    }
    if (!CHAT_AUDIO_MIME.has(detected.mime) && !CHAT_AUDIO_MIME.has(declared)) {
      // sniffer puede devolver audio/mp4 genérico; aceptar si declarado es audio chat.
      if (!declared.startsWith('audio/')) {
        return { ok: false, reason: 'Tipo de audio no permitido.' };
      }
    }
    const mime = CHAT_AUDIO_MIME.has(declared) ? declared : detected.mime;
    return { ok: true, mime, kind: 'audio' };
  }

  return { ok: false, reason: 'Tipo de archivo no permitido.' };
}

function sniffMime(buf: Buffer): { mime: string; kind: 'image' | 'audio' } | null {
  if (!buf || buf.length < 12) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', kind: 'image' };
  }
  // PNG
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return { mime: 'image/png', kind: 'image' };
  }
  // GIF
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buf.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return { mime: 'image/gif', kind: 'image' };
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', kind: 'image' };
  }
  // Reject SVG/HTML/XML disguised
  const head = buf.subarray(0, Math.min(256, buf.length)).toString('utf8').trimStart().toLowerCase();
  if (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    head.startsWith('<!doctype html') ||
    head.startsWith('<html')
  ) {
    return null;
  }

  // OGG
  if (buf.subarray(0, 4).toString('ascii') === 'OggS') {
    return { mime: 'audio/ogg', kind: 'audio' };
  }
  // WAV
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WAVE'
  ) {
    return { mime: 'audio/wav', kind: 'audio' };
  }
  // MP4/M4A (ftyp)
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mime: 'audio/mp4', kind: 'audio' };
  }
  // WebM / EBML
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mime: 'audio/webm', kind: 'audio' };
  }
  // MPEG ADTS / ID3
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    return { mime: 'audio/mpeg', kind: 'audio' };
  }
  if (buf.subarray(0, 3).toString('ascii') === 'ID3') {
    return { mime: 'audio/mpeg', kind: 'audio' };
  }

  return null;
}

export const UPLOAD_SIZE_LIMITS: Record<string, number> = {
  avatars: 2 * 1024 * 1024,
  feed: 5 * 1024 * 1024,
  chat: 8 * 1024 * 1024,
  drinks: 5 * 1024 * 1024,
  promotions: 5 * 1024 * 1024,
  medals: 5 * 1024 * 1024,
};
