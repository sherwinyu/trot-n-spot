import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { Text } from '@/components/Themed';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const assets = {
  trot: { loop: require('./assets/trot.webp'), still: require('./assets/trot-0.png') },
  sniff: { loop: require('./assets/sniff.webp'), still: require('./assets/sniff-0.png') },
  wiggle: { loop: require('./assets/wiggle.webp'), still: require('./assets/wiggle-0.png') },
  nap: { loop: require('./assets/nap.webp'), still: require('./assets/nap-0.png') },
};
export type DudleyMood = keyof typeof assets;

function useMotionAllowed() {
  const focused = useIsFocused();
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [visible, setVisible] = useState(Platform.OS !== 'web' || typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      changed = true;
      setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive && !changed) setReduced(value);
    }).catch(() => { /* Keep the still image if preferences are unavailable. */ });
    const app = AppState.addEventListener('change', value => setForeground(value === 'active'));
    const onVisibility = () => setVisible(!document.hidden);
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      motion.remove();
      app.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return focused && foreground && visible && !reduced;
}

type Props = {
  mood?: DudleyMood;
  width?: number;
  animate?: boolean;
  durationMs?: number;
  interactive?: boolean;
};

/** Finite moments expire even off-screen; returning to a tab never replays success. */
export function Dudley({ mood = 'trot', width = 144, animate = true, durationMs, interactive = false }: Props) {
  const motionAllowed = useMotionAllowed();
  const c = Colors[useColorScheme() ?? 'light'];
  const [finished, setFinished] = useState(false);
  const [boop, setBoop] = useState(0);
  const [booping, setBooping] = useState(false);
  useEffect(() => {
    setFinished(false);
    if (durationMs === undefined) return;
    const timer = setTimeout(() => setFinished(true), durationMs);
    return () => clearTimeout(timer);
  }, [mood, durationMs]);
  useEffect(() => {
    if (!boop) return;
    setBooping(true);
    const timer = setTimeout(() => setBooping(false), 560);
    return () => clearTimeout(timer);
  }, [boop]);
  const currentMood = booping ? 'wiggle' : mood;
  const playing = motionAllowed && (booping || (animate && !finished));
  const art = (
    <Image
      key={`${currentMood}-${playing}-${boop}`}
      testID="dudley-image"
      source={assets[currentMood][playing ? 'loop' : 'still']}
      style={{ width, height: width * 2 / 3 }}
      contentFit="contain"
      transition={0}
      accessible={false}
      accessibilityLabel=""
    />
  );
  return (
    <View style={styles.mascot}>
      {interactive ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Boop Dudley" onPress={() => setBoop(n => n + 1)} style={styles.boop}>
          {art}
        </Pressable>
      ) : art}
      {interactive && booping && <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: c.muted }]}>Boop received. Tail activated.</Text>}
    </View>
  );
}

export function useDelayedVisibility(active: boolean, delayMs = 200) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (!active) return;
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return active && ready;
}

export function DudleyLoading({ loading, mood = 'trot', label = 'Loading quests…', compact = false }: {
  loading: boolean; mood?: DudleyMood; label?: string; compact?: boolean;
}) {
  const visible = useDelayedVisibility(loading);
  const c = Colors[useColorScheme() ?? 'light'];
  if (!visible) return null;
  return (
    <View style={[styles.loading, compact && styles.compact]}>
      <Dudley mood={mood} width={compact ? 80 : 144} />
      <Text accessibilityLiveRegion="polite" style={{ color: c.muted, flexShrink: 1 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mascot: { alignItems: 'center' },
  boop: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: 12, textAlign: 'center', paddingTop: 4 },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  compact: { flexDirection: 'row', justifyContent: 'flex-start', padding: 4 },
});
