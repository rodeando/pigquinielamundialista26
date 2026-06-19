create table if not exists public.bonus_picks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  world_champion text,
  top_scorer text,
  best_goalkeeper text,
  updated_at timestamptz not null default now()
);

alter table public.bonus_picks enable row level security;

grant select on public.bonus_picks to authenticated;
grant insert, update on public.bonus_picks to authenticated;

drop policy if exists "Bonus picks are visible to authenticated users" on public.bonus_picks;
create policy "Bonus picks are visible to authenticated users"
on public.bonus_picks for select
to authenticated
using (
  auth.uid() = user_id
  or now() >= '2026-06-19 23:59:00-06'::timestamptz
);

drop policy if exists "Users can insert their bonus picks before deadline" on public.bonus_picks;
create policy "Users can insert their bonus picks before deadline"
on public.bonus_picks for insert
to authenticated
with check (
  auth.uid() = user_id
  and now() < '2026-06-19 23:59:00-06'::timestamptz
);

drop policy if exists "Users can update their bonus picks before deadline" on public.bonus_picks;
create policy "Users can update their bonus picks before deadline"
on public.bonus_picks for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and now() < '2026-06-19 23:59:00-06'::timestamptz
);
