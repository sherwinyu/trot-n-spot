import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';

/** Supply the two WebCrypto operations Supabase's PKCE flow needs on Hermes. */
export function installAuthCrypto() {
  if (Platform.OS === 'web') return;

  // This is deliberately a partial WebCrypto adapter, not a general polyfill.
  const runtime = globalThis as unknown as {
    crypto?: {
      getRandomValues?: typeof ExpoCrypto.getRandomValues;
      subtle?: { digest: (algorithm: string | { name: string }, data: BufferSource) => Promise<ArrayBuffer> };
    };
  };
  runtime.crypto ??= {};
  runtime.crypto.getRandomValues ??= ExpoCrypto.getRandomValues;
  runtime.crypto.subtle ??= {
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') {
        throw new Error('The native auth crypto adapter only supports SHA-256.');
      }
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}
