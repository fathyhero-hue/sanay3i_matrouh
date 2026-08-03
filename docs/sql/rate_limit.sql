-- شغّل الملف ده مرة واحدة في Supabase Dashboard -> SQL Editor
-- بيعمل جدول وفانكشن لحماية rate-limiting تشتغل صح مهما كان عدد
-- الـ serverless instances على Vercel (بدل الذاكرة المحلية اللي كانت
-- بترجع لصفر مع كل instance جديد).

create table if not exists rate_limit_hits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);

create or replace function rl_hit(p_key text, p_window_ms bigint, p_max int)
returns table(allowed boolean, remaining int) as $$
declare
  v_now timestamptz := now();
  v_count int;
  v_reset timestamptz;
begin
  insert into rate_limit_hits (key, count, reset_at)
  values (p_key, 1, v_now + (p_window_ms || ' milliseconds')::interval)
  on conflict (key) do update
    set count = case when rate_limit_hits.reset_at <= v_now then 1 else rate_limit_hits.count + 1 end,
        reset_at = case when rate_limit_hits.reset_at <= v_now then v_now + (p_window_ms || ' milliseconds')::interval else rate_limit_hits.reset_at end
  returning count, reset_at into v_count, v_reset;

  return query select v_count <= p_max, greatest(0, p_max - v_count);
end;
$$ language plpgsql;
