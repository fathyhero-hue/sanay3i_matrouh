-- Patch 19: Registration Code for Workers
-- Run once in Supabase SQL Editor.

ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS registration_code text;

-- Fill missing codes for existing workers using their id and creation year.
UPDATE public.workers
SET registration_code = 'SN-' || COALESCE(EXTRACT(YEAR FROM created_at)::int, EXTRACT(YEAR FROM now())::int)::text || '-' || LPAD(id::text, 5, '0')
WHERE registration_code IS NULL OR registration_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS workers_registration_code_unique
ON public.workers (registration_code)
WHERE registration_code IS NOT NULL AND registration_code <> '';
