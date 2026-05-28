const DEFAULT_SERVER_PORT = 3000;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Returns the Socket.IO path that respects Vite's BASE_URL.
 * - In production with BASE_URL="/", returns "/socket.io"
 * - In dev with BASE_URL="/", returns "/socket.io"
 */
export function getSocketIOPath(): string {
  const base = (import.meta as any).env?.BASE_URL || '/';
  // BASE_URL always ends with '/', so we concatenate directly
  return `${base}socket.io`;
}

/**
 * Returns the backend/server base URL (Socket.IO + REST) for the current client.
 *
 * Priority:
 * 1) `VITE_SERVER_URL` - but only in dev/localhost (ignored in production to avoid :3000)
 * 2) Auto-detect from the current page host:
 *    - localhost: connects to http://localhost:3000
 *    - production: connects to same origin (no port) - Nginx proxies /socket.io to backend
 */
export function getBitBlastServerUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;

  if (typeof envUrl === 'string' && envUrl.trim()) {
    const cleaned = stripTrailingSlash(envUrl.trim());

    // If we're running in the browser, only honor VITE_SERVER_URL when on localhost
    // (or when the envUrl itself points to localhost). In production behind Nginx,
    // we want same-origin (no :3000).
    if (typeof window !== 'undefined' && window.location) {
      const pageHost = window.location.hostname;
      const pageIsLocal = pageHost === 'localhost' || pageHost === '127.0.0.1';
      const envLooksLocal = cleaned.includes('localhost') || cleaned.includes('127.0.0.1');

      if (pageIsLocal || envLooksLocal) return cleaned;

      // Ignore misconfigured production envUrl like https://playbitblast.no:3000
      // and fall through to same-origin.
    } else {
      // Non-browser environment: keep old behavior
      return cleaned;
    }
  }

  if (typeof window === 'undefined' || !window.location) {
    return `http://localhost:${DEFAULT_SERVER_PORT}`;
  }

  const hostname = window.location.hostname || 'localhost';

  // In development (localhost), connect to backend on port 3000
  // In production, use same origin (Nginx reverse proxy handles routing to backend)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const envPort = (import.meta as any).env?.VITE_SERVER_PORT as string | undefined;
    const port = typeof envPort === 'string' && envPort.trim() ? envPort.trim() : String(DEFAULT_SERVER_PORT);
    return `http://localhost:${port}`;
  }

  // Production: use same origin without explicit port
  // Nginx listens on 443 and proxies /socket.io and /api to backend

  // HOTFIX: For local network testing (e.g. mobile on WiFi), check for local IPs and use port 3000
  // regex for 192.168.x.x or 10.x.x.x or 172.16-31.x.x
  const isLocalIP = /(^127\.)|(^192\.168\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)/.test(hostname);

  if (isLocalIP) {
    const envPort = (import.meta as any).env?.VITE_SERVER_PORT as string | undefined;
    const port = typeof envPort === 'string' && envPort.trim() ? envPort.trim() : String(DEFAULT_SERVER_PORT);
    // Use the IP address (hostname) but with the server port
    return `http://${hostname}:${port}`;
  }

  return window.location.origin;
}
