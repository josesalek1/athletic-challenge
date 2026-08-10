export type ChecklistItem = {
  n: number;
  key: string;
  name: string;
  hint: string;
  group?: string;
};

export type Challenge = {
  id: string;
  campaign_id: string | null;
  owner_id: string | null;
  visibility: 'group' | 'private';
  name: string;
  kind: 'timed' | 'reps' | 'checklist' | 'done';
  category:
    | 'yogic'
    | 'calisthenics'
    | 'strength'
    | 'hiit'
    | 'cardio'
    | 'mobility'
    | 'swimming'
    | 'running'
    | 'recovery'
    | 'mindfulness'
    | 'traditional'
    | 'other';
  started_on?: string;
  config: {
    target_s?: number;
    target?: number;
    work_s?: number;
    rest_s?: number;
    rounds?: number;
    items?: ChecklistItem[];
    daily_goal?: number;
    blurb?: string;
    share?: 'names' | 'count';
  };
  active: boolean;
  sort_order: number;
};

export type Campaign = {
  id: string;
  name: string;
  description: string;
  starts_on: string;
  ends_on: string;
  duration_days: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
};

export type Payload = { seconds?: number; reps?: number; done?: string[]; ok?: boolean };

export type Entry = {
  user_id: string;
  challenge_id: string;
  day: string;
  payload: Payload;
};

export type BodyMetric = {
  user_id: string;
  day: string;
  weight_kg: number | null;
  waist_cm: number | null;
  note: string | null;
};
