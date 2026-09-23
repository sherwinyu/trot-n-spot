import { useEffect, useRef, useState } from 'react';
import { Dudley } from './Dudley';

/** React to confirmed journey changes, not taps or the initial server fetch. */
export function WalkDudley({ journeyId, loading }: { journeyId: string | null; loading: boolean }) {
  const previous = useRef<string | null | undefined>(undefined);
  const [moment, setMoment] = useState(0);
  useEffect(() => {
    if (loading) return;
    if (previous.current !== undefined && previous.current !== journeyId) setMoment(n => n + 1);
    previous.current = journeyId;
  }, [journeyId, loading]);
  return (
    <Dudley
      key={moment}
      mood={journeyId ? 'trot' : 'nap'}
      width={120}
      animate={moment > 0}
      durationMs={journeyId ? 1440 : 2800}
      interactive
    />
  );
}
