export type ParsedMinioPublicBase = {
  hostname: string;
  port: number;
  useSsl: boolean;
  pathPrefix: string;
};

export function parseMinioPublicBase(publicUrl: string): ParsedMinioPublicBase {
  const url = new URL(publicUrl);
  const defaultPort = url.protocol === 'https:' ? 443 : 80;
  const port = url.port ? parseInt(url.port, 10) : defaultPort;
  const pathPrefix = url.pathname.replace(/\/$/, '');
  return {
    hostname: url.hostname,
    port,
    useSsl: url.protocol === 'https:',
    pathPrefix,
  };
}

export function isLocalhostHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/** Base URL para enlazar objetos públicos (key = feed/uuid.jpg). */
export function resolvePublicObjectBase(publicUrl: string, bucket: string): string {
  let base = publicUrl.replace(/\/$/, '');
  const hostname = parseMinioPublicBase(base).hostname;
  const isR2Public =
    hostname.endsWith('.r2.dev') || hostname.includes('.r2.cloudflarestorage.com');
  const isLocalMinio = isLocalhostHost(hostname) || hostname === 'minio';

  if (isR2Public) {
    // R2 público: la URL no lleva /bucket/ en el path (el dominio ya apunta al bucket).
    if (base.endsWith(`/${bucket}`)) {
      base = base.slice(0, -`/${bucket}`.length);
    }
    return base;
  }

  if (isLocalMinio && !base.endsWith(`/${bucket}`)) {
    return `${base}/${bucket}`;
  }

  return base;
}

export function buildPublicObjectUrl(publicUrl: string, bucket: string, key: string): string {
  const base = resolvePublicObjectBase(publicUrl, bucket);
  const normalizedKey = key.replace(/^\//, '');
  return `${base}/${normalizedKey}`;
}
