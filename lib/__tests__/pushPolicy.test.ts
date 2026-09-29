import {
  deadTokens,
  describeEvent,
  planNotification,
  PlanContext,
  QuestRecord,
  WebhookPayload,
} from '../../supabase/functions/send-push-notification/policy';

const SHERWIN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NADIA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CAROL = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PACK = 'facadefa-cade-4ace-8ade-000000000001';

const ctx: PlanContext = {
  actorName: 'Sherwin',
  packName: 'Dog Park Crew',
  packMemberIds: [SHERWIN, NADIA, CAROL],
};

function quest(overrides: Partial<QuestRecord> = {}): QuestRecord {
  return {
    id: 'q1',
    pack_id: PACK,
    creator_id: SHERWIN,
    assignee_id: NADIA,
    finder_id: null,
    mode: 'targeted',
    status: 'active',
    description: 'Red mailbox with stickers',
    ...overrides,
  };
}

describe('planNotification', () => {
  it('targeted quest insert notifies only the assignee', () => {
    const plan = planNotification({ type: 'INSERT', table: 'quests', record: quest() }, ctx);
    expect(plan).toEqual({
      recipientIds: [NADIA],
      title: 'Sherwin spotted something',
      body: 'Red mailbox with stickers',
      data: { type: 'quest_created', questId: 'q1', packId: PACK },
    });
  });

  it('open quest insert notifies every packmate except the creator', () => {
    const plan = planNotification(
      { type: 'INSERT', table: 'quests', record: quest({ mode: 'open', assignee_id: null, description: null }) },
      ctx
    );
    expect(plan?.recipientIds).toEqual([NADIA, CAROL]);
    expect(plan?.body).toBe('Open to the pack — first to find it wins');
  });

  it('completion notifies the creator, named after the finder', () => {
    const plan = planNotification(
      {
        type: 'UPDATE',
        table: 'quests',
        record: quest({ status: 'completed', finder_id: NADIA }),
        old_record: quest(),
      },
      { ...ctx, actorName: 'Nadia' }
    );
    expect(plan).toEqual({
      recipientIds: [SHERWIN],
      title: 'Nadia found your quest',
      body: 'Red mailbox with stickers',
      data: { type: 'quest_completed', questId: 'q1', packId: PACK },
    });
  });

  it('completion still reaches a creator who has left the pack', () => {
    const plan = planNotification(
      {
        type: 'UPDATE',
        table: 'quests',
        record: quest({ status: 'completed', finder_id: NADIA }),
        old_record: quest(),
      },
      { ...ctx, actorName: 'Nadia', packMemberIds: [NADIA, CAROL] }
    );
    expect(plan?.recipientIds).toEqual([SHERWIN]);
  });

  it('ignores quest updates that are not the transition to completed', () => {
    const completed = quest({ status: 'completed', finder_id: NADIA });
    expect(
      planNotification({ type: 'UPDATE', table: 'quests', record: completed, old_record: completed }, ctx)
    ).toBeNull();
    expect(
      planNotification({ type: 'UPDATE', table: 'quests', record: quest(), old_record: quest() }, ctx)
    ).toBeNull();
  });

  it('treats payloads without a table as quest events', () => {
    const payload: WebhookPayload = { type: 'INSERT', record: quest() };
    expect(describeEvent(payload)).toEqual({ packId: PACK, actorId: SHERWIN });
  });

  it('pack join notifies existing members, not the owner row from create_pack', () => {
    const joined = planNotification(
      {
        type: 'INSERT',
        table: 'pack_members',
        record: { pack_id: PACK, user_id: CAROL, role: 'member', status: 'active' },
      },
      { ...ctx, actorName: 'Carol' }
    );
    expect(joined).toEqual({
      recipientIds: [SHERWIN, NADIA],
      title: 'Carol joined Dog Park Crew',
      body: 'Spot something for them to find',
      data: { type: 'pack_joined', packId: PACK },
    });

    expect(
      planNotification(
        {
          type: 'INSERT',
          table: 'pack_members',
          record: { pack_id: PACK, user_id: SHERWIN, role: 'owner', status: 'active' },
        },
        ctx
      )
    ).toBeNull();
  });

  it('falls back to generic names and clips long descriptions', () => {
    const long = 'x'.repeat(120);
    const plan = planNotification(
      { type: 'INSERT', table: 'quests', record: quest({ description: long }) },
      { ...ctx, actorName: null }
    );
    expect(plan?.title).toBe('A packmate spotted something');
    expect(plan?.body.length).toBe(80);
    expect(plan?.body.endsWith('…')).toBe(true);
  });
});

describe('planNotification for comments', () => {
  const DAVE = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const comment = (author: string, body = 'Is it near the park?'): WebhookPayload => ({
    type: 'INSERT',
    table: 'quest_comments',
    record: { id: 'c1', quest_id: 'q1', pack_id: PACK, author_id: author, body },
  });

  it('notifies the quest\'s people, not the rest of the pack or the commenter', () => {
    const plan = planNotification(comment(NADIA), {
      ...ctx,
      actorName: 'Nadia',
      quest: quest(),
      commenterIds: [NADIA],
    });
    expect(plan).toEqual({
      recipientIds: [SHERWIN],
      title: 'Nadia commented',
      body: 'Is it near the park?',
      data: { type: 'quest_commented', questId: 'q1', packId: PACK },
    });
  });

  it('includes earlier commenters who are still in the pack', () => {
    const plan = planNotification(comment(SHERWIN), {
      ...ctx,
      packMemberIds: [SHERWIN, NADIA, CAROL],
      quest: quest({ mode: 'open', assignee_id: null }),
      commenterIds: [CAROL, SHERWIN, DAVE],
    });
    expect(plan?.recipientIds).toEqual([CAROL]);
  });

  it('describes comment inserts but not deletes', () => {
    expect(describeEvent(comment(NADIA))).toEqual({ packId: PACK, actorId: NADIA });
    expect(describeEvent({ ...comment(NADIA), type: 'DELETE' } as WebhookPayload)).toBeNull();
  });

  it('still notifies prior commenters when the quest lookup fails', () => {
    const plan = planNotification(comment(NADIA, `  ${'y'.repeat(100)}  `), {
      ...ctx,
      quest: null,
      commenterIds: [CAROL],
    });
    expect(plan?.recipientIds).toEqual([CAROL]);
    expect(plan?.body.length).toBe(80);
  });
});

describe('deadTokens', () => {
  it('returns only tokens Expo reports as DeviceNotRegistered', () => {
    expect(
      deadTokens(
        ['t1', 't2', 't3'],
        [
          { status: 'ok' },
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'error', details: { error: 'MessageTooBig' } },
        ]
      )
    ).toEqual(['t2']);
  });
});
