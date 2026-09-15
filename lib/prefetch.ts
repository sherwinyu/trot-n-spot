import { Platform } from 'react-native';
import { Image } from 'expo-image';
import { getSignedPhotoUrl } from '@/lib/signedUrls';
import { QuestLists } from '@/lib/questFeed';

export const QUEST_PHOTO_CACHE_KEY_PREFIX = 'quest-photo:';

// Which storage paths to warm so the feed and the quests you're likely to
// open render offline: thumbnails for every active quest, the detail image
// for quests targeted at you.
export function photoPathsToPrefetch(lists: QuestLists): string[] {
  const paths = new Set<string>();
  const active = [...lists.forMe, ...lists.openForPack, ...lists.byMe, ...lists.aroundMyPacks];
  for (const quest of active) {
    if (quest.pending) continue;
    const thumb = quest.photo_thumbnail_path ?? quest.photo_path;
    if (thumb) paths.add(thumb);
  }
  for (const quest of lists.forMe) {
    if (!quest.pending && quest.photo_path) paths.add(quest.photo_path);
  }
  return [...paths];
}

type Loader = (path: string) => Promise<void>;

// `Image.prefetch` keys the disk entry by URL, which changes with every
// signing, so load through a source with the same `cacheKey` QuestPhoto uses.
async function loadIntoCache(path: string): Promise<void> {
  const url = await getSignedPhotoUrl(path);
  const ref = await Image.loadAsync({ uri: url, cacheKey: QUEST_PHOTO_CACHE_KEY_PREFIX + path });
  ref.release();
}

const warmed = new Set<string>();

// Fire-and-forget: resolves once every path has been attempted. Failures
// are ignored — the next successful feed fetch tries again.
export async function prefetchQuestPhotos(
  lists: QuestLists,
  load: Loader = loadIntoCache
): Promise<void> {
  if (Platform.OS === 'web') return;
  const pending = photoPathsToPrefetch(lists).filter((p) => !warmed.has(p));
  for (const path of pending) {
    try {
      await load(path);
      warmed.add(path);
    } catch {
      // still offline or path missing in storage — retry next time
    }
  }
}

export function resetPrefetchMemory(): void {
  warmed.clear();
}
