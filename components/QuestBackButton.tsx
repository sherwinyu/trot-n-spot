import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export function QuestBackButton() {
  const router = useRouter();
  const c = Colors[useColorScheme() ?? 'light'];
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };
  return (
    <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back to quests" style={styles.button}>
      <Text style={{ color: c.tint, fontSize: 16 }}>‹ Back</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({ button: { minHeight: 44, minWidth: 80, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 16 } });
