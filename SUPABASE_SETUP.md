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
