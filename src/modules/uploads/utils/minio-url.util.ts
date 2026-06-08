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
