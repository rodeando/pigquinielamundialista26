const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const FOOTBALL_DATA_URL = 'https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED';
const APP_TIME_ZONE = 'America/Mexico_City';

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

const teamAliases = {
  'bosnia herzegovina': 'bosnia and herzegovina',
  'cape verde islands': 'cape verde',
  'cote divoire': 'ivory coast',
  'cote d ivoire': 'ivory coast',
  'czech republic': 'czechia',
  'korea republic': 'south korea',
  'united states of america': 'united states',
  'usa': 'united states',
  'turkey': 'turkiye',
  'türkiye': 'turkiye',
};

const normalizeTeam = (value) => {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return teamAliases[normalized] ?? normalized;
};

const localDateKey = (dateText) => {
  const [day, monthName, year] = dateText.split(' ');
  return `${year}-${monthMap[monthName]}-${String(day).padStart(2, '0')}`;
};

const apiDateKey = (utcDate) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(utcDate));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const loadLocalMatches = () => {
  const sourcePath = path.join(process.cwd(), 'src', 'matches.js');
  try {
    const module = require(sourcePath);
    if (Array.isArray(module.MATCHES)) return module.MATCHES.map(normalizeLocalMatch);
  } catch {
    // Local Vite source uses ESM syntax; fall back to extracting the array literal.
  }

  const source = fs.readFileSync(sourcePath, 'utf8');
  const arrayMatch = source.match(/MATCHES\s*=\s*(\[[\s\S]*?\]);/);

  if (!arrayMatch) {
    throw new Error('Could not read MATCHES from src/matches.js');
  }

  const arraySource = arrayMatch[1];
  const matches = Function(`"use strict"; return (${arraySource});`)();

  return matches.map(normalizeLocalMatch);
};

const normalizeLocalMatch = (match) => ({
  ...match,
  dateKey: localDateKey(match.date),
  normalizedHome: normalizeTeam(match.home),
  normalizedAway: normalizeTeam(match.away),
});

const findLocalMatch = (localMatches, apiMatch) => {
  const dateKey = apiDateKey(apiMatch.utcDate);
  const home = normalizeTeam(apiMatch.homeTeam?.name);
  const away = normalizeTeam(apiMatch.awayTeam?.name);

  const exact = localMatches.find(
    (match) => match.dateKey === dateKey && match.normalizedHome === home && match.normalizedAway === away,
  );

  if (exact) return { match: exact, shouldSwapScore: false };

  const reversed = localMatches.find(
    (match) => match.dateKey === dateKey && match.normalizedHome === away && match.normalizedAway === home,
  );

  return reversed ? { match: reversed, shouldSwapScore: true } : null;
};

const getFinalScore = (apiMatch) => {
  const score = apiMatch.score?.fullTime ?? apiMatch.score?.regularTime;
  if (!Number.isFinite(score?.home) || !Number.isFinite(score?.away)) return null;
  return score;
};

const isAuthorized = (request) => {
  const secret = process.env.SYNC_RESULTS_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.authorization ?? '';
  const cronHeader = request.headers['x-cron-secret'] ?? '';
  const querySecret = request.query?.secret ?? '';

  return authHeader === `Bearer ${secret}` || cronHeader === secret || querySecret === secret;
};

const getJwtRole = (token) => {
  try {
    const payload = token.split('.')[1];
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalizedPayload, 'base64').toString('utf8');
    return JSON.parse(decoded).role;
  } catch {
    return null;
  }
};

module.exports = async function handler(request, response) {
  if (!isAuthorized(request)) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const footballDataToken = process.env.FOOTBALL_DATA_API_TOKEN;

  if (!supabaseUrl || !serviceRoleKey || !footballDataToken) {
    response.status(500).json({
      error: 'Missing configuration',
      required: ['SUPABASE_URL or VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FOOTBALL_DATA_API_TOKEN'],
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let footballResponse;
  try {
    footballResponse = await fetch(FOOTBALL_DATA_URL, {
      headers: { 'X-Auth-Token': footballDataToken },
    });
  } catch (error) {
    response.status(502).json({
      error: 'Football Data connection failed',
      detail: error.message,
    });
    return;
  }

  if (!footballResponse.ok) {
    const body = await footballResponse.text();
    response.status(footballResponse.status).json({
      error: 'Football Data request failed',
      detail: body,
    });
    return;
  }

  const payload = await footballResponse.json();
  const localMatches = loadLocalMatches();
  const rows = [];
  const unmatched = [];

  for (const apiMatch of payload.matches ?? []) {
    const score = getFinalScore(apiMatch);
    if (!score) continue;

    const mapped = findLocalMatch(localMatches, apiMatch);
    if (!mapped) {
      unmatched.push({
        footballDataId: apiMatch.id,
        utcDate: apiMatch.utcDate,
        home: apiMatch.homeTeam?.name,
        away: apiMatch.awayTeam?.name,
      });
      continue;
    }

    rows.push({
      match_id: mapped.match.id,
      home_score: mapped.shouldSwapScore ? score.away : score.home,
      away_score: mapped.shouldSwapScore ? score.home : score.away,
      updated_at: new Date().toISOString(),
    });
  }

  if (!rows.length) {
    response.status(200).json({
      ok: true,
      updated: 0,
      unmatched,
      message: 'No finished World Cup matches with mapped final scores were found.',
    });
    return;
  }

  const { error } = await supabase.from('results').upsert(rows, { onConflict: 'match_id' });

  if (error) {
    response.status(500).json({ error: error.message });
    return;
  }

  response.status(200).json({
    ok: true,
    updated: rows.length,
    matchIds: rows.map((row) => row.match_id),
    unmatched,
  });
};
