import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/Themed';
import { Dudley } from '@/components/dudley/Dudley';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export function QuestCompletion({ queued, onContinue }: { queued: boolean; onContinue: () => void }) {
  const c = Colors[useColorScheme() ?? 'light'];
  return (
    <View style={styles.panel}>
      <Dudley mood={queued ? 'nap' : 'wiggle'} animate={!queued} durationMs={1120} interactive />
      <Text style={styles.title}>{queued ? 'Saved on this device' : 'Nice spot!'}</Text>
      <Text accessibilityLiveRegion="polite" style={[styles.message, { color: c.muted }]}>
        {queued ? "Waiting to sync — we'll confirm your find when you're back online." : 'Quest complete. Dudley is very proud of his human.'}
      </Text>
      <Pressable accessibilityRole="button" onPress={onContinue} style={[styles.button, { borderColor: c.tint }]}>
        <Text style={{ color: c.tint, fontWeight: '600' }}>Back to quests</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 24, fontWeight: '600', textAlign: 'center' },
  message: { textAlign: 'center', lineHeight: 22 },
  button: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingVertical: 12, paddingHorizontal: 24 },
});
