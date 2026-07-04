// Quests fetched on behalf of a possible finder never include location —
// that's the hunt. Used everywhere quest lists and details are fetched.
export const QUEST_COLUMNS_NO_LOCATION =
  'id, pack_id, creator_id, assignee_id, finder_id, mode, journey_id, status, description, photo_path, completion_photo_path, completion_journey_id, completed_at, created_at, updated_at';

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  push_token: string | null;
  created_at: string;
  updated_at: string;
};

export type Pack = {
  id: string;
  name: string;
  owner_id: string;
  allow_member_invites: boolean;
  visibility: 'private' | 'discoverable';
  created_at: string;
  updated_at: string;
};

export type PackMember = {
  pack_id: string;
  user_id: string;
  role: 'owner' | 'member';
  status: 'active' | 'pending';
  joined_at: string;
};

// Shape returned by the packs fetch in AuthProvider: the pack, its
// roster (with profiles embedded), and the active invite code.
export type PackWithMembers = Pack & {
  members: (PackMember & { profile: Profile })[];
  invite_code: string | null;
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
  pack_id: string;
  creator_id: string;
  assignee_id: string | null; // null for open quests
  finder_id: string | null; // set on completion
  mode: 'targeted' | 'open';
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
