type CryptoSource = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function browserCrypto(): CryptoSource | null {
  const source = globalThis.crypto;
  if (!source) return null;
  return {
    randomUUID: typeof source.randomUUID === 'function' ? source.randomUUID.bind(source) : undefined,
    getRandomValues: typeof source.getRandomValues === 'function'
      ? (array) => source.getRandomValues(array)
      : undefined,
  };
}

export function newClientId(source?: CryptoSource | null) {
  const cryptoSource = source === undefined ? browserCrypto() : source;
  if (cryptoSource?.randomUUID) return cryptoSource.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoSource?.getRandomValues) cryptoSource.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
