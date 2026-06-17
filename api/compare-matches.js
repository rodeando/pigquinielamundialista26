const fs = require('fs');
const path = require('path');

const FOOTBALL_DATA_URL = 'https://api.football-data.org/v4/competitions/WC/matches?season=2026';
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
  'congo dr': 'dr congo',
  'cote divoire': 'ivory coast',
  'cote d ivoire': 'ivory coast',
  'czech republic': 'czechia',
  'korea republic': 'south korea',
  'united states of america': 'united states',
  usa: 'united states',
  turkey: 'turkiye',
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

const normalizeLocalMatch = (match) => ({
  ...match,
  dateKey: localDateKey(match.date),
  normalizedHome: normalizeTeam(match.home),
  normalizedAway: normalizeTeam(match.away),
});

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
  if (!arrayMatch) throw new Error('Could not read MATCHES from src/matches.js');
  return Function(`"use strict"; return (${arrayMatch[1]});`)().map(normalizeLocalMatch);
};

const findLocalMatch = (localMatches, apiMatch) => {
  const dateKey = apiDateKey(apiMatch.utcDate);
  const home = normalizeTeam(apiMatch.homeTeam?.name);
  const away = normalizeTeam(apiMatch.awayTeam?.name);

  const exact = localMatches.find(
    (match) => match.dateKey === dateKey && match.normalizedHome === home && match.normalizedAway === away,
  );
  if (exact) return { match: exact, method: 'exact' };

  const reversed = localMatches.find(
    (match) => match.dateKey === dateKey && match.normalizedHome === away && match.normalizedAway === home,
  );
  if (reversed) return { match: reversed, method: 'reversed' };

  const candidates = localMatches
    .filter(
      (match) =>
        match.dateKey === dateKey &&
        [match.normalizedHome, match.normalizedAway].some((team) => team === home || team === away),
    )
    .map((match) => ({
      id: match.id,
      home: match.home,
      away: match.away,
      date: match.date,
      time: match.time,
    }));

  return { match: null, method: 'missing', candidates };
};

const isAuthorized = (request) => {
  const secret = process.env.SYNC_RESULTS_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.authorization ?? '';
  const querySecret = request.query?.secret ?? '';
  return authHeader === `Bearer ${secret}` || querySecret === secret;
};

module.exports = async function handler(request, response) {
  if (!isAuthorized(request)) {
    response.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const footballDataToken = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!footballDataToken) {
    response.status(500).json({ error: 'Missing FOOTBALL_DATA_API_TOKEN' });
    return;
  }

  let footballResponse;
  try {
    footballResponse = await fetch(FOOTBALL_DATA_URL, {
      headers: { 'X-Auth-Token': footballDataToken },
    });
  } catch (error) {
    response.status(502).json({ error: 'Football Data connection failed', detail: error.message });
    return;
  }

  if (!footballResponse.ok) {
    response.status(footballResponse.status).json({
      error: 'Football Data request failed',
      detail: await footballResponse.text(),
    });
    return;
  }

  const payload = await footballResponse.json();
  const localMatches = loadLocalMatches();
  const apiMatches = payload.matches ?? [];
  const matched = [];
  const unmatched = [];
  const reversed = [];

  for (const apiMatch of apiMatches) {
    const mapped = findLocalMatch(localMatches, apiMatch);
    const row = {
      footballDataId: apiMatch.id,
      utcDate: apiMatch.utcDate,
      localDateKeyFromApi: apiDateKey(apiMatch.utcDate),
      status: apiMatch.status,
      apiHome: apiMatch.homeTeam?.name,
      apiAway: apiMatch.awayTeam?.name,
      apiHomeNormalized: normalizeTeam(apiMatch.homeTeam?.name),
      apiAwayNormalized: normalizeTeam(apiMatch.awayTeam?.name),
      matchId: mapped.match?.id ?? null,
      localHome: mapped.match?.home ?? null,
      localAway: mapped.match?.away ?? null,
      localDate: mapped.match?.date ?? null,
      localTime: mapped.match?.time ?? null,
      method: mapped.method,
      candidates: mapped.candidates ?? undefined,
    };

    if (!mapped.match) unmatched.push(row);
    else matched.push(row);
    if (mapped.method === 'reversed') reversed.push(row);
  }

  response.status(200).json({
    ok: true,
    apiMatches: apiMatches.length,
    localMatches: localMatches.length,
    matched: matched.length,
    unmatchedCount: unmatched.length,
    reversedCount: reversed.length,
    unmatched,
    reversed,
  });
};
