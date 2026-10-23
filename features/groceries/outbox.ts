import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import type { ReceiptClient } from './api';

export type Upload = {
  id: string;
  uri: string;
  name: string;
  mime: string;
  status: 'queued' | 'uploading' | 'failed';
  error?: string;
  targetURL: string;
  createdAt: string;
};
export type Picked = {
  uri: string;
  fileName?: string | null;
  name?: string;
  mimeType?: string | null;
  file?: File;
};
export function createReceiptOutbox(client: ReceiptClient, userId: string) {
  const { api, connection } = client;
  const scope = `groceries.${userId}`;
  let queue: Upload[] = [];
  let lock: Promise<unknown> = Promise.resolve();
  let running = false;
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const snapshot = () => queue;
  function mutate(fn: () => void) {
    const next = lock.then(async () => {
      fn();
      queue = [...queue];
      await AsyncStorage.setItem(`${scope}.outbox`, JSON.stringify(queue));
      listeners.forEach((fn) => fn());
    });
    lock = next.catch(() => {});
    return next;
  }
  function webDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open('bowl-images', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('images');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function webBlob(
    id: string,
    action: 'get' | 'put' | 'delete',
    blob?: Blob,
  ): Promise<Blob | undefined> {
    const db = await webDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(
          'images',
          action === 'get' ? 'readonly' : 'readwrite',
        );
        const store = tx.objectStore('images');
        const r =
          action === 'get'
            ? store.get(id)
            : action === 'put'
              ? store.put(blob, id)
              : store.delete(id);
        tx.oncomplete = () => resolve(action === 'get' ? r.result : undefined);
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function initOutbox() {
    const saved = await AsyncStorage.getItem(`${scope}.outbox`);
    queue = saved ? JSON.parse(saved) : [];
    await mutate(() => {
      queue = queue.map((u) =>
        u.status === 'uploading' ? { ...u, status: 'queued' } : u,
      );
    });
  }
  async function enqueue(
    assets: Picked[],
    onProgress?: (done: number) => void,
  ) {
    let done = 0;
    for (const asset of assets) {
      if (!client.isActive())
        throw new Error(
          'Receipt session ended; remaining photos were not saved.',
        );
      const id = Crypto.randomUUID(),
        name = asset.fileName ?? asset.name ?? 'receipt.jpg',
        mime = asset.mimeType ?? 'image/jpeg';
      let uri = asset.uri;
      if (Platform.OS === 'web') {
        const blob = asset.file ?? (await (await fetch(uri)).blob());
        await webBlob(id, 'put', blob);
        uri = id;
      } else {
        const dir = FS.documentDirectory + `receipts/${userId}/`;
        await FS.makeDirectoryAsync(dir, { intermediates: true });
        uri = dir + id;
        await FS.copyAsync({ from: asset.uri, to: uri });
      }
      await mutate(() => {
        queue.push({
          id,
          uri,
          name,
          mime,
          status: 'queued',
          targetURL: connection().url,
          createdAt: new Date().toISOString(),
        });
      });
      onProgress?.(++done);
    }
  }
  async function deleteLocal(upload: Upload) {
    if (Platform.OS === 'web') await webBlob(upload.id, 'delete');
    else await FS.deleteAsync(upload.uri, { idempotent: true });
  }
  async function retryUploads() {
    await mutate(() => {
      queue = queue.map((u) => ({ ...u, status: 'queued', error: undefined }));
    });
    await drain();
  }
  async function discardUpload(id: string) {
    const upload = queue.find((u) => u.id === id);
    if (!upload || upload.status === 'uploading') return;
    await mutate(() => {
      queue = queue.filter((u) => u.id !== id);
    });
    await deleteLocal(upload);
  }
  async function uploadOne(upload: Upload) {
    const target = connection();
    try {
      if (upload.targetURL !== target.url)
        throw new Error(
          'Reconnect to the server where this receipt was captured.',
        );
      await mutate(() => {
        queue = queue.map((u) =>
          u.id === upload.id
            ? { ...u, status: 'uploading', error: undefined }
            : u,
        );
      });
      const form = new FormData();
      if (Platform.OS === 'web') {
        const blob = await webBlob(upload.id, 'get');
        if (!blob)
          throw new Error('Local image missing. Please import it again.');
        form.append('image', blob, upload.name);
      } else
        form.append('image', {
          uri: upload.uri,
          name: upload.name,
          type: upload.mime,
        } as any);
      await api(
        '/receipts',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': upload.id },
          body: form,
        },
        target,
        120_000,
      );
      if (!client.isActive()) return;
      await mutate(() => {
        queue = queue.filter((u) => u.id !== upload.id);
      });
      await deleteLocal(upload).catch(() => {});
    } catch (error) {
      if (!client.isActive()) return;
      await mutate(() => {
        queue = queue.map((u) =>
          u.id === upload.id
            ? {
                ...u,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Upload failed',
              }
            : u,
        );
      });
    }
  }
  async function drain() {
    if (running || !connection().url || !client.isActive()) return;
    running = true;
    try {
      while (client.isActive()) {
        const next = queue.filter((u) => u.status === 'queued').slice(0, 3);
        if (!next.length) break;
        await Promise.all(next.map(uploadOne));
      }
    } finally {
      running = false;
      listeners.forEach((fn) => fn());
    }
  }

  return {
    drain,
    enqueue,
    initOutbox,
    retryUploads,
    subscribe,
    snapshot,
    discardUpload,
  };
}
