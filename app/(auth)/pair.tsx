import { StyleSheet, TouchableOpacity, TextInput, Share, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { notify } from '@/lib/notify';

export default function PairScreen() {
  const { profile, refreshProfile } = useAuth();
  const c = Colors[useColorScheme() ?? 'light'];
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePair = async () => {
    if (!code.trim()) {
      notify('Error', 'Please enter a pair code');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('pair_with_partner', {
        code: code.trim().toUpperCase(),
      });

      if (error) throw error;
      if (data?.error) {
        notify('Error', data.error);
        return;
      }

      notify('Paired!', `You're now paired with ${data.partner_name}`);
      await refreshProfile();
    } catch (err: any) {
      notify('Error', err.message ?? 'Failed to pair');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!profile?.pair_code) return;
    await Share.share({
      message: `Join me on Quest! My pair code is: ${profile.pair_code}`,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pair with Partner</Text>
      <Text style={styles.subtitle}>
        Share your code or enter your partner's code
      </Text>

      <View style={styles.codeSection}>
        <Text style={styles.label}>Your Code</Text>
        <Text style={styles.pairCode}>{profile?.pair_code ?? '...'}</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
          <Text style={styles.shareButtonText}>Share Code</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.inputSection}>
        <Text style={styles.label}>Partner's Code</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: c.inputBackground, color: c.inputText, borderColor: c.border },
          ]}
          value={code}
          onChangeText={setCode}
          placeholder="Enter 6-letter code"
          placeholderTextColor={c.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <TouchableOpacity
          style={styles.pairButton}
          onPress={handlePair}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.pairButtonText}>Pair</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 32,
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
    marginBottom: 32,
  },
  codeSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  pairCode: {
    fontSize: 40,
    fontWeight: 'bold',
    letterSpacing: 8,
    fontFamily: 'SpaceMono',
  },
  shareButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4285F4',
  },
  shareButtonText: {
    color: '#4285F4',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 24,
  },
  inputSection: {
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    fontSize: 24,
    letterSpacing: 6,
    textAlign: 'center',
    width: '100%',
    fontFamily: 'SpaceMono',
  },
  pairButton: {
    backgroundColor: '#4285F4',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginTop: 16,
  },
  pairButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
