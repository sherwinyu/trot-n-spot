import { QUEST_COLUMNS_NO_LOCATION } from '../../types/database';

// Location privacy: the column list used for quest lists and the
// detail fetch must never include GPS fields — for anyone, in either
// mode, until completion reveals them.
describe('QUEST_COLUMNS_NO_LOCATION', () => {
  it('excludes location columns', () => {
    expect(QUEST_COLUMNS_NO_LOCATION).not.toContain('location_lat');
    expect(QUEST_COLUMNS_NO_LOCATION).not.toContain('location_lng');
    expect(QUEST_COLUMNS_NO_LOCATION).not.toContain('*');
  });

  it('includes everything the feed and detail screens render', () => {
    for (const col of [
      'id',
      'pack_id',
      'creator_id',
      'assignee_id',
      'finder_id',
      'mode',
      'status',
      'description',
      'photo_path',
      'photo_full_path',
      'photo_thumbnail_path',
      'completion_photo_path',
      'completion_full_path',
      'completion_thumbnail_path',
      'completed_at',
      'created_at',
    ]) {
      expect(QUEST_COLUMNS_NO_LOCATION).toContain(col);
    }
  });
});
