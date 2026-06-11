# Supabase setup

1. Create a Supabase project.
2. Open SQL Editor and run `supabase-schema.sql`.
3. Go to Project Settings > API and copy:
   - Project URL
   - anon public key
4. Create `.env.local` locally:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_public_key
```

5. In Vercel, add the same variables in Project Settings > Environment Variables.
6. In Supabase Authentication > URL Configuration:
   - Site URL: your Vercel production URL
   - Redirect URLs: your Vercel production URL and local URL if needed, for example `http://localhost:5173`

Supabase Auth enforces unique emails. The app stores shared users in `profiles`, picks in `picks`, results in `results`, and the open phase in `app_settings`.

## Automatic results with football-data.org

1. Create a free account at `football-data.org` and copy your API token.
2. In Supabase > Project Settings > API, copy the `service_role` key. Keep it secret.
3. In Vercel > Project Settings > Environment Variables, add:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
FOOTBALL_DATA_API_TOKEN=tu_token_de_football_data
SYNC_RESULTS_SECRET=un_secreto_largo
```

4. Deploy to Vercel. The cron in `vercel.json` calls `/api/sync-results` every 15 minutes.
5. To test manually, open:

```txt
https://tu-app.vercel.app/api/sync-results?secret=un_secreto_largo
```

The endpoint syncs finished FIFA World Cup 2026 matches into the `results` table. Keep manual result capture as a backup if the API has delayed scores or a match cannot be matched.
