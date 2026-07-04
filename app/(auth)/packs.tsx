import { StyleSheet, TouchableOpacity, TextInput, Share, ActivityIndicator, ScrollView } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { notify, confirm } from '@/lib/notify';
import { PackWithMembers } from '@/types/database';

function PackCard({ pack, onChanged }: { pack: PackWithMembers; onChanged: () => Promise<void> }) {
  const { user } = useAuth();
  const c = Colors[useColorScheme() ?? 'light'];
  const isOwner = pack.owner_id === user?.id;
  const canShareInvite = isOwner || pack.allow_member_invites;

  const handleShare = async () => {
    if (!pack.invite_code) return;
    await Share.share({
      message: `Join my pack "${pack.name}" on TrotNSpot! Invite code: ${pack.invite_code}`,
    });
  };

  const handleLeave = () => {
    confirm('Leave Pack', `Leave "${pack.name}"?`, async () => {
      const { data, error } = await supabase.rpc('leave_pack', { p_pack_id: pack.id });
      if (error || data?.error) {
        notify('Error', data?.error ?? error?.message ?? 'Failed to leave pack');
        return;
      }
      await onChanged();
    }, 'Leave');
  };

  return (
    <View style={[styles.packCard, { backgroundColor: c.card }]}>
      <Text style={styles.packName}>{pack.name}</Text>
      <Text style={styles.packMeta}>
        {pack.members.map((m) => m.profile?.display_name ?? '?').join(', ')}
      </Text>
      {canShareInvite && pack.invite_code && (
        <View style={styles.inviteRow}>
          <Text style={styles.inviteCode}>{pack.invite_code}</Text>
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>Share Invite</Text>
          </TouchableOpacity>
        </View>
      )}
      {!isOwner && (
        <TouchableOpacity onPress={handleLeave}>
          <Text style={styles.leaveText}>Leave pack</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function PacksScreen() {
  const { packs, refreshProfile } = useAuth();
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const hasPacks = packs.length > 0;

  const handleCreate = async () => {
    if (!name.trim()) {
      notify('Error', 'Give your pack a name');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc('create_pack', { p_name: name.trim() });
      if (error) throw error;
      if (data?.error) {
        notify('Error', data.error);
        return;
      }
      notify('Pack created!', `Share invite code ${data.invite_code} to bring others in.`);
      setName('');
      await refreshProfile();
    } catch (err: any) {
      notify('Error', err.message ?? 'Failed to create pack');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!code.trim()) {
      notify('Error', 'Please enter an invite code');
      return;
    }
    setJoining(true);
    try {
      const { data, error } = await supabase.rpc('join_pack', {
        p_code: code.trim().toUpperCase(),
      });
      if (error) throw error;
      if (data?.error) {
        notify('Error', data.error);
        return;
      }
      notify('Joined!', `Welcome to ${data.pack_name}`);
      setCode('');
      await refreshProfile();
    } catch (err: any) {
      notify('Error', err.message ?? 'Failed to join pack');
    } finally {
      setJoining(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{hasPacks ? 'Your Packs' : 'Start Your Pack'}</Text>
      <Text style={styles.subtitle}>
        {hasPacks
          ? 'Create another pack or join one with an invite code'
          : 'Quests live inside a pack — a small circle of family, friends, or neighbors'}
      </Text>

      {packs.map((pack) => (
        <PackCard key={pack.id} pack={pack} onChanged={refreshProfile} />
      ))}

      <View style={styles.section}>
        <Text style={styles.label}>Create a Pack</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: c.inputBackground, color: c.inputText, borderColor: c.border },
          ]}
          value={name}
          onChangeText={setName}
          placeholder='e.g. "The Yus" or "Oak St Dog Walkers"'
          placeholderTextColor={c.placeholder}
          maxLength={40}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={creating}>
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Create Pack</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <Text style={styles.label}>Join a Pack</Text>
        <TextInput
          style={[
            styles.codeInput,
            { backgroundColor: c.inputBackground, color: c.inputText, borderColor: c.border },
          ]}
          value={code}
          onChangeText={setCode}
          placeholder="Enter 6-letter invite code"
          placeholderTextColor={c.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={handleJoin} disabled={joining}>
          {joining ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Join Pack</Text>
          )}
        </TouchableOpacity>
      </View>

      {hasPacks && (
        <TouchableOpacity style={styles.doneButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 32,
    paddingTop: 64,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  packCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  packName: {
    fontSize: 18,
    fontWeight: '600',
  },
  packMeta: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    backgroundColor: 'transparent',
  },
  inviteCode: {
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 4,
    fontFamily: 'SpaceMono',
  },
  shareButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  shareButtonText: {
    color: '#4285F4',
    fontWeight: '600',
  },
  leaveText: {
    color: '#EA4335',
    fontSize: 13,
    marginTop: 12,
  },
  section: {
    marginTop: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
  },
  codeInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 20,
    letterSpacing: 6,
    textAlign: 'center',
    fontFamily: 'SpaceMono',
  },
  primaryButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 24,
  },
  doneButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  doneButtonText: {
    color: '#4285F4',
    fontSize: 16,
    fontWeight: '600',
  },
});
