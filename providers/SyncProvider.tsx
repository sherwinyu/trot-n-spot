import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { getQueue } from '@/lib/offline';
import { flushPendingMutations } from '@/lib/sync';
import { useAuth } from '@/providers/AuthProvider';

type SyncContextType = {
  pendingCount: number;
  // null until expo-network reports; true/false afterwards.
  isOnline: boolean | null;
  flush: () => Promise<void>;
  refreshPendingCount: () => Promise<void>;
};

const SyncContext = createContext<SyncContextType>({
  pendingCount: 0,
  isOnline: null,
  flush: async () => {},
  refreshPendingCount: async () => {},
});

function reachable(state: Network.NetworkState): boolean {
  return !!state.isConnected && state.isInternetReachable !== false;
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  const userId = session?.user.id;

  const refreshPendingCount = useCallback(async () => {
    const queue = userId ? await getQueue(userId) : [];
    setPendingCount(queue.length);
  }, [userId]);

  const flush = useCallback(async () => {
    if (userId) await flushPendingMutations(userId);
    await refreshPendingCount();
  }, [userId, refreshPendingCount]);

  useEffect(() => {
    Network.getNetworkStateAsync()
      .then((state) => setIsOnline(reachable(state)))
      .catch(() => {});
    const sub = Network.addNetworkStateListener((state) => setIsOnline(reachable(state)));
    return () => sub.remove();
  }, []);

  // Flush whenever we come back online, the app foregrounds, or on sign-in.
  useEffect(() => {
    if (!session) return;

    flush();

    const netSub = Network.addNetworkStateListener((state) => {
      if (reachable(state)) flush();
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
    <SyncContext.Provider value={{ pendingCount, isOnline, flush, refreshPendingCount }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
