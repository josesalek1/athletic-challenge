export type ChecklistItem = {
  n: number;
  key: string;
  name: string;
  hint: string;
  group?: string;
};

export type Challenge = {
  id: string;
  name: string;
  kind: 'timed' | 'reps' | 'checklist' | 'done';
  category: 'yogic' | 'traditional';
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

export type Payload = { seconds?: number; reps?: number; done?: string[]; ok?: boolean };

export type Entry = {
  user_id: string;
  challenge_id: string;
  day: string;
  payload: Payload;
};
