// Pure recipient/copy policy for push notifications. No I/O, so it can be
// unit-tested with Jest even though the edge function itself runs on Deno.

export type QuestRecord = {
  id: string;
  pack_id: string;
  creator_id: string;
  assignee_id: string | null; // null = open to the pack
  finder_id: string | null;
  mode: 'targeted' | 'open';
  status: string;
  description: string | null;
};

export type PackMemberRecord = {
  pack_id: string;
  user_id: string;
  role: 'owner' | 'member';
  status: 'active' | 'pending';
};

export type WebhookPayload =
  | { type: 'INSERT' | 'UPDATE' | 'DELETE'; table: 'quests'; record: QuestRecord; old_record?: QuestRecord | null }
  | { type: 'INSERT' | 'UPDATE' | 'DELETE'; table: 'pack_members'; record: PackMemberRecord; old_record?: PackMemberRecord | null }
  // Payloads from the pre-013 trigger carried no `table`; they were always quests.
  | { type: 'INSERT' | 'UPDATE' | 'DELETE'; table?: undefined; record: QuestRecord; old_record?: QuestRecord | null };

export type NotificationData =
  | { type: 'quest_created' | 'quest_completed'; questId: string; packId: string }
  | { type: 'pack_joined'; packId: string };

export type PlannedNotification = {
  recipientIds: string[];
  title: string;
  body: string;
  data: NotificationData;
};

// Names/roster the function looks up before applying the policy.
export type PlanContext = {
  actorName: string | null;
  packName: string | null;
  // Active members of the relevant pack, including the actor.
  packMemberIds: string[];
};

// Which pack and actor the policy needs resolved for a payload, or null if
// the event never notifies anyone (so the function can skip the lookups).
export function describeEvent(
  payload: WebhookPayload
): { packId: string; actorId: string } | null {
  const table = payload.table ?? 'quests';
  if (table === 'quests') {
    const quest = payload.record as QuestRecord;
    if (payload.type === 'INSERT') {
      return { packId: quest.pack_id, actorId: quest.creator_id };
    }
    if (
      payload.type === 'UPDATE' &&
      quest.status === 'completed' &&
      (payload.old_record as QuestRecord | null | undefined)?.status !== 'completed'
    ) {
      return { packId: quest.pack_id, actorId: quest.finder_id ?? quest.assignee_id ?? quest.creator_id };
    }
    return null;
  }
  if (table === 'pack_members') {
    const member = payload.record as PackMemberRecord;
    // The owner row is written by create_pack; there is nobody else to tell.
    if (payload.type === 'INSERT' && member.role === 'member' && member.status === 'active') {
      return { packId: member.pack_id, actorId: member.user_id };
    }
  }
  return null;
}

const MAX_BODY = 80;

function clip(text: string): string {
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY - 1).trimEnd()}…` : text;
}

export function planNotification(
  payload: WebhookPayload,
  ctx: PlanContext
): PlannedNotification | null {
  const event = describeEvent(payload);
  if (!event) return null;

  const actor = ctx.actorName ?? 'A packmate';
  const others = ctx.packMemberIds.filter((id) => id !== event.actorId);
  const table = payload.table ?? 'quests';

  if (table === 'quests') {
    const quest = payload.record as QuestRecord;
    const description = quest.description?.trim() || null;

    if (payload.type === 'INSERT') {
      const recipientIds =
        quest.mode === 'open' || !quest.assignee_id
          ? others
          : others.filter((id) => id === quest.assignee_id);
      return {
        recipientIds,
        title: `${actor} spotted something`,
        body: clip(
          description ??
            (quest.mode === 'open' ? 'Open to the pack — first to find it wins' : 'A new quest for you')
        ),
        data: { type: 'quest_created', questId: quest.id, packId: quest.pack_id },
      };
    }

    return {
      recipientIds: others.filter((id) => id === quest.creator_id),
      title: `${actor} found your quest`,
      body: clip(description ?? 'Your quest was found!'),
      data: { type: 'quest_completed', questId: quest.id, packId: quest.pack_id },
    };
  }

  const member = payload.record as PackMemberRecord;
  return {
    recipientIds: others,
    title: `${actor} joined ${ctx.packName ?? 'your pack'}`,
    body: 'Spot something for them to find',
    data: { type: 'pack_joined', packId: member.pack_id },
  };
}

// Expo's per-message ticket; only the fields we act on.
export type ExpoPushTicket = {
  status: 'ok' | 'error';
  details?: { error?: string };
};

// Tokens Expo says are gone for good, paired by index with the sent batch.
export function deadTokens(tokens: string[], tickets: ExpoPushTicket[]): string[] {
  return tokens.filter(
    (_, i) => tickets[i]?.status === 'error' && tickets[i]?.details?.error === 'DeviceNotRegistered'
  );
}
