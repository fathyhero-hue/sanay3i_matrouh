-- ANALYTICS PATCH - صنايعي مطروح
-- Run this once in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id BIGSERIAL PRIMARY KEY,
  worker_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_view','call','whatsapp','share')),
  source TEXT DEFAULT '',
  page_path TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  ip_hash TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_worker_id ON public.analytics_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_worker_type_time ON public.analytics_events(worker_id, event_type, created_at DESC);
