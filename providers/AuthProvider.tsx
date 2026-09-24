import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { signInWithGoogle, signOut as authSignOut } from '@/lib/auth';
import { Profile, PackWithMembers } from '@/types/database';
import { clearSignedPhotoUrlCache, hydrateSignedPhotoUrlCache } from '@/lib/signedUrls';
import { cacheClearAll, cacheGet, cacheSet } from '@/lib/offline';
import { resetPrefetchMemory } from '@/lib/prefetch';
import { removePushToken } from '@/lib/notifications';

type CachedAccount = {
  profile: Profile;
  packs: PackWithMembers[];
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  packs: PackWithMembers[];
  packsReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  packs: [],
  packsReady: false,
  signIn: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [packs, setPacks] = useState<PackWithMembers[]>([]);
  // Routing to pack onboarding must wait for a real answer, not an
  // empty initial state — otherwise every launch flashes the screen.
  const [packsReady, setPacksReady] = useState(false);

  // Last-good profile + packs, so a cold start with no signal still lands
  // on the feed instead of onboarding or a blank screen.
  const loadCachedAccount = useCallback(async (userId: string) => {
    const cached = await cacheGet<CachedAccount>(`account:${userId}`);
    if (!cached) return;
    setProfile((prev) => prev ?? cached.profile);
    setPacks((prev) => (prev.length > 0 ? prev : cached.packs));
    setPacksReady(true);
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    hydrateSignedPhotoUrlCache();
    const cachedLoad = loadCachedAccount(userId);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return;
    const nextProfile = data as Profile;
    setProfile(nextProfile);

    const { data: packRows, error: packError } = await supabase
      .from('packs')
      .select('*, pack_members(pack_id, user_id, role, status, joined_at, profile:profiles(*)), pack_invites(code, revoked_at)')
      .order('created_at', { ascending: true });

    if (!packError && packRows) {
      const nextPacks: PackWithMembers[] = packRows.map((row: any) => {
        const { pack_members, pack_invites, ...pack } = row;
        return {
          ...pack,
          members: (pack_members ?? []).filter((m: any) => m.status === 'active'),
          invite_code: (pack_invites ?? []).find((i: any) => !i.revoked_at)?.code ?? null,
        };
      });
      // Let the cache read settle first so it can't overwrite fresh data.
      await cachedLoad;
      setPacks(nextPacks);
      setPacksReady(true);
      cacheSet(`account:${userId}`, { profile: nextProfile, packs: nextPacks });
    }
  }, [loadCachedAccount]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) fetchProfile(s.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setPacks([]);
        setPacksReady(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async () => {
    await signInWithGoogle();
  }, []);

  const signOut = useCallback(async () => {
    // Needs the outgoing session's RLS, so it runs before the sign-out.
    await removePushToken().catch(() => {});
    await authSignOut();
    clearSignedPhotoUrlCache();
    resetPrefetchMemory();
    await cacheClearAll().catch(() => {});
    if (Platform.OS !== 'web') {
      await Promise.allSettled([
        ExpoImage.clearMemoryCache(),
        ExpoImage.clearDiskCache(),
      ]);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setPacks([]);
    setPacksReady(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider value={{ user, session, loading, profile, packs, packsReady, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Convenience lookups over the packs list, for feed cards and quest
// detail ("For Nadia", "Found by Dave", pack name labels).
export function usePackLookups() {
  const { packs } = useAuth();
  return useMemo(() => {
    const memberNames: Record<string, string> = {};
    const packNames: Record<string, string> = {};
    for (const pack of packs) {
      packNames[pack.id] = pack.name;
      for (const member of pack.members) {
        if (member.profile) memberNames[member.user_id] = member.profile.display_name;
      }
    }
    return { memberNames, packNames };
  }, [packs]);
}
