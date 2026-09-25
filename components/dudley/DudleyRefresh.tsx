import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, RefreshControl, ScrollViewProps, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { useIsFocused } from '@react-navigation/native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { PULL_THRESHOLD, useDudleyRefresh } from '@/hooks/useDudleyRefresh';
import { useMotionAllowed } from './Dudley';

const atlas = require('./assets/peek-sniff.webp');
const SIZE = 112;
type Props = {
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
  hidden?: boolean;
  gesturesEnabled?: boolean;
  children: (props: ScrollViewProps) => ReactNode;
};

/**
 * A shared replacement for RefreshControl on feed, history and groceries.
 * Native lists keep their own scroll gesture: iOS shows Dudley in the over-scroll
 * bounce. Android has no bounce, so a pull that starts at the top of the list is
 * claimed by a capture PanResponder once it is clearly vertical (taps and short
 * drifts stay with the list's children) and tracked by touch distance; an
 * invisible RefreshControl remains as the fallback when the native scroll wins.
 * Web pulls are tracked from DOM touch/mouse events.
 */
export function DudleyRefresh({ onRefresh, disabled = false, hidden = false, gesturesEnabled = true, children }: Props) {
  const focused = useIsFocused();
  const motion = useMotionAllowed();
  const c = Colors[useColorScheme() ?? 'light'];
  const { height, bounce, phase, distance, error, controls } = useDudleyRefresh(onRefresh, disabled || hidden, motion, focused, gesturesEnabled);
  const lift = useRef(Animated.add(height, bounce)).current;
  const root = useRef<View>(null);
  const pop = useRef(new Animated.Value(0)).current;
  const [shake, setShake] = useState(0);
  const busy = phase === 'pop' || phase === 'refresh';
  const ready = distance >= PULL_THRESHOLD;

  useEffect(() => {
    pop.stopAnimation();
    pop.setValue(0);
    if (phase !== 'pop' || !motion) return;
    const animation = Animated.sequence([
      Animated.timing(pop, { toValue: 1, duration: 160, useNativeDriver: false }),
      Animated.spring(pop, { toValue: 0, speed: 24, bounciness: 9, useNativeDriver: false }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [phase, motion, pop]);

  useEffect(() => {
    setShake(0);
    if (phase !== 'refresh' || !motion) return;
    const timer = setInterval(() => setShake(n => (n + 1) % 8), 90);
    return () => clearInterval(timer);
  }, [phase, motion]);

  // Web scroll views use browser scrolling. A non-passive listener prevents only
  // eligible downward pulls, leaving normal scrolling, taps and zoom untouched.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = root.current as unknown as HTMLElement;
    let start: { x: number; y: number } | null = null;
    let claimed = false;
    let suppressClick = false;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const begin = (x: number, y: number, target: EventTarget | null) => {
      start = null; claimed = false; suppressClick = false; clearTimeout(clickTimer);
      if ((target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      controls.begin(); start = { x, y }; claimed = false;
    };
    const move = (event: Event, x: number, y: number, touches = 1) => {
      if (!start) return;
      if (touches !== 1) { controls.cancel(); start = null; return; }
      const dx = x - start.x, dy = y - start.y;
      if (claimed || controls.canMove(dx, dy, touches)) {
        claimed = true; suppressClick = true; event.preventDefault(); controls.move(dy);
      }
    };
    const end = () => {
      if (claimed) controls.release();
      start = null; claimed = false;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { suppressClick = false; }, 0);
    };
    const click = (e: MouseEvent) => { if (suppressClick) { e.preventDefault(); e.stopPropagation(); suppressClick = false; } };
    const cancel = () => { controls.cancel(); start = null; claimed = false; suppressClick = false; clearTimeout(clickTimer); };
    const touchStart = (e: TouchEvent) => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY, e.target); else cancel(); };
    const touchMove = (e: TouchEvent) => { if (e.touches[0]) move(e, e.touches[0].clientX, e.touches[0].clientY, e.touches.length); };
    const mouseStart = (e: MouseEvent) => { if (e.button === 0) begin(e.clientX, e.clientY, e.target); };
    const mouseMove = (e: MouseEvent) => move(e, e.clientX, e.clientY);
    node.addEventListener('touchstart', touchStart, { passive: true });
    node.addEventListener('touchmove', touchMove, { passive: false });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', cancel);
    node.addEventListener('mousedown', mouseStart);
    node.addEventListener('click', click, true);
    document.addEventListener('mousemove', mouseMove);
    document.addEventListener('mouseup', end);
    window.addEventListener('blur', cancel);
    return () => {
      node.removeEventListener('touchstart', touchStart); node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('touchend', end); node.removeEventListener('touchcancel', cancel);
      node.removeEventListener('mousedown', mouseStart); document.removeEventListener('mousemove', mouseMove);
      node.removeEventListener('click', click, true); clearTimeout(clickTimer);
      document.removeEventListener('mouseup', end); window.removeEventListener('blur', cancel);
    };
  }, [controls]);

  const android = Platform.OS === 'android' && gesturesEnabled && !hidden;
  const pan = useMemo(() => !android ? undefined : PanResponder.create({
    onStartShouldSetPanResponderCapture: (_, g) => {
      if (g.numberActiveTouches !== 1 || TextInput.State.currentlyFocusedInput()) controls.cancel();
      else controls.begin();
      return false;
    },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (TextInput.State.currentlyFocusedInput()) { controls.cancel(); return false; }
      return controls.canMove(g.dx, g.dy, g.numberActiveTouches);
    },
    onPanResponderGrant: (_, g) => controls.move(g.dy),
    onPanResponderMove: (_, g) => { if (g.numberActiveTouches !== 1) controls.cancel(); else controls.move(g.dy); },
    onPanResponderRelease: controls.release,
    onPanResponderTerminate: controls.cancel,
    onPanResponderTerminationRequest: () => false,
  }), [android, controls]);

  const frame = !motion ? 0 : phase === 'pop' ? 3 : phase === 'refresh'
    ? [4, 5, 6, 7, 4, 5, 6, 7][shake]
    : distance < 42 ? 0 : ready ? 2 : 1;
  const label = busy ? 'Dudley’s shaking things up…' : ready ? 'Let go — Dudley’s ready!' : 'A little further…';
  return (
    <View ref={root} testID="dudley-refresh" style={[styles.container, Platform.OS === 'web' && ({ userSelect: 'none' } as ViewStyle)]}>
      {!hidden && <View style={styles.toolbar}>
        <Text accessibilityLiveRegion="polite" style={[styles.caption, { color: c.muted }]}>
          {error ? 'Couldn’t refresh. Try again.' : busy || phase === 'pull' ? label : ''}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh" accessibilityState={{ busy, disabled: disabled || busy }}
          disabled={disabled || busy} onPress={() => void controls.refresh()} style={styles.button}>
          <Text style={{ color: c.tint, opacity: disabled || busy ? 0.5 : 1, fontSize: 13, fontWeight: '600' }}>Refresh</Text>
        </Pressable>
      </View>}
      <View style={styles.body} {...pan?.panHandlers}>
        <Animated.View testID="dudley-refresh-reveal" style={[styles.reveal, { height, backgroundColor: c.background }]} />
        {/* Dudley climbs and grows while the list slides down (the reveal spacer, or the list's own
            over-scroll bounce), so he rises out from behind its edge; once fully out his paws ride on
            the list edge like a shelf. The list itself paints no background, so he shows through the gap. */}
        <Animated.View pointerEvents="none" style={[styles.stage, { height: lift }]}>
          <Animated.View style={{ position: 'absolute', alignSelf: 'center', bottom: lift.interpolate({ inputRange: [0, 128], outputRange: [-160, 0], extrapolate: 'clamp' }) }}>
            <Animated.View testID={`dudley-refresh-frame-${frame}`} style={{ width: SIZE, height: SIZE, overflow: 'hidden', transform: [
              { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [0, -14] }) },
              { scale: Animated.multiply(
                lift.interpolate({ inputRange: [0, 128], outputRange: [0.86, 1], extrapolate: 'clamp' }),
                pop.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
              ) },
            ] }}>
              <Image source={atlas} accessible={false} contentFit="fill" transition={0} style={{ position: 'absolute', width: SIZE * 4, height: SIZE * 2, left: -(frame % 4) * SIZE, top: -Math.floor(frame / 4) * SIZE }} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
        {children({
          onScroll: event => {
            controls.scroll(event.nativeEvent.contentOffset.y);
            if (Platform.OS === 'ios') controls.track(event.nativeEvent.contentOffset.y);
          },
          scrollEventThrottle: 16,
          bounces: Platform.OS === 'ios',
          overScrollMode: 'never',
          ...(Platform.OS === 'ios' ? { onScrollBeginDrag: controls.beginDrag, onScrollEndDrag: controls.release } : {}),
          ...(android ? {
            scrollEnabled: phase !== 'pull',
            // Off-screen and transparent: only the native pull detection is wanted.
            refreshControl: <RefreshControl refreshing={busy} enabled={!disabled} onRefresh={() => void controls.refresh()}
              colors={['transparent']} progressBackgroundColor="transparent" progressViewOffset={-200} />,
          } : {}),
          // Prevent the browser's page reload gesture, while retaining list scrolling.
          ...(Platform.OS === 'web' ? { scrollEnabled: phase !== 'pull', style: { flex: 1, overscrollBehaviorY: 'contain' } as ScrollViewProps['style'] } : {}),
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  toolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 12 },
  button: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  reveal: { overflow: 'hidden' },
  stage: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  caption: { flex: 1, fontSize: 12, paddingHorizontal: 4 },
});
