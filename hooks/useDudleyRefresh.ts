import { useEffect, useRef, useState } from 'react';
import { Animated, AppState } from 'react-native';

export const PULL_THRESHOLD = 96;
export const REFRESH_HEIGHT = 128;
export type RefreshPhase = 'idle' | 'pull' | 'pop' | 'refresh' | 'settle';

/** Owns gesture eligibility and the request lifetime, independently of the artwork. */
export function useDudleyRefresh(onRefresh: () => Promise<unknown>, disabled: boolean, motion: boolean, focused: boolean, gesturesEnabled = true) {
  const height = useRef(new Animated.Value(0)).current;
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
      setError(false);
      setPhase(latest.current.motion ? 'pop' : 'refresh');
      Animated.timing(height, { toValue: REFRESH_HEIGHT, duration: latest.current.motion ? 180 : 0, useNativeDriver: false }).start();
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
      canMove: (dx: number, dy: number, touches = 1) => {
        if (touches !== 1 || Math.abs(dx) > Math.max(10, Math.abs(dy))) eligible.current = false;
        return eligible.current && !inFlight.current && !latest.current.disabled && dy > 8 && dy > Math.abs(dx) * 1.3;
      },
      move: (dy: number) => {
        if (!eligible.current || inFlight.current) return;
        dragging.current = true;
        height.stopAnimation();
        pull.current = Math.min(164, Math.max(0, dy * 0.6));
        height.setValue(pull.current);
        setDistance(pull.current);
        setPhase('pull');
      },
      release: () => {
        if (!dragging.current) return;
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
      listener.remove();
    };
  }, [controls, height]);
  useEffect(() => { if (!focused || disabled || !gesturesEnabled) controls.cancel(); }, [focused, disabled, gesturesEnabled, controls]);
  return { height, phase, distance, error, controls };
}
