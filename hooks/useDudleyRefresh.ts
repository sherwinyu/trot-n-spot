import { useEffect, useRef, useState } from 'react';
import { Animated, AppState } from 'react-native';

export const PULL_THRESHOLD = 96;
export const REFRESH_HEIGHT = 128;
export const MAX_PULL = 164;
export type RefreshPhase = 'idle' | 'pull' | 'pop' | 'refresh' | 'settle';

/**
 * Owns gesture eligibility and the request lifetime, independently of the artwork.
 * `height` is the room the list makes for Dudley; `bounce` mirrors the native
 * over-scroll of the list itself (iOS), so the two add up to how far he is out.
 */
export function useDudleyRefresh(onRefresh: () => Promise<unknown>, disabled: boolean, motion: boolean, focused: boolean, gesturesEnabled = true) {
  const height = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<RefreshPhase>('idle');
  const [distance, setDistance] = useState(0);
  const [error, setError] = useState(false);
  const offset = useRef(0);
  const eligible = useRef(false);
  const dragging = useRef(false);
  const pull = useRef(0);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const popTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Gesture handlers stay stable while always using the current request and preferences.
  const latest = useRef({ onRefresh, disabled, motion, focused, gesturesEnabled });
  latest.current = { onRefresh, disabled, motion, focused, gesturesEnabled };

  const [controls] = useState(() => {
    const settle = () => {
      dragging.current = false;
      eligible.current = false;
      pull.current = 0;
      clearTimeout(popTimer.current);
      if (!alive.current) return;
      height.stopAnimation();
      bounce.stopAnimation();
      bounce.setValue(0);
      setDistance(0);
      setPhase('settle');
      Animated.timing(height, { toValue: 0, duration: latest.current.motion ? 180 : 0, useNativeDriver: false })
        .start(({ finished }) => { if (finished && alive.current) setPhase('idle'); });
    };
    const refresh = async () => {
      if (inFlight.current || latest.current.disabled || !latest.current.focused) return;
      inFlight.current = true;
      dragging.current = false;
      eligible.current = false;
      height.stopAnimation();
      bounce.stopAnimation();
      setError(false);
      setPhase(latest.current.motion ? 'pop' : 'refresh');
      Animated.timing(height, { toValue: REFRESH_HEIGHT, duration: latest.current.motion ? 180 : 0, useNativeDriver: false }).start();
      Animated.timing(bounce, { toValue: 0, duration: latest.current.motion ? 180 : 0, useNativeDriver: false }).start();
      popTimer.current = setTimeout(() => {
        if (alive.current && inFlight.current) setPhase('refresh');
      }, 400);
      try {
        // Start fetching immediately; animation never delays the request.
        await latest.current.onRefresh();
      } catch {
        if (alive.current) setError(true);
      } finally {
        inFlight.current = false;
        settle();
      }
    };
    return {
      refresh,
      begin: () => {
        eligible.current = latest.current.gesturesEnabled && !inFlight.current && !latest.current.disabled && latest.current.focused && offset.current <= 1;
      },
      // `slop` is how far a touch travels before it counts as a pull; Android must claim
      // before the list's own touch slop (~8dp) or the native scroll wins the gesture.
      canMove: (dx: number, dy: number, touches = 1, slop = 8) => {
        if (touches !== 1 || Math.abs(dx) > Math.max(10, Math.abs(dy))) eligible.current = false;
        return eligible.current && !inFlight.current && !latest.current.disabled && dy > slop && dy > Math.abs(dx) * 1.3;
      },
      move: (dy: number) => {
        if (!eligible.current || inFlight.current) return;
        dragging.current = true;
        height.stopAnimation();
        pull.current = Math.min(MAX_PULL, Math.max(0, dy * 0.6));
        height.setValue(pull.current);
        setDistance(pull.current);
        setPhase('pull');
      },
      // Native lists over-scroll themselves; follow the content offset instead of touches.
      beginDrag: () => {
        eligible.current = latest.current.gesturesEnabled && !inFlight.current && !latest.current.disabled && latest.current.focused;
      },
      track: (y: number) => {
        if (inFlight.current || !latest.current.gesturesEnabled || latest.current.disabled) return;
        const next = Math.min(MAX_PULL, Math.max(0, -y));
        bounce.setValue(next);
        if (!eligible.current || (!dragging.current && next === 0)) return;
        dragging.current = true;
        pull.current = next;
        setDistance(next);
        setPhase(next > 0 ? 'pull' : 'idle');
      },
      release: () => {
        if (!dragging.current) { eligible.current = false; return; }
        if (eligible.current && pull.current >= PULL_THRESHOLD && !latest.current.disabled) void refresh();
        else settle();
      },
      cancel: () => { if (!inFlight.current) settle(); },
      scroll: (y: number) => { offset.current = y; },
    };
  });

  useEffect(() => {
    alive.current = true;
    const listener = AppState.addEventListener('change', state => {
      if (state !== 'active') controls.cancel();
    });
    return () => {
      alive.current = false;
      clearTimeout(popTimer.current);
      height.stopAnimation();
      bounce.stopAnimation();
      listener.remove();
    };
  }, [controls, height, bounce]);
  useEffect(() => { if (!focused || disabled || !gesturesEnabled) controls.cancel(); }, [focused, disabled, gesturesEnabled, controls]);
  return { height, bounce, phase, distance, error, controls };
}
