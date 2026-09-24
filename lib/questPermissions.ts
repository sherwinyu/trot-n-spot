import { Quest } from '@/types/database';

// Only the person who spotted a quest may edit or delete it. Mirrors the
// RLS policies ("Creators can update any field" / "Creators can delete own
// quests") so the UI never offers an action the server would reject.
export function canManageQuest(quest: Quest, userId: string | undefined): boolean {
  return !!userId && quest.creator_id === userId;
}

// Reassigning only makes sense while the hunt is still on; a completed
// quest already has its finder.
export function canReassignQuest(quest: Quest, userId: string | undefined): boolean {
  return canManageQuest(quest, userId) && quest.status === 'active';
}

// Storage paths a creator owns (their own folder) and may remove when the
// quest goes away. The finder's completion photo lives elsewhere.
export function ownedPhotoPaths(quest: Quest, userId: string): string[] {
  const prefix = `${userId}/`;
  return [quest.photo_path, quest.photo_full_path, quest.photo_thumbnail_path].filter(
    (p): p is string => !!p && p.startsWith(prefix)
  );
}
