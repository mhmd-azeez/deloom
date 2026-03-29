export type Bindings = {
  DB: D1Database;
  BUCKET: R2Bucket;

  R2_PREFIX: string;
  SITE_NAME: string;
  MEDIA_DOMAIN: string;
};

export type Video = {
  id: string;
  r2_key: string;
  title: string | null;
  description: string | null;
  size_bytes: number | null;
  uploaded_at: string | null;
  created_at: string;
};

export type Comment = {
  id: string;
  video_id: string;
  name: string;
  email: string;
  body: string;
  timestamp_sec: number | null;
  deleted: number;
  created_at: string;
};

export type Reaction = {
  id: string;
  video_id: string;
  emoji: string;
  name: string;
  email: string;
  timestamp_sec: number;
  created_at: string;
};

export type ViewCount = {
  video_id: string;
  count: number;
};

export type Transcript = {
  video_id: string;
  status: string;
  full_text: string | null;
  segments_json: string | null;
  vtt: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
