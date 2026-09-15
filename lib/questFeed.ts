import { Quest } from '@/types/database';
import { PendingMutation } from '@/lib/offline';

// A quest as the feed sees it. Rows backed by a queued mutation carry
// `pending` plus the local photo we captured, since nothing has been
// uploaded yet.
export type FeedQuest = Quest & {
  pending?: boolean;
  local_photo_uri?: string | null;
  local_completion_uri?: string | null;
};

// Feed sections for the home screen. Visibility and assignment are
// separate questions: every pack quest appears somewhere below; the
// mode only controls who may complete it.
export type QuestLists = {
  forMe: FeedQuest[]; // targeted at me, active
  openForPack: FeedQuest[]; // open mode, active, spotted by someone else
  byMe: FeedQuest[]; // I created, active (targeted or open)
  aroundMyPacks: FeedQuest[]; // active targeted quests between other packmates (teasers)
  completedQuests: FeedQuest[];
};

export const EMPTY_QUEST_LISTS: QuestLists = {
  forMe: [],
  openForPack: [],
  byMe: [],
  aroundMyPacks: [],
  completedQuests: [],
};

export function partitionQuests(active: Quest[], completed: Quest[], userId: string): QuestLists {
  return {
    forMe: active.filter((q) => q.mode === 'targeted' && q.assignee_id === userId),
    openForPack: active.filter((q) => q.mode === 'open' && q.creator_id !== userId),
    byMe: active.filter((q) => q.creator_id === userId),
    aroundMyPacks: active.filter(
      (q) => q.mode === 'targeted' && q.creator_id !== userId && q.assignee_id !== userId
    ),
    completedQuests: completed,
  };
}

export function findQuestInLists(lists: QuestLists, id: string): FeedQuest | null {
  for (const section of Object.values(lists)) {
    const match = section.find((q) => q.id === id);
    if (match) return match;
  }
  return null;
}

function questFromPendingCreate(
  payload: Extract<PendingMutation, { type: 'create_quest' }>['payload']
): FeedQuest {
  return {
    id: payload.questId,
    pack_id: payload.packId,
    creator_id: payload.creatorId,
    assignee_id: payload.assigneeId,
    finder_id: null,
    mode: payload.mode,
    journey_id: payload.journeyId,
    status: 'active',
    description: payload.description,
    photo_path: '',
    photo_full_path: null,
    photo_thumbnail_path: null,
    location_lat: null,
    location_lng: null,
    completion_photo_path: null,
    completion_full_path: null,
    completion_thumbnail_path: null,
    completion_journey_id: null,
    completed_at: null,
    created_at: payload.createdAt,
    updated_at: payload.createdAt,
    pending: true,
    local_photo_uri: payload.photoUri,
  };
}

// Overlays the offline queue onto the last good fetch so a quest you just
// created or completed shows up right away instead of only as a banner
// count. Queued creates become new byMe rows; queued completions move the
// quest (if we have it) into completedQuests.
export function applyPendingMutations(
  lists: QuestLists,
  queue: PendingMutation[],
  userId: string
): QuestLists {
  if (queue.length === 0) return lists;

  const completions = new Map<string, Extract<PendingMutation, { type: 'complete_quest' }>['payload']>();
  const creates: FeedQuest[] = [];
  for (const mutation of queue) {
    if (mutation.type === 'complete_quest') completions.set(mutation.payload.questId, mutation.payload);
    else if (mutation.payload.creatorId === userId) creates.push(questFromPendingCreate(mutation.payload));
  }

  const knownIds = new Set<string>();
  const pendingCompleted: FeedQuest[] = [];
  const dropCompleted = (section: FeedQuest[]) =>
    section.filter((q) => {
      knownIds.add(q.id);
      const completion = completions.get(q.id);
      if (!completion) return true;
      pendingCompleted.push({
        ...q,
        status: 'completed',
        finder_id: completion.userId,
        completed_at: completion.completedAt,
        completion_journey_id: completion.journeyId,
        pending: true,
        local_completion_uri: completion.photoUri,
      });
      return false;
    });

  const forMe = dropCompleted(lists.forMe);
  const openForPack = dropCompleted(lists.openForPack);
  const byMe = dropCompleted(lists.byMe);
  const aroundMyPacks = dropCompleted(lists.aroundMyPacks);
  const newCreates = creates.filter((q) => !knownIds.has(q.id) && !lists.completedQuests.some((c) => c.id === q.id));

  return {
    forMe,
    openForPack,
    byMe: [...newCreates.reverse(), ...byMe],
    aroundMyPacks,
    completedQuests: [
      ...pendingCompleted.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')),
      ...lists.completedQuests,
    ],
  };
}
