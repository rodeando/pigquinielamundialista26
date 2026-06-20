create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id integer not null,
  outcome text not null check (outcome in ('home', 'draw', 'away')),
  home_score integer,
  away_score integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

create table if not exists public.bonus_picks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  world_champion text,
  top_scorer text,
  best_goalkeeper text,
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  match_id integer primary key,
  home_score integer,
  away_score integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.app_settings(key, value)
values ('unlocked_phase', '1'::jsonb)
on conflict (key) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
  set email = excluded.email,
      name = excluded.name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.picks enable row level security;
alter table public.bonus_picks enable row level security;
alter table public.results enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_users enable row level security;

grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;
grant select on public.picks to authenticated;
grant insert, update on public.picks to authenticated;
grant select on public.bonus_picks to authenticated;
grant insert, update on public.bonus_picks to authenticated;
grant select on public.results to authenticated;
grant insert, update on public.results to authenticated;
grant select on public.app_settings to authenticated;
grant insert, update on public.app_settings to authenticated;
grant select on public.admin_users to authenticated;

drop policy if exists "Profiles are visible to authenticated users" on public.profiles;
create policy "Profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Picks are visible to authenticated users" on public.picks;
create policy "Picks are visible to authenticated users"
on public.picks for select
to authenticated
using (true);

drop policy if exists "Users can insert their picks" on public.picks;
create policy "Users can insert their picks"
on public.picks for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their picks" on public.picks;
create policy "Users can update their picks"
on public.picks for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Bonus picks are visible to authenticated users" on public.bonus_picks;
create policy "Bonus picks are visible to authenticated users"
on public.bonus_picks for select
to authenticated
using (true);

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

drop policy if exists "Results are visible to authenticated users" on public.results;
create policy "Results are visible to authenticated users"
on public.results for select
to authenticated
using (true);

drop policy if exists "Authenticated users can manage results" on public.results;
drop policy if exists "Admins can manage results" on public.results;
create policy "Admins can manage results"
on public.results for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where lower(admin_users.email) = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where lower(admin_users.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Settings are visible to authenticated users" on public.app_settings;
create policy "Settings are visible to authenticated users"
on public.app_settings for select
to authenticated
using (true);

drop policy if exists "Authenticated users can manage settings" on public.app_settings;
drop policy if exists "Admins can manage settings" on public.app_settings;
create policy "Admins can manage settings"
on public.app_settings for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where lower(admin_users.email) = lower(auth.jwt() ->> 'email')
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where lower(admin_users.email) = lower(auth.jwt() ->> 'email')
  )
);

drop policy if exists "Users can see their admin record" on public.admin_users;
create policy "Users can see their admin record"
on public.admin_users for select
to authenticated
using (lower(email) = lower(auth.jwt() ->> 'email'));
