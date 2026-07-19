-- Correccion directa de la final:
-- marcador a 90 minutos 0-0 y campeon/ganador por tiempo extra Spain.

insert into public.results (match_id, home_score, away_score, advancing_team, updated_at)
values (104, 0, 0, 'Spain', now())
on conflict (match_id) do update
set home_score = excluded.home_score,
    away_score = excluded.away_score,
    advancing_team = excluded.advancing_team,
    updated_at = excluded.updated_at;
