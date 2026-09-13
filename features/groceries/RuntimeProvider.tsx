import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { createReceiptClient } from './api';
import { createReceiptOutbox } from './outbox';

function createRuntime(userId: string) {
  const client = createReceiptClient(userId);
  return { ...client, ...createReceiptOutbox(client, userId) };
}
const Context = createContext<ReturnType<typeof createRuntime> | null>(null);

export function ReceiptRuntimeProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const runtime = useMemo(() => createRuntime(userId), [userId]);
  useEffect(() => {
    runtime.activate();
    return () => runtime.dispose();
  }, [runtime]);
  return <Context.Provider value={runtime}>{children}</Context.Provider>;
}

export function useReceiptRuntime() {
  const runtime = useContext(Context);
  if (!runtime) throw new Error('ReceiptRuntimeProvider is missing');
  return runtime;
}
