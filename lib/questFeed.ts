import { Quest } from '@/types/database';

// Feed sections for the home screen. Visibility and assignment are
// separate questions: every pack quest appears somewhere below; the
// mode only controls who may complete it.
export type QuestLists = {
  forMe: Quest[]; // targeted at me, active
  openForPack: Quest[]; // open mode, active, spotted by someone else
  byMe: Quest[]; // I created, active (targeted or open)
  aroundMyPacks: Quest[]; // active targeted quests between other packmates (teasers)
  completedQuests: Quest[];
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
