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
  'congo dr': 'dr congo',
  'cote divoire': 'ivory coast',
  'cote d ivoire': 'ivory coast',
  'czech republic': 'czechia',
  'korea republic': 'south korea',
  'united states of america': 'united states',
  'usa': 'united states',
  'turkey': 'turkiye',
  'türkiye': 'turkiye',
};

const footballDataMatchOverrides = {
  537417: { matchId: 73, shouldSwapScore: false },
  537423: { matchId: 76, shouldSwapScore: false },
};

const groupLetters = 'ABCDEFGHIJKL'.split('');

const thirdPlaceMatchOverrides = {
  74: 'Paraguay',
  77: 'Sweden',
  82: 'Senegal',
  85: 'Algeria',
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

const apiTimeKey = (utcDate) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcDate));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.hour}:${values.minute}`;
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
  timeKey: match.time,
  normalizedHome: normalizeTeam(match.home),
  normalizedAway: normalizeTeam(match.away),
});

const hasCompleteScore = (score) =>
  score?.homeScore !== '' &&
  score?.awayScore !== '' &&
  score?.homeScore !== undefined &&
  score?.awayScore !== undefined &&
  score?.homeScore !== null &&
  score?.awayScore !== null;

const getOutcome = (home, away) => {
  const homeScore = Number(home);
  const awayScore = Number(away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return '';
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
};

const makeTeamStats = (team, group) => ({
  team,
  group,
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
});

const compareStandings = (a, b) =>
  b.points - a.points ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor ||
  b.wins - a.wins ||
  a.team.localeCompare(b.team);

const getTeamStats = (teams, team, group) => {
  if (!teams.has(team)) teams.set(team, makeTeamStats(team, group));
  return teams.get(team);
};

const applyGroupResult = (homeStats, awayStats, result) => {
  const homeScore = Number(result.homeScore);
  const awayScore = Number(result.awayScore);

  homeStats.played += 1;
  awayStats.played += 1;
  homeStats.goalsFor += homeScore;
  homeStats.goalsAgainst += awayScore;
  awayStats.goalsFor += awayScore;
  awayStats.goalsAgainst += homeScore;
  homeStats.goalDifference = homeStats.goalsFor - homeStats.goalsAgainst;
  awayStats.goalDifference = awayStats.goalsFor - awayStats.goalsAgainst;

  if (homeScore > awayScore) {
    homeStats.wins += 1;
    awayStats.losses += 1;
    homeStats.points += 3;
  } else if (awayScore > homeScore) {
    awayStats.wins += 1;
    homeStats.losses += 1;
    awayStats.points += 3;
  } else {
    homeStats.draws += 1;
    awayStats.draws += 1;
    homeStats.points += 1;
    awayStats.points += 1;
  }
};

const mapResultRows = (rows) =>
  Object.fromEntries(
    rows.map((row) => [
      row.match_id,
      {
        homeScore: row.home_score,
        awayScore: row.away_score,
        advancingTeam: row.advancing_team ?? '',
      },
    ]),
  );

const buildGroupStandings = (matches, results) => {
  const groups = {};
  const thirdPlaceTeams = [];

  for (const group of groupLetters) {
    const groupMatches = matches.filter((match) => match.group === group);
    const teams = new Map();
    let completedMatches = 0;

    groupMatches.forEach((match) => {
      const homeStats = getTeamStats(teams, match.home, group);
      const awayStats = getTeamStats(teams, match.away, group);
      const result = results[match.id];
      if (!hasCompleteScore(result)) return;

      completedMatches += 1;
      applyGroupResult(homeStats, awayStats, result);
    });

    const standings = [...teams.values()].sort(compareStandings);
    const isComplete = groupMatches.length > 0 && completedMatches === groupMatches.length;
    groups[group] = { group, standings, isComplete };

    if (isComplete && standings[2]) thirdPlaceTeams.push(standings[2]);
  }

  return {
    groups,
    allGroupsComplete: groupLetters.every((group) => groups[group]?.isComplete),
    thirdPlaceTeams: thirdPlaceTeams.sort(compareStandings),
  };
};

const getThirdPlaceCandidates = (slotName) => slotName.match(/^3rd Group ([A-L](?:\/[A-L])*)$/)?.[1].split('/') ?? [];

const assignThirdPlaceSlots = (matches, groupData) => {
  if (!groupData.allGroupsComplete) return {};

  const thirdSlots = matches.filter((match) => match.stage === 'Ronda de 32' && getThirdPlaceCandidates(match.away).length);
  const qualifiedThirds = groupData.thirdPlaceTeams.slice(0, thirdSlots.length);
  const lockedAssignment = {};
  const lockedGroups = new Set();

  thirdSlots.forEach((slot) => {
    const overrideTeam = thirdPlaceMatchOverrides[slot.id];
    if (!overrideTeam) return;

    const candidates = getThirdPlaceCandidates(slot.away);
    const team = qualifiedThirds.find((standing) => standing.team === overrideTeam && candidates.includes(standing.group));
    if (!team) return;

    lockedAssignment[slot.id] = team.team;
    lockedGroups.add(team.group);
  });

  const openSlots = thirdSlots.filter((slot) => !lockedAssignment[slot.id]);
  let bestAssignment = null;

  const search = (slotIndex, usedGroups, assignment) => {
    if (slotIndex === openSlots.length) {
      bestAssignment = assignment;
      return true;
    }

    const slot = openSlots[slotIndex];
    const candidates = getThirdPlaceCandidates(slot.away);

    for (const team of qualifiedThirds) {
      if (usedGroups.has(team.group) || !candidates.includes(team.group)) continue;

      const nextUsedGroups = new Set(usedGroups);
      nextUsedGroups.add(team.group);
      if (search(slotIndex + 1, nextUsedGroups, { ...assignment, [slot.id]: team.team })) return true;
    }

    return false;
  };

  search(0, lockedGroups, lockedAssignment);
  return bestAssignment ?? {};
};

const getResolvedGroupTeam = (slotName, groupData) => {
  const winnerGroup = slotName.match(/^Winner Group ([A-L])$/)?.[1];
  if (winnerGroup) return groupData.groups[winnerGroup]?.isComplete ? groupData.groups[winnerGroup].standings[0]?.team : slotName;

  const runnerUpGroup = slotName.match(/^Runner-up Group ([A-L])$/)?.[1];
  if (runnerUpGroup) return groupData.groups[runnerUpGroup]?.isComplete ? groupData.groups[runnerUpGroup].standings[1]?.team : slotName;

  return slotName;
};

const resolveKnockoutTeam = (slotName, matches, results, groupData, thirdAssignments, currentMatchId, visited = new Set()) => {
  const groupTeam = getResolvedGroupTeam(slotName, groupData);
  if (groupTeam !== slotName) return groupTeam;

  if (getThirdPlaceCandidates(slotName).length) return thirdAssignments[currentMatchId] ?? slotName;

  const matchReference = slotName.match(/^(Winner|Loser) Match (\d+)$/);
  if (!matchReference) return slotName;

  const [, referenceType, referenceIdValue] = matchReference;
  const referenceId = Number(referenceIdValue);
  if (visited.has(referenceId)) return slotName;

  const referenceMatch = matches.find((match) => match.id === referenceId);
  const referenceResult = results[referenceId];
  if (!referenceMatch || !hasCompleteScore(referenceResult)) return slotName;

  visited.add(referenceId);
  const resolvedHome = resolveKnockoutTeam(referenceMatch.home, matches, results, groupData, thirdAssignments, referenceId, new Set(visited));
  const resolvedAway = resolveKnockoutTeam(referenceMatch.away, matches, results, groupData, thirdAssignments, referenceId, new Set(visited));
  const referenceOutcome = getOutcome(referenceResult.homeScore, referenceResult.awayScore);

  if (referenceOutcome === 'draw') {
    if (!referenceResult.advancingTeam) return slotName;
    const loser = referenceResult.advancingTeam === resolvedHome ? resolvedAway : resolvedHome;
    return referenceType === 'Winner' ? referenceResult.advancingTeam : loser;
  }

  const homeWins = referenceOutcome === 'home';
  const teamSlot =
    (referenceType === 'Winner' && homeWins) || (referenceType === 'Loser' && !homeWins)
      ? referenceMatch.home
      : referenceMatch.away;

  return resolveKnockoutTeam(teamSlot, matches, results, groupData, thirdAssignments, referenceId, visited);
};

const resolveLocalMatches = (matches, results) => {
  const groupData = buildGroupStandings(matches, results);
  const thirdAssignments = assignThirdPlaceSlots(matches, groupData);

  return matches.map((match) =>
    normalizeLocalMatch({
      ...match,
      home: resolveKnockoutTeam(match.home, matches, results, groupData, thirdAssignments, match.id),
      away: resolveKnockoutTeam(match.away, matches, results, groupData, thirdAssignments, match.id),
    }),
  );
};

const findLocalMatch = (localMatches, apiMatch) => {
  const override = footballDataMatchOverrides[apiMatch.id];
  if (override) {
    const match = localMatches.find((item) => item.id === override.matchId);
    if (match) return { match, shouldSwapScore: override.shouldSwapScore, method: 'football-data-id' };
  }

  const dateKey = apiDateKey(apiMatch.utcDate);
  const timeKey = apiTimeKey(apiMatch.utcDate);
  const home = normalizeTeam(apiMatch.homeTeam?.name);
  const away = normalizeTeam(apiMatch.awayTeam?.name);

  const exact = localMatches.find(
    (match) => match.dateKey === dateKey && match.normalizedHome === home && match.normalizedAway === away,
  );

  if (exact) return { match: exact, shouldSwapScore: false, method: 'exact' };

  const reversed = localMatches.find(
    (match) => match.dateKey === dateKey && match.normalizedHome === away && match.normalizedAway === home,
  );

  if (reversed) return { match: reversed, shouldSwapScore: true, method: 'reversed' };

  const timeFallback = localMatches.find((match) => match.dateKey === dateKey && match.timeKey === timeKey && match.id >= 73);

  return timeFallback ? { match: timeFallback, shouldSwapScore: false, method: 'time-fallback' } : null;
};

const getFinalScore = (apiMatch) => {
  const score = apiMatch.score?.regularTime ?? apiMatch.score?.fullTime;
  if (!Number.isFinite(score?.home) || !Number.isFinite(score?.away)) return null;
  return score;
};

const getAdvancingTeam = (apiMatch, mapped) => {
  const score = getFinalScore(apiMatch);
  if (!score || getOutcome(score.home, score.away) !== 'draw') return null;

  const winner = apiMatch.score?.winner;
  if (winner === 'HOME_TEAM') return mapped.shouldSwapScore ? mapped.match.away : mapped.match.home;
  if (winner === 'AWAY_TEAM') return mapped.shouldSwapScore ? mapped.match.home : mapped.match.away;

  const fullTime = apiMatch.score?.fullTime;
  if (Number.isFinite(fullTime?.home) && Number.isFinite(fullTime?.away) && fullTime.home !== fullTime.away) {
    const apiHomeAdvanced = fullTime.home > fullTime.away;
    return apiHomeAdvanced === !mapped.shouldSwapScore ? mapped.match.home : mapped.match.away;
  }

  return null;
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
  let { data: resultRows, error: resultsError } = await supabase
    .from('results')
    .select('match_id,home_score,away_score,advancing_team');

  if (resultsError?.message?.includes('advancing_team')) {
    ({ data: resultRows, error: resultsError } = await supabase.from('results').select('match_id,home_score,away_score'));
  }

  if (resultsError) {
    response.status(500).json({ error: resultsError.message });
    return;
  }

  const localMatches = resolveLocalMatches(loadLocalMatches(), mapResultRows(resultRows ?? []));
  const rows = [];
  const mappedRows = [];
  const unmatched = [];
  const skippedNoScore = [];
  const wantsDebug = ['1', 'true', 'yes'].includes(String(request.query?.debug ?? '').toLowerCase());

  for (const apiMatch of payload.matches ?? []) {
    const score = getFinalScore(apiMatch);
    if (!score) {
      skippedNoScore.push({
        footballDataId: apiMatch.id,
        utcDate: apiMatch.utcDate,
        status: apiMatch.status,
        home: apiMatch.homeTeam?.name,
        away: apiMatch.awayTeam?.name,
        score: apiMatch.score,
      });
      continue;
    }

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

    const row = {
      match_id: mapped.match.id,
      home_score: mapped.shouldSwapScore ? score.away : score.home,
      away_score: mapped.shouldSwapScore ? score.home : score.away,
      advancing_team: getAdvancingTeam(apiMatch, mapped),
      updated_at: new Date().toISOString(),
    };

    rows.push(row);
    mappedRows.push({
      footballDataId: apiMatch.id,
      utcDate: apiMatch.utcDate,
      apiHome: apiMatch.homeTeam?.name,
      apiAway: apiMatch.awayTeam?.name,
      matchId: mapped.match.id,
      localHome: mapped.match.home,
      localAway: mapped.match.away,
      localDate: mapped.match.date,
      localTime: mapped.match.time,
      method: mapped.method,
      row: {
        match_id: row.match_id,
        home_score: row.home_score,
        away_score: row.away_score,
        advancing_team: row.advancing_team,
      },
    });
  }

  if (!rows.length) {
    const compactResponse = {
      ok: true,
      updated: 0,
      footballDataMatches: payload.matches?.length ?? 0,
      matchIds: [],
      skippedNoScoreIds: skippedNoScore.map((match) => match.footballDataId),
      unmatchedIds: unmatched.map((match) => match.footballDataId),
      message: 'No finished World Cup matches with mapped final scores were found.',
    };
    response.status(200).json(
      wantsDebug
        ? { ...compactResponse, mapped: mappedRows, skippedNoScore, unmatched }
        : compactResponse,
    );
    return;
  }

  const { data: savedRows, error } = await supabase
    .from('results')
    .upsert(rows, { onConflict: 'match_id' })
    .select('match_id,home_score,away_score,advancing_team,updated_at');

  if (error) {
    response.status(500).json({ error: error.message });
    return;
  }

  const compactResponse = {
    ok: true,
    updated: rows.length,
    footballDataMatches: payload.matches?.length ?? 0,
    matchIds: rows.map((row) => row.match_id),
    savedMatchIds: (savedRows ?? []).map((row) => row.match_id),
    skippedNoScoreIds: skippedNoScore.map((match) => match.footballDataId),
    unmatchedIds: unmatched.map((match) => match.footballDataId),
  };

  response.status(200).json(
    wantsDebug
      ? { ...compactResponse, mapped: mappedRows, savedRows, skippedNoScore, unmatched }
      : compactResponse,
  );
};
