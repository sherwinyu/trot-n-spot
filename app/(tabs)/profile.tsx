import { StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';
import { useJourney } from '@/hooks/useJourney';

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ProfileScreen() {
  const { profile, partner, signOut } = useAuth();
  const { activeJourney, startJourney, endJourney, journeyDuration } = useJourney();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.profileSection}>
        {profile?.avatar_url && (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        )}
        <Text style={styles.name}>{profile?.display_name ?? 'User'}</Text>
        {partner && (
          <Text style={styles.partnerText}>
            Paired with {partner.display_name}
          </Text>
        )}
      </View>

      <View style={styles.journeySection}>
        <Text style={styles.sectionTitle}>Walk</Text>
        {activeJourney ? (
          <>
            <Text style={styles.timer}>{formatTimer(journeyDuration)}</Text>
            <TouchableOpacity style={styles.endButton} onPress={endJourney}>
              <Text style={styles.endButtonText}>End Walk</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.startButton} onPress={startJourney}>
            <Text style={styles.startButtonText}>Start Walk</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
