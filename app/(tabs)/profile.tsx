import { useState } from 'react';
import { WalkDudley } from '@/components/dudley/WalkDudley';
import { StyleSheet, TouchableOpacity, Image, ScrollView, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { useJourney } from '@/hooks/useJourney';
import { confirm, notify } from '@/lib/notify';
import { formatTimer } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useNotifications } from '@/providers/NotificationProvider';

export default function ProfileScreen() {
  const { profile, packs, signOut, refreshProfile } = useAuth();
  const { permission, requestPermission, openSystemSettings } = useNotifications();
  const [pushBusy, setPushBusy] = useState(false);
  const pushEnabled = profile?.push_enabled ?? true;
  const setPushEnabled = async (enabled: boolean) => {
    if (!profile || pushBusy) return;
    setPushBusy(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ push_enabled: enabled })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
    } catch (err: any) {
      notify('Error', err.message ?? 'Could not update notifications');
    } finally {
      setPushBusy(false);
    }
  };
  const { activeJourney, startJourney, endJourney, journeyDuration, loading: journeyLoading } = useJourney();
  const [walkBusy, setWalkBusy] = useState(false);
  const changeWalk = async () => {
    if (walkBusy) return;
    setWalkBusy(true);
    try {
      if (activeJourney) await endJourney();
      else await startJourney();
    } finally { setWalkBusy(false); }
  };
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];

  const handleSignOut = () => {
    confirm('Sign Out', 'Are you sure?', signOut, 'Sign Out');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.profileSection}>
        {profile?.avatar_url && (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        )}
        <Text style={styles.name}>{profile?.display_name ?? 'User'}</Text>
        {packs.map((pack) => (
          <Text key={pack.id} style={styles.partnerText}>
            {pack.name} · {pack.members.length} {pack.members.length === 1 ? 'member' : 'members'}
          </Text>
        ))}
        <TouchableOpacity onPress={() => router.push('/(auth)/packs')}>
          <Text style={styles.managePacksText}>Manage Packs</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.journeySection, { backgroundColor: c.card }]}>
        <Text style={styles.sectionTitle}>Walk</Text>
        <WalkDudley journeyId={activeJourney?.id ?? null} loading={journeyLoading} />
        {activeJourney ? (
          <>
            <Text style={styles.timer}>{formatTimer(journeyDuration)}</Text>
            <TouchableOpacity style={styles.endButton} accessibilityRole="button" disabled={walkBusy || journeyLoading} onPress={changeWalk}>
              <Text style={styles.endButtonText}>{walkBusy ? 'Ending…' : 'End Walk'}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.startButton} accessibilityRole="button" disabled={walkBusy || journeyLoading} onPress={changeWalk}>
            <Text style={styles.startButtonText}>{walkBusy ? 'Starting…' : 'Start Walk'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {Platform.OS !== 'web' && (
        <View style={[styles.journeySection, { backgroundColor: c.card }]}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          {permission === 'granted' ? (
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Pack activity pings</Text>
              <Switch value={pushEnabled} disabled={pushBusy} onValueChange={setPushEnabled} />
            </View>
          ) : permission === 'denied' ? (
            <>
              <Text style={styles.helpText}>Notifications are off in system settings.</Text>
              <TouchableOpacity style={styles.startButton} accessibilityRole="button" onPress={openSystemSettings}>
                <Text style={styles.startButtonText}>Open Settings</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.helpText}>Get a ping when a packmate spots something or finds your quest.</Text>
              <TouchableOpacity style={styles.startButton} accessibilityRole="button" onPress={() => requestPermission()}>
                <Text style={styles.startButtonText}>Enable Notifications</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  partnerText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  managePacksText: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  journeySection: {
    alignItems: 'center',
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
  },
  toggleLabel: {
    fontSize: 16,
  },
  helpText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 12,
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    fontFamily: 'SpaceMono',
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: '#34A853',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: '#EA4335',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  endButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 'auto',
  },
  signOutText: {
    color: '#EA4335',
    fontSize: 16,
  },
});
