-- Cierra la lectura directa de pronosticos futuros.
-- Despues de ejecutar este bloque, los usuarios solo pueden leer sus propios picks
-- desde Supabase. La app usa /api/visible-picks para mostrar los picks de todos
-- unicamente cuando el partido ya inicio.

drop policy if exists "Picks are visible to authenticated users" on public.picks;
drop policy if exists "Users can see their own picks" on public.picks;
drop policy if exists "Admins can see all picks" on public.picks;

create policy "Users can see their own picks"
on public.picks for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins can see all picks"
on public.picks for select
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where lower(admin_users.email) = lower(auth.jwt() ->> 'email')
  )
);
