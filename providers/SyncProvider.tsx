import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { getQueue } from '@/lib/offline';
import { flushPendingMutations } from '@/lib/sync';
import { useAuth } from '@/providers/AuthProvider';

type SyncContextType = {
  pendingCount: number;
  flush: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType>({
  pendingCount: 0,
  flush: async () => {},
  refreshPendingCount: async () => {},
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    const queue = await getQueue();
    setPendingCount(queue.length);
  }, []);

  const flush = useCallback(async () => {
    await flushPendingMutations();
    await refreshPendingCount();
  }, [refreshPendingCount]);

  // Flush whenever we come back online, the app foregrounds, or on sign-in.
  useEffect(() => {
    if (!session) return;

    flush();

    const netSub = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) flush();
    });
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') flush();
    });

    return () => {
      netSub.remove();
      appSub.remove();
    };
  }, [session, flush]);

  return (
    <SyncContext.Provider value={{ pendingCount, flush, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
