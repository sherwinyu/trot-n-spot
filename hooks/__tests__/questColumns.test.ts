import { QUEST_COLUMNS_NO_LOCATION } from '../../types/database';

// Location privacy: the column list used for quests assigned to the
// current user (and for the detail fetch) must never include GPS fields.
describe('QUEST_COLUMNS_NO_LOCATION', () => {
  it('excludes location columns', () => {
    expect(QUEST_COLUMNS_NO_LOCATION).not.toContain('location_lat');
    expect(QUEST_COLUMNS_NO_LOCATION).not.toContain('location_lng');
    expect(QUEST_COLUMNS_NO_LOCATION).not.toContain('*');
  });

  it('includes everything the feed and detail screens render', () => {
    for (const col of [
      'id',
      'creator_id',
      'assignee_id',
      'status',
      'description',
      'photo_path',
      'completion_photo_path',
      'completed_at',
      'created_at',
    ]) {
      expect(QUEST_COLUMNS_NO_LOCATION).toContain(col);
    }
  });
});
