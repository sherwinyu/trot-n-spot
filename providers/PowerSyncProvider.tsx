import React from 'react';

// TODO: Full PowerSync setup
// - Define PowerSync schema mirroring Supabase tables
// - Create PowerSyncDatabase instance
// - Implement SupabaseConnector (fetchCredentials, uploadData)
// - Connect after auth session established
// - Disconnect on sign out

export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function usePowerSync() {
  // TODO: Return PowerSync database instance
  return null;
}
