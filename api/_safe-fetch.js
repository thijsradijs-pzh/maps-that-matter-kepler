// api/_safe-fetch.js
// Gedeelde SSRF-bescherming voor de proxies. Bestanden met een _ ervoor worden
// door Vercel niet als functie uitgerold.
//
// Een blocklist op de hostnaam alleen is te omzeilen: een eigen domein dat naar
// 127.0.0.1 of 169.254.169.254 (cloud-metadata) wijst, of een redirect daarheen.
// Daarom: DNS zelf opzoeken en alle adressen toetsen, en redirects handmatig
// volgen met dezelfde toets per sprong.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 3;

function isPrivateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||        // carrier-grade NAT
    (a === 169 && b === 254) ||                  // link-local, cloud-metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;                                    // multicast en gereserveerd
}

function isPrivateIp(ip) {
  if (isIP(ip) === 4) return isPrivateV4(ip);
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateV4(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') ||
    v6.startsWith('fe80') || v6.startsWith('ff');
}

export class UnsafeUrlError extends Error {}

export async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError('Ongeldige url'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UnsafeUrlError('Alleen http(s)');
  }
  if (url.username || url.password) throw new UnsafeUrlError('Geen inloggegevens in de url');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addrs = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => { throw new UnsafeUrlError('Host onbekend'); });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) {
    throw new UnsafeUrlError('Host niet toegestaan');
  }
  return url;
}

// fetch() met dezelfde toets op de begin-url en op elke redirect.
export async function safeFetch(raw, init = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, { ...init, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) return res;
    url = await assertPublicUrl(new URL(res.headers.get('location'), url).toString());
  }
  throw new UnsafeUrlError('Te veel redirects');
}
