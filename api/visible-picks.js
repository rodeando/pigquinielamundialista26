const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const APP_UTC_OFFSET = '-06:00';
const DEFAULT_KICKOFF_TIME = '23:59';

const monthMap = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

const loadLocalMatches = () => {
  const sourcePath = path.join(process.cwd(), 'src', 'matches.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const arrayMatch = source.match(/MATCHES\s*=\s*(\[[\s\S]*?\]);/);
  if (!arrayMatch) throw new Error('Could not read MATCHES from src/matches.js');
  return Function(`"use strict"; return (${arrayMatch[1]});`)();
};

const getMatchStartDate = (match) => {
  if (match.kickoffAt) return new Date(match.kickoffAt);
  const [day, monthName, year] = match.date.split(' ');
  const time = match.time ?? DEFAULT_KICKOFF_TIME;
  return new Date(`${year}-${monthMap[monthName]}-${String(day).padStart(2, '0')}T${time}:00${APP_UTC_OFFSET}`);
};

const getJwtRole = (token) => {
  try {
    const payload = token.split('.')[1];
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8')).role;
  } catch {
    return null;
  }
};

module.exports = async function handler(request, response) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    response.status(500).json({
      error: 'Missing configuration',
      required: ['SUPABASE_URL or VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    });
    return;
  }

  if (getJwtRole(serviceRoleKey) !== 'service_role') {
    response.status(500).json({
      error: 'Invalid Supabase service role key',
      detail: 'SUPABASE_SERVICE_ROLE_KEY must be the service_role key, not the anon public key.',
    });
    return;
  }

  const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    response.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    response.status(401).json({ error: 'Invalid authorization token' });
    return;
  }

  const visibleMatchIds = loadLocalMatches()
    .filter((match) => Date.now() >= getMatchStartDate(match).getTime())
    .map((match) => match.id);

  if (visibleMatchIds.length === 0) {
    response.status(200).json({ picks: [] });
    return;
  }

  const { data, error } = await supabase
    .from('picks')
    .select('user_id,match_id,outcome,home_score,away_score,advancing_team')
    .in('match_id', visibleMatchIds);

  if (error?.message?.includes('advancing_team')) {
    const fallback = await supabase
      .from('picks')
      .select('user_id,match_id,outcome,home_score,away_score')
      .in('match_id', visibleMatchIds);

    if (fallback.error) {
      response.status(500).json({ error: fallback.error.message });
      return;
    }

    response.status(200).json({ picks: fallback.data ?? [] });
    return;
  }

  if (error) {
    response.status(500).json({ error: error.message });
    return;
  }

  response.status(200).json({ picks: data ?? [] });
};
