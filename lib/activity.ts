import { supabase } from '@/lib/supabase';
import { routeForPushData } from '@/lib/notifications';
import { ActivityNotification } from '@/types/database';

export const ACTIVITY_PAGE_SIZE = 50;

export async function fetchActivity(): Promise<ActivityNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(ACTIVITY_PAGE_SIZE);
  if (error) throw error;
  return (data ?? []) as ActivityNotification[];
}

export async function markAllActivityRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_notifications_read');
  if (error) throw error;
}

// Unread rows the user hasn't opened the Activity list for yet. `seen`
// holds ids already marked read server-side this session but not yet
// refetched.
export function unseenCount(items: ActivityNotification[], seen: Set<string>): number {
  return items.filter((n) => n.read_at === null && !seen.has(n.id)).length;
}

// Same destinations as tapping the push for the event.
export function routeForActivity(item: ActivityNotification): string | null {
  return routeForPushData({ type: item.type, questId: item.quest_id ?? undefined, packId: item.pack_id });
}
