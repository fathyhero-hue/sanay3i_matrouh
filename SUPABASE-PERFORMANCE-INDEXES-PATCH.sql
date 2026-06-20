-- =========================================================
-- صنايعي مطروح - Performance Indexes Patch
-- يشغّل بأمان: ينشئ الفهارس فقط لو الجدول والعمود موجودين.
-- =========================================================

DO $$
BEGIN
  IF to_regclass('public.workers') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='approved') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_approved ON public.workers (approved)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='active') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_active ON public.workers (active)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='featured') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_featured ON public.workers (featured)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='trade') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_trade ON public.workers (trade)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='area') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_area ON public.workers (area)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_created_at_desc ON public.workers (created_at DESC)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workers' AND column_name='subscription_end') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workers_subscription_end ON public.workers (subscription_end)';
    END IF;
  END IF;

  IF to_regclass('public.reviews') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reviews' AND column_name='worker_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reviews_worker_id ON public.reviews (worker_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reviews' AND column_name='approved') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reviews_approved ON public.reviews (approved)';
    END IF;
  END IF;

  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at_desc ON public.analytics_events (created_at DESC)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name='worker_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_analytics_events_worker_id ON public.analytics_events (worker_id)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name='event_type') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON public.analytics_events (event_type)';
    END IF;
  END IF;

  IF to_regclass('public.worker_reports') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='worker_reports' AND column_name='status') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_worker_reports_status_perf ON public.worker_reports (status)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='worker_reports' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_worker_reports_created_at_desc ON public.worker_reports (created_at DESC)';
    END IF;
  END IF;

  IF to_regclass('public.whatsapp_message_logs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_logs' AND column_name='created_at') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_created_at_desc ON public.whatsapp_message_logs (created_at DESC)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_logs' AND column_name='status') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_whatsapp_message_logs_status ON public.whatsapp_message_logs (status)';
    END IF;
  END IF;
END $$;
