// Quests assigned to me never include location — that's the hunt.
// Used everywhere a quest is fetched on behalf of a possible assignee.
export const QUEST_COLUMNS_NO_LOCATION =
  'id, creator_id, assignee_id, journey_id, status, description, photo_path, completion_photo_path, completion_journey_id, completed_at, created_at, updated_at';

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  partner_id: string | null;
  pair_code: string;
  push_token: string | null;
  created_at: string;
  updated_at: string;
};

export type Journey = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Quest = {
  id: string;
  creator_id: string;
  assignee_id: string;
  journey_id: string | null;
  status: 'active' | 'completed';
  description: string | null;
  photo_path: string;
  location_lat: number | null;
  location_lng: number | null;
  completion_photo_path: string | null;
  completion_journey_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
