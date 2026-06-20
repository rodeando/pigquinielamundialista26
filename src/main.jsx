import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Search,
  ShieldCheck,
  Trophy,
  UserPlus,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MATCHES } from './matches.js';
import pigMascot from './assets/pig-mascot.png';
import { isSupabaseConfigured, supabase } from './supabaseClient.js';
import './styles.css';

const NOTIFIED_KEY = 'quiniela2026:notified-phases';
const NOTIFICATION_HOURS_BEFORE = 24;
const DEFAULT_KICKOFF_TIME = '23:59';
const APP_TIME_ZONE = 'America/Mexico_City';
const APP_TIME_ZONE_LABEL = 'CDMX';
const APP_UTC_OFFSET = '-06:00';
const MATCH_DURATION_MINUTES = 120;
const BONUS_DEADLINE_AT = new Date('2026-06-19T23:59:00-06:00').getTime();

const bonusFields = [
  {
    key: 'worldChampion',
    column: 'world_champion',
    label: 'Campeon del mundo',
    points: 10,
    placeholder: 'Seleccion campeona',
  },
  {
    key: 'topScorer',
    column: 'top_scorer',
    label: 'Goleador del mundial',
    points: 5,
    placeholder: 'Nombre del jugador',
  },
  {
    key: 'bestGoalkeeper',
    column: 'best_goalkeeper',
    label: 'Mejor portero del mundial',
    points: 5,
    placeholder: 'Nombre del portero',
  },
];

const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const normalizeEmail = (email) => email.trim().toLowerCase();

const getSessionProfile = (activeSession) => {
  const email = normalizeEmail(activeSession?.user?.email ?? '');
  if (!activeSession?.user?.id || !email) return null;
  return {
    id: activeSession.user.id,
    email,
    name: activeSession.user.user_metadata?.name ?? email.split('@')[0],
  };
};

const logSupabaseError = (label, error) => {
  if (error) console.error(`Supabase ${label} error:`, error);
};

const getSupabaseErrorSummary = (resultsByLabel) =>
  Object.entries(resultsByLabel)
    .filter(([, result]) => result?.error)
    .map(([label, result]) => `${label}: ${result.error.message}`);

const getAuthErrorMessage = (error) => {
  const message = error?.message?.toLowerCase() ?? '';

  if (message.includes('rate limit')) {
    return 'Supabase bloqueo temporalmente el envio de correos por demasiados intentos. Espera unos minutos e intenta de nuevo.';
  }

  if (message.includes('invalid api key')) {
    return 'La llave anon public de Supabase no es valida. Revisa VITE_SUPABASE_ANON_KEY y reinicia la app.';
  }

  if (message.includes('user already registered') || message.includes('already registered')) {
    return 'Este correo ya esta registrado. Inicia sesion o recupera tu contrasena.';
  }

  return error?.message ?? 'Ocurrio un error. Intenta de nuevo.';
};

const getOutcome = (home, away) => {
  if (home === '' || away === '' || home === undefined || away === undefined) return '';
  const homeScore = Number(home);
  const awayScore = Number(away);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return '';
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
};

const hasCompleteScore = (score) =>
  score?.homeScore !== '' &&
  score?.awayScore !== '' &&
  score?.homeScore !== undefined &&
  score?.awayScore !== undefined;

const getPickPoints = (pick, result) => {
  if (!pick?.outcome || !hasCompleteScore(result)) return null;
  const resultOutcome = getOutcome(result.homeScore, result.awayScore);
  const outcomePoints = pick.outcome === resultOutcome ? 1 : 0;
  const scorePoints =
    String(pick.homeScore) === String(result.homeScore) && String(pick.awayScore) === String(result.awayScore) ? 2 : 0;
  return outcomePoints + scorePoints;
};

const outcomeLabel = {
  home: 'Local',
  draw: 'Empate',
  away: 'Visitante',
};

const playerColorPalette = [
  '#1f7a6f',
  '#dcae48',
  '#a63d2c',
  '#315f9f',
  '#7c4d96',
  '#2f8f46',
  '#c95b2c',
  '#52606d',
  '#b33f72',
  '#008c95',
];

const flagMap = {
  Algeria: '🇩🇿',
  Argentina: '🇦🇷',
  Australia: '🇦🇺',
  Austria: '🇦🇹',
  Belgium: '🇧🇪',
  'Bosnia and Herzegovina': '🇧🇦',
  Brazil: '🇧🇷',
  Canada: '🇨🇦',
  'Cape Verde': '🇨🇻',
  Colombia: '🇨🇴',
  Croatia: '🇭🇷',
  Curacao: '🇨🇼',
  Czechia: '🇨🇿',
  'DR Congo': '🇨🇩',
  Ecuador: '🇪🇨',
  Egypt: '🇪🇬',
  England: '🏴',
  France: '🇫🇷',
  Germany: '🇩🇪',
  Ghana: '🇬🇭',
  Haiti: '🇭🇹',
  Iran: '🇮🇷',
  Iraq: '🇮🇶',
  'Ivory Coast': '🇨🇮',
  Japan: '🇯🇵',
  Jordan: '🇯🇴',
  Mexico: '🇲🇽',
  Morocco: '🇲🇦',
  Netherlands: '🇳🇱',
  'New Zealand': '🇳🇿',
  Norway: '🇳🇴',
  Panama: '🇵🇦',
  Paraguay: '🇵🇾',
  Portugal: '🇵🇹',
  Qatar: '🇶🇦',
  'Saudi Arabia': '🇸🇦',
  Scotland: '🏴',
  Senegal: '🇸🇳',
  'South Africa': '🇿🇦',
  'South Korea': '🇰🇷',
  Spain: '🇪🇸',
  Sweden: '🇸🇪',
  Switzerland: '🇨🇭',
  Tunisia: '🇹🇳',
  Turkiye: '🇹🇷',
  'United States': '🇺🇸',
  Uruguay: '🇺🇾',
  Uzbekistan: '🇺🇿',
};

const stageOptions = ['Todos', ...new Set(MATCHES.map((match) => match.stage))];

const unlockPhases = [
  { order: 1, label: 'Jornada 1 grupos' },
  { order: 2, label: 'Jornada 2 grupos' },
  { order: 3, label: 'Jornada 3 grupos' },
  { order: 4, label: 'Ronda de 32' },
  { order: 5, label: 'Octavos' },
  { order: 6, label: 'Cuartos' },
  { order: 7, label: 'Semifinales' },
  { order: 8, label: 'Tercer lugar' },
  { order: 9, label: 'Final' },
];

const scheduledPhaseUnlocks = [
  { order: 2, startsAt: new Date('2026-06-17T22:00:00-06:00').getTime() },
];

const getEffectiveUnlockedOrder = (manualOrder, now = Date.now()) =>
  scheduledPhaseUnlocks.reduce(
    (order, unlock) => (now >= unlock.startsAt ? Math.max(order, unlock.order) : order),
    Number(manualOrder) || 1,
  );

const knockoutOrder = {
  'Ronda de 32': 4,
  Octavos: 5,
  Cuartos: 6,
  Semifinal: 7,
  'Tercer lugar': 8,
  Final: 9,
};

const getMatchUnlockOrder = (match) => {
  if (match.id <= 24) return 1;
  if (match.id <= 48) return 2;
  if (match.id <= 72) return 3;
  return knockoutOrder[match.stage] ?? 9;
};

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

const getMatchStartDate = (match) => {
  if (match.kickoffAt) return new Date(match.kickoffAt);
  const [day, monthName, year] = match.date.split(' ');
  const time = match.time ?? DEFAULT_KICKOFF_TIME;
  const utcOffset = match.utcOffset ?? APP_UTC_OFFSET;
  return new Date(`${year}-${monthMap[monthName]}-${String(day).padStart(2, '0')}T${time}:00${utcOffset}`);
};

const hasMatchStarted = (match, now = Date.now()) => now >= getMatchStartDate(match).getTime();

const getMatchEndDate = (match) =>
  new Date(getMatchStartDate(match).getTime() + MATCH_DURATION_MINUTES * 60 * 1000);

const hasMatchEnded = (match, now = Date.now()) => now >= getMatchEndDate(match).getTime();

const getMatchDateLabel = (match) => {
  if (match.time) return `${match.date} - ${match.time} h ${APP_TIME_ZONE_LABEL}`;
  if (!match.kickoffAt) return `${match.date} - hora ${APP_TIME_ZONE_LABEL} por confirmar`;

  return `${match.date} - ${new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: APP_TIME_ZONE,
  }).format(getMatchStartDate(match))} h ${APP_TIME_ZONE_LABEL}`;
};

const phaseStarts = unlockPhases.map((phase) => {
  const phaseMatches = MATCHES.filter((match) => getMatchUnlockOrder(match) === phase.order);
  const firstStart = Math.min(...phaseMatches.map((match) => getMatchStartDate(match).getTime()));
  return { ...phase, startsAt: firstStart };
});

function App() {
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [picks, setPicks] = useState({});
  const [bonusPicks, setBonusPicks] = useState({});
  const [results, setResults] = useState({});
  const [unlockedOrder, setUnlockedOrder] = useState(1);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('Todos');
  const [activeTab, setActiveTab] = useState('quiniela');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [showAccountPanel, setShowAccountPanel] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [accountNotice, setAccountNotice] = useState('');
  const [dataErrors, setDataErrors] = useState([]);
  const [dataStats, setDataStats] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );

  const currentUser = users.find((user) => user.id === session?.user?.id) ?? getSessionProfile(session);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      setAuthError('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return undefined;
    }

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) await loadAppData(data.session);
      setIsLoading(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY');
      if (nextSession) {
        loadAppData(nextSession);
      } else {
        setUsers([]);
        setPicks({});
        setBonusPicks({});
        setResults({});
        setDataErrors([]);
        setDataStats(null);
        setIsAdmin(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser || !notificationsEnabled || typeof Notification === 'undefined') return undefined;

    const checkNotifications = () => {
      const notified = readStorage(NOTIFIED_KEY, []);
      const notifiedSet = new Set(notified);
      const now = Date.now();
      const reminderWindow = NOTIFICATION_HOURS_BEFORE * 60 * 60 * 1000;
      const nextPhase = phaseStarts.find(
        (phase) => !notifiedSet.has(phase.order) && now >= phase.startsAt - reminderWindow && now < phase.startsAt,
      );

      if (!nextPhase) return;

      new Notification('Pig Quiniela Mundialista 26', {
        body: `${nextPhase.label} inicia pronto. Revisa tus pronosticos antes del primer partido.`,
      });
      const nextNotified = [...notifiedSet, nextPhase.order];
      writeStorage(NOTIFIED_KEY, nextNotified);
    };

    checkNotifications();
    const intervalId = window.setInterval(checkNotifications, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [currentUser, notificationsEnabled]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!isAdmin && activeTab === 'resultados') setActiveTab('quiniela');
  }, [activeTab, isAdmin]);

  const leaderboard = useMemo(() => {
    return users
      .map((user) => {
        const userPicks = picks[user.id] ?? {};
        const total = MATCHES.reduce((sum, match) => {
          const pick = userPicks[match.id];
          const result = results[match.id];
          return sum + (getPickPoints(pick, result) ?? 0);
        }, 0);

        return {
          name: user.name,
          email: user.email,
          points: total,
          picks: Object.keys(userPicks).length,
        };
      })
      .sort((a, b) => b.points - a.points || b.picks - a.picks || a.name.localeCompare(b.name));
  }, [users, picks, results]);

  const visibleMatches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MATCHES.filter((match) => {
      const stageMatch = stage === 'Todos' || match.stage === stage;
      const queryMatch =
        !term ||
        [match.home, match.away, match.venue, match.city, match.group, match.stage]
          .join(' ')
          .toLowerCase()
          .includes(term);
      return stageMatch && queryMatch;
    });
  }, [query, stage]);

  const loadAppData = async (activeSession = session) => {
    const normalizedSessionEmail = normalizeEmail(activeSession?.user?.email ?? '');
    const sessionProfile = getSessionProfile(activeSession);
    const adminQuery = normalizedSessionEmail
      ? supabase.from('admin_users').select('email').ilike('email', normalizedSessionEmail).maybeSingle()
      : Promise.resolve({ data: null });
    const [profilesResult, picksResult, bonusResult, resultsResult, settingsResult, adminResult] = await Promise.all([
      supabase.from('profiles').select('id,email,name').order('name'),
      supabase.from('picks').select('user_id,match_id,outcome,home_score,away_score'),
      supabase.from('bonus_picks').select('user_id,world_champion,top_scorer,best_goalkeeper'),
      supabase.from('results').select('match_id,home_score,away_score'),
      supabase.from('app_settings').select('key,value').eq('key', 'unlocked_phase').limit(1),
      adminQuery,
    ]);

    const queryResults = {
      profiles: profilesResult,
      picks: picksResult,
      bonus_picks: bonusResult,
      results: resultsResult,
      app_settings: settingsResult,
      admin_users: adminResult,
    };

    Object.entries(queryResults).forEach(([label, result]) => logSupabaseError(label, result.error));
    setDataErrors(getSupabaseErrorSummary(queryResults));
    setDataStats({
      profiles: profilesResult.data?.length ?? 0,
      picks: picksResult.data?.length ?? 0,
      bonusPicks: bonusResult.data?.length ?? 0,
      results: resultsResult.data?.length ?? 0,
      settings: settingsResult.data?.length ?? 0,
      admin: adminResult.data ? 1 : 0,
    });

    const nextUsers = profilesResult.data ?? [];
    if (sessionProfile && !nextUsers.some((user) => user.id === sessionProfile.id)) {
      nextUsers.push(sessionProfile);
    }
    const usersById = Object.fromEntries(nextUsers.map((user) => [user.id, user]));
    const nextPicks = {};

    for (const row of picksResult.data ?? []) {
      const user = usersById[row.user_id];
      if (!user) continue;
      nextPicks[user.id] ??= {};
      nextPicks[user.id][row.match_id] = {
        outcome: row.outcome,
        homeScore: row.home_score ?? '',
        awayScore: row.away_score ?? '',
      };
    }

    const nextBonusPicks = {};
    for (const row of bonusResult.data ?? []) {
      const user = usersById[row.user_id];
      if (!user) continue;
      nextBonusPicks[user.id] = {
        worldChampion: row.world_champion ?? '',
        topScorer: row.top_scorer ?? '',
        bestGoalkeeper: row.best_goalkeeper ?? '',
      };
    }

    const nextResults = {};
    for (const row of resultsResult.data ?? []) {
      nextResults[row.match_id] = {
        homeScore: row.home_score ?? '',
        awayScore: row.away_score ?? '',
      };
    }

    setUsers(nextUsers);
    setPicks(nextPicks);
    setBonusPicks(nextBonusPicks);
    setResults(nextResults);
    setUnlockedOrder(Number(settingsResult.data?.[0]?.value ?? 1));
    setIsAdmin(Boolean(adminResult.data));
  };

  const saveUnlockedOrder = async (nextOrder) => {
    if (!isAdmin) return;
    setUnlockedOrder(nextOrder);
    await supabase.from('app_settings').upsert({
      key: 'unlocked_phase',
      value: nextOrder,
      updated_at: new Date().toISOString(),
    });
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim();

    if (!email || !password || (authMode === 'register' && !name)) {
      setAuthError('Completa todos los campos.');
      return;
    }

    if (authMode === 'register') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setAuthError(getAuthErrorMessage(error));
        setAuthNotice('');
        return;
      }

      if (data.session) await loadAppData();
      setAuthError('');
      setAuthNotice(data.session ? '' : 'Cuenta creada. Revisa tu correo para confirmar el registro.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError('Correo o contrasena incorrectos.');
      setAuthNotice('');
      return;
    }
    setAuthError('');
    setAuthNotice('');
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(form.get('resetEmail') ?? '');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}?reset_password=true`,
    });

    if (error) {
      setAuthError(getAuthErrorMessage(error));
      setAuthNotice('');
      return;
    }

    setAuthError('');
    setAuthNotice('Te enviamos un correo para recuperar tu contrasena.');
  };

  const handleUpdateRecoveredPassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('recoveredPassword') ?? '');

    if (password.length < 6) {
      setAuthError('La nueva contrasena debe tener al menos 6 caracteres.');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAuthError(getAuthErrorMessage(error));
      return;
    }

    setIsPasswordRecovery(false);
    setAuthError('');
    setAuthNotice('Contrasena actualizada.');
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('accountPassword') ?? '');
    const confirmPassword = String(form.get('accountPasswordConfirm') ?? '');

    if (password.length < 6) {
      setAccountError('La nueva contrasena debe tener al menos 6 caracteres.');
      setAccountNotice('');
      return;
    }

    if (password !== confirmPassword) {
      setAccountError('Las contrasenas no coinciden.');
      setAccountNotice('');
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAccountError(getAuthErrorMessage(error));
      setAccountNotice('');
      return;
    }

    event.currentTarget.reset();
    setAccountError('');
    setAccountNotice('Contrasena guardada correctamente.');
  };

  const updatePick = async (matchId, patch) => {
    const match = MATCHES.find((item) => item.id === matchId);
    const effectiveUnlockedOrder = getEffectiveUnlockedOrder(unlockedOrder, now);
    if (!match || getMatchUnlockOrder(match) > effectiveUnlockedOrder || hasMatchStarted(match, now)) return;
    const current = picks[currentUser.id]?.[matchId] ?? {};
    const nextPick = { ...current, ...patch };
    if ('homeScore' in patch || 'awayScore' in patch) {
      const outcome = getOutcome(nextPick.homeScore, nextPick.awayScore);
      if (outcome) nextPick.outcome = outcome;
    }
    const nextPicks = {
      ...picks,
      [currentUser.id]: {
        ...(picks[currentUser.id] ?? {}),
        [matchId]: nextPick,
      },
    };
    setPicks(nextPicks);

    await supabase.from('picks').upsert({
      user_id: currentUser.id,
      match_id: matchId,
      outcome: nextPick.outcome,
      home_score: nextPick.homeScore === '' || nextPick.homeScore === undefined ? null : Number(nextPick.homeScore),
      away_score: nextPick.awayScore === '' || nextPick.awayScore === undefined ? null : Number(nextPick.awayScore),
      updated_at: new Date().toISOString(),
    });
  };

  const updateBonusPick = async (nextPick) => {
    if (now >= BONUS_DEADLINE_AT) return false;
    const current = bonusPicks[currentUser.id] ?? {};
    const savedPick = { ...current, ...nextPick };
    setBonusPicks({
      ...bonusPicks,
      [currentUser.id]: savedPick,
    });

    await supabase.from('bonus_picks').upsert({
      user_id: currentUser.id,
      world_champion: savedPick.worldChampion?.trim() || null,
      top_scorer: savedPick.topScorer?.trim() || null,
      best_goalkeeper: savedPick.bestGoalkeeper?.trim() || null,
      updated_at: new Date().toISOString(),
    });
    return true;
  };

  const updateResult = async (matchId, patch) => {
    if (!isAdmin) return;
    const match = MATCHES.find((item) => item.id === matchId);
    if (!match || hasMatchStarted(match, now) || hasCompleteScore(results[matchId])) return;
    const nextResult = {
      ...(results[matchId] ?? {}),
      ...patch,
    };
    setResults({
      ...results,
      [matchId]: nextResult,
    });

    await supabase.from('results').upsert({
      match_id: matchId,
      home_score: nextResult.homeScore === '' || nextResult.homeScore === undefined ? null : Number(nextResult.homeScore),
      away_score: nextResult.awayScore === '' || nextResult.awayScore === undefined ? null : Number(nextResult.awayScore),
      updated_at: new Date().toISOString(),
    });
  };

  const effectiveUnlockedOrder = getEffectiveUnlockedOrder(unlockedOrder, now);
  const bonusLocked = now >= BONUS_DEADLINE_AT;
  const userPickCount = Object.keys(picks[currentUser?.id] ?? {}).length;
  const userPosition = leaderboard.findIndex((item) => item.email === currentUser?.email) + 1;
  const userPoints = leaderboard.find((item) => item.email === currentUser?.email)?.points ?? 0;
  const unlockedMatches = MATCHES.filter((match) => getMatchUnlockOrder(match) <= effectiveUnlockedOrder).length;
  const currentPhase =
    unlockPhases.find((phase) => phase.order === effectiveUnlockedOrder)?.label ?? 'Jornada 1 grupos';
  const finishedWithoutResult = MATCHES.filter(
    (match) => hasMatchEnded(match, now) && !hasCompleteScore(results[match.id]),
  );

  if (isLoading) {
    return (
      <main className="auth-page">
        <section className="auth-panel single">
          <div>
            <p className="eyebrow">Pig Quiniela Mundialista 26</p>
            <h1>Cargando</h1>
            <p className="auth-copy">Conectando con Supabase.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="auth-page">
        <section className="auth-panel single">
          <div>
            <p className="eyebrow">Configuracion</p>
            <h1>Falta Supabase</h1>
            <p className="auth-copy">
              Agrega VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en tu archivo .env.local y en Vercel.
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <div>
            <p className="eyebrow">Mundial 2026</p>
            <h1>Pig Quiniela Mundialista 26</h1>
            <p className="auth-copy">
              Registra tu cuenta, pronostica los partidos habilitados y compite por puntos con marcador exacto.
            </p>
            <img className="auth-mascot" src={pigMascot} alt="Mascota de Pig Quiniela Mundialista 26" />
          </div>

          <div className="auth-form">
            <div className="segmented">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthNotice('');
                }}
              >
                Entrar
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => {
                  setAuthMode('register');
                  setAuthError('');
                  setAuthNotice('');
                }}
              >
                Registro
              </button>
            </div>
            {authMode === 'forgot' ? (
              <ForgotPasswordForm
                authError={authError}
                authNotice={authNotice}
                onRequest={handleForgotPassword}
                onBack={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthNotice('');
                }}
              />
            ) : (
              <form className="nested-form" onSubmit={handleAuth}>
                {authMode === 'register' && (
                  <label>
                    Nombre
                    <input name="name" autoComplete="name" />
                  </label>
                )}
                <label>
                  Correo
                  <input name="email" type="email" autoComplete="email" />
                </label>
                <PasswordField
                  name="password"
                  label="Contrasena"
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                />
                {authError && <p className="error">{authError}</p>}
                {authNotice && <p className="notice">{authNotice}</p>}
                <button className="primary" type="submit">
                  {authMode === 'register' ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
                  {authMode === 'register' ? 'Crear cuenta' : 'Iniciar sesion'}
                </button>
                {authMode === 'login' && (
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => {
                      setAuthMode('forgot');
                      setAuthError('');
                      setAuthNotice('');
                    }}
                  >
                    No recuerdo mi contrasena
                  </button>
                )}
              </form>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <img className="corner-mascot" src={pigMascot} alt="Mascota de Pig Quiniela Mundialista 26" />
      <header className="topbar">
        <div>
          <p className="eyebrow">Pig Quiniela Mundialista 26</p>
          <h1>Hola, {currentUser.name}</h1>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-text ghost"
            type="button"
            onClick={() => {
              setShowAccountPanel((value) => !value);
              setAccountError('');
              setAccountNotice('');
            }}
          >
            <KeyRound size={18} />
            Cuenta
          </button>
          <button className="icon-text ghost" onClick={() => supabase.auth.signOut()}>
            <LogOut size={18} />
            Salir
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <Metric icon={<Trophy />} label="Tus puntos" value={userPoints} />
        <Metric icon={<BarChart3 />} label="Posicion" value={userPosition || '-'} />
        <Metric icon={<Check />} label="Pronosticos" value={`${userPickCount}/${unlockedMatches}`} />
      </section>

      {isPasswordRecovery && (
        <section className="phase-panel">
          <div>
            <p className="eyebrow">Recuperacion</p>
            <h2>Crea tu nueva contrasena</h2>
          </div>
          <form className="recovery-inline" onSubmit={handleUpdateRecoveredPassword}>
            <PasswordField
              name="recoveredPassword"
              label="Nueva contrasena"
              autoComplete="new-password"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
            />
            <button className="primary" type="submit">
              <KeyRound size={18} />
              Guardar
            </button>
          </form>
          {authError && <p className="error">{authError}</p>}
        </section>
      )}

      {showAccountPanel && (
        <section className="phase-panel">
          <div>
            <p className="eyebrow">Cuenta</p>
            <h2>Guardar nueva contrasena</h2>
          </div>
          <form className="account-password-form" onSubmit={handleChangePassword}>
            <PasswordField
              name="accountPassword"
              label="Nueva contrasena"
              autoComplete="new-password"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
            />
            <PasswordField
              name="accountPasswordConfirm"
              label="Confirmar contrasena"
              autoComplete="new-password"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
            />
            <button className="primary" type="submit">
              <KeyRound size={18} />
              Guardar
            </button>
          </form>
          {accountError && <p className="error">{accountError}</p>}
          {accountNotice && <p className="notice">{accountNotice}</p>}
        </section>
      )}

      {dataErrors.length > 0 && (
        <section className="phase-panel data-alert">
          <div>
            <p className="eyebrow">Supabase</p>
            <h2>Hay tablas sin cargar</h2>
            <p>Revisa permisos RLS o ejecuta el bloque de grants. Detalle: {dataErrors.join(' | ')}</p>
          </div>
        </section>
      )}

      {dataStats && (
        <section className="phase-panel data-debug">
          <div>
            <p className="eyebrow">Diagnostico</p>
            <h2>Datos recibidos por la app</h2>
            <p>
              Perfiles: {dataStats.profiles} | Quinielas: {dataStats.picks} | Resultados: {dataStats.results} | Extras:{' '}
              {dataStats.bonusPicks} | Settings: {dataStats.settings} | Admin: {dataStats.admin}
            </p>
          </div>
        </section>
      )}

      <nav className="tabs">
        <button className={activeTab === 'quiniela' ? 'active' : ''} onClick={() => setActiveTab('quiniela')}>
          Pig Quiniela Mundialista 26
        </button>
        <button className={activeTab === 'tabla' ? 'active' : ''} onClick={() => setActiveTab('tabla')}>
          Tabla
        </button>
        <button className={activeTab === 'todos' ? 'active' : ''} onClick={() => setActiveTab('todos')}>
          Todos
        </button>
        <button className={activeTab === 'extras' ? 'active' : ''} onClick={() => setActiveTab('extras')}>
          Extras
        </button>
        {isAdmin && (
          <button className={activeTab === 'resultados' ? 'active' : ''} onClick={() => setActiveTab('resultados')}>
            Resultados
          </button>
        )}
      </nav>

      {activeTab === 'tabla' && <Leaderboard leaderboard={leaderboard} />}

      {activeTab === 'extras' && (
        <BonusPicksPanel
          users={users}
          bonusPicks={bonusPicks}
          currentPick={bonusPicks[currentUser.id] ?? {}}
          locked={bonusLocked}
          onSave={updateBonusPick}
        />
      )}

      {['quiniela', 'todos', 'resultados'].includes(activeTab) && (
        <>
          {activeTab === 'resultados' && isAdmin && (
            <section className="phase-panel">
              <div>
                <p className="eyebrow">Control de torneo</p>
                <h2>Fase abierta: {currentPhase}</h2>
                <p className={finishedWithoutResult.length ? 'pending-results-alert' : 'muted'}>
                  {finishedWithoutResult.length
                    ? `${finishedWithoutResult.length} partido(s) finalizado(s) sin resultado cargado.`
                    : 'No hay partidos finalizados pendientes de resultado.'}
                </p>
              </div>
              <div className="phase-actions">
                <button
                  className={`icon-text ${notificationsEnabled ? 'success' : 'ghost'}`}
                  type="button"
                  onClick={enableNotifications}
                >
                  <Bell size={18} />
                  {notificationsEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}
                </button>
                <label className="select-box">
                  <select
                    value={effectiveUnlockedOrder}
                    onChange={(event) => saveUnlockedOrder(Number(event.target.value))}
                  >
                    {unlockPhases.map((phase) => (
                      <option key={phase.order} value={phase.order}>
                        {phase.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} />
                </label>
              </div>
            </section>
          )}

          <section className="toolbar">
            <label className="search-box">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar equipo, sede, ciudad o grupo"
              />
            </label>
            <label className="select-box">
              <select value={stage} onChange={(event) => setStage(event.target.value)}>
                {stageOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
              <ChevronDown size={18} />
            </label>
          </section>

          <section className="matches">
            {visibleMatches.map((match) =>
              activeTab === 'quiniela' ? (
                <PredictionCard
                  key={match.id}
                  match={match}
                  pick={(picks[currentUser.id] ?? {})[match.id] ?? {}}
                  result={results[match.id]}
                  locked={getMatchUnlockOrder(match) > effectiveUnlockedOrder || hasMatchStarted(match, now)}
                  lockReason={
                    hasMatchStarted(match, now)
                      ? 'El partido ya inicio'
                      : `Se habilitara en ${unlockPhases.find((phase) => phase.order === getMatchUnlockOrder(match))?.label}`
                  }
                  onChange={(patch) => updatePick(match.id, patch)}
                />
              ) : activeTab === 'todos' ? (
                <AllPicksCard
                  key={match.id}
                  match={match}
                  users={users}
                  picks={picks}
                  result={results[match.id]}
                  revealed={hasMatchStarted(match, now)}
                />
              ) : isAdmin ? (
                <ResultCard
                  key={match.id}
                  match={match}
                  result={results[match.id] ?? {}}
                  started={hasMatchStarted(match, now)}
                  ended={hasMatchEnded(match, now)}
                  onChange={(patch) => updateResult(match.id, patch)}
                />
              ) : null,
            )}
          </section>
        </>
      )}
    </main>
  );
}

function BonusPicksPanel({ users, bonusPicks, currentPick, locked, onSave }) {
  const [draft, setDraft] = useState(currentPick);
  const [notice, setNotice] = useState('');
  const sortedUsers = [...users].sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    setDraft(currentPick);
  }, [currentPick]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const saved = await onSave(draft);
    setNotice(saved ? 'Resultados guardados.' : '');
  };

  return (
    <section className="bonus-layout">
      <form className={`phase-panel bonus-editor ${locked ? 'locked-card' : ''}`} onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Extras</p>
          <h2>Pronosticos especiales</h2>
          <p className="muted">
            {locked
              ? 'Captura cerrada desde viernes 19 junio 2026, 23:59 h CDMX.'
              : 'Disponibles hasta viernes 19 junio 2026, 23:59 h CDMX.'}
          </p>
        </div>
        {locked && (
          <div className="lock-banner">
            <Lock size={16} />
            Edicion cerrada
          </div>
        )}
        <div className="bonus-fields">
          {bonusFields.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="text"
                disabled={locked}
                value={draft[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(event) => {
                  setDraft({ ...draft, [field.key]: event.target.value });
                  setNotice('');
                }}
              />
              <span>{field.points} pts</span>
            </label>
          ))}
        </div>
        <div className="bonus-actions">
          <button className="primary" type="submit" disabled={locked}>
            <Check size={18} />
            Guardar resultados
          </button>
          {notice && <p className="notice">{notice}</p>}
        </div>
      </form>

      <article className={`match-card bonus-table-card ${!locked ? 'locked-card' : ''}`}>
        <div>
          <p className="eyebrow">Selecciones de todos</p>
          <h2>Extras registrados</h2>
        </div>
        {!locked ? (
          <div className="hidden-picks">
            <Eye size={18} />
            Se mostraran despues del viernes 19 junio 2026, 23:59 h CDMX
          </div>
        ) : (
          <div className="bonus-table">
            <div className="bonus-table-header">
              <strong>Jugador</strong>
              {bonusFields.map((field) => (
                <strong key={field.key}>{field.label}</strong>
              ))}
            </div>
            {sortedUsers.map((user) => {
              const pick = bonusPicks[user.id] ?? {};
              return (
                <div className="bonus-table-row" key={user.email}>
                  <strong>{user.name}</strong>
                  {bonusFields.map((field) => (
                    <span key={field.key}>{pick[field.key] || 'Sin captura'}</span>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}

function PasswordField({ name, label, autoComplete, showPassword, setShowPassword }) {
  return (
    <label>
      {label}
      <div className="password-box">
        <input
          name={name}
          type={showPassword ? 'text' : 'password'}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
          onClick={() => setShowPassword((value) => !value)}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

function ForgotPasswordForm({
  authError,
  authNotice,
  onRequest,
  onBack,
}) {
  return (
    <>
      <form className="nested-form" onSubmit={onRequest}>
        <label>
          Correo registrado
          <input name="resetEmail" type="email" autoComplete="email" />
        </label>
        <button className="primary" type="submit">
          <Mail size={18} />
          Enviar codigo
        </button>
      </form>
      {authError && <p className="error">{authError}</p>}
      {authNotice && <p className="notice">{authNotice}</p>}
      <button className="link-button" type="button" onClick={onBack}>
        Volver a iniciar sesion
      </button>
    </>
  );
}

function Metric({ icon, label, value }) {
  return (
    <article className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ScoreInputs({ value, onChange, disabled = false }) {
  return (
    <div className="score-inputs">
      <input
        type="number"
        min="0"
        disabled={disabled}
        value={value.homeScore ?? ''}
        onChange={(event) => onChange({ homeScore: event.target.value })}
        aria-label="Goles local"
      />
      <span>-</span>
      <input
        type="number"
        min="0"
        disabled={disabled}
        value={value.awayScore ?? ''}
        onChange={(event) => onChange({ awayScore: event.target.value })}
        aria-label="Goles visitante"
      />
    </div>
  );
}

function PredictionCard({ match, pick, result, locked, lockReason, onChange }) {
  const points = getPickPoints(pick, result);

  return (
    <article className={`match-card ${locked ? 'locked-card' : ''}`}>
      <MatchHeader match={match} />
      {locked && (
        <div className="lock-banner">
          <Lock size={16} />
          {lockReason}
        </div>
      )}
      <div className="teams">
        <TeamName name={match.home} align="left" />
        <span>vs</span>
        <TeamName name={match.away} align="right" />
      </div>
      <div className="choice-row">
        {['home', 'draw', 'away'].map((outcome) => (
          <button
            key={outcome}
            className={pick.outcome === outcome ? 'active' : ''}
            disabled={locked}
            onClick={() => onChange({ outcome })}
          >
            {outcomeLabel[outcome]}
          </button>
        ))}
      </div>
      <div className="prediction-footer">
        <ScoreInputs value={pick} onChange={onChange} disabled={locked} />
        <div className="points-pill">{points === null ? 'Pendiente' : `${points} pts`}</div>
      </div>
    </article>
  );
}

function AllPicksCard({ match, users, picks, result, revealed }) {
  const hasResult = hasCompleteScore(result);
  const sortedUsers = [...users].sort((a, b) => {
    if (!hasResult) return a.name.localeCompare(b.name);
    const pointsA = getPickPoints(picks[a.id]?.[match.id], result) ?? -1;
    const pointsB = getPickPoints(picks[b.id]?.[match.id], result) ?? -1;
    return pointsB - pointsA || a.name.localeCompare(b.name);
  });

  return (
    <article className={`match-card ${!revealed ? 'locked-card' : ''}`}>
      <MatchHeader match={match} />
      {!revealed && (
        <div className="lock-banner">
          <Lock size={16} />
          Los pronosticos se muestran cuando inicia el partido
        </div>
      )}
      <div className="teams">
        <TeamName name={match.home} align="left" />
        <span>vs</span>
        <TeamName name={match.away} align="right" />
      </div>
      {revealed && (
        <div className={`match-result-summary ${hasResult ? 'complete' : ''}`}>
          <strong>Resultado</strong>
          <span>
            {hasResult
              ? `${result.homeScore} - ${result.awayScore} | ${outcomeLabel[getOutcome(result.homeScore, result.awayScore)]}`
              : 'Marcador pendiente'}
          </span>
        </div>
      )}
      {revealed ? (
        <div className="all-picks-list">
          {sortedUsers.length === 0 ? (
            <div className="hidden-picks">No hay participantes cargados.</div>
          ) : sortedUsers.map((user) => {
            const pick = picks[user.id]?.[match.id];
            const pickPoints = getPickPoints(pick, result);

            return (
              <div className="all-pick-row" key={user.email}>
                <strong>{user.name}</strong>
                {pick ? (
                  <>
                    <div className="all-pick-prediction">
                      <span>{outcomeLabel[pick.outcome] ?? '-'}</span>
                      <b>{pick.homeScore ?? '-'} - {pick.awayScore ?? '-'}</b>
                    </div>
                    <span className={`match-points ${pickPoints ? 'earned' : ''}`}>
                      {pickPoints === null ? 'Pendiente' : `${pickPoints} pts`}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="all-pick-prediction muted">Sin pronostico</div>
                    <span className="match-points">0 pts</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hidden-picks">
          <Eye size={18} />
          Oculto para proteger la quiniela
        </div>
      )}
    </article>
  );
}

function ResultCard({ match, result, started, ended, onChange }) {
  const outcome = getOutcome(result.homeScore, result.awayScore);
  const hasResult = hasCompleteScore(result);
  const resultLocked = started || hasResult;
  const statusLabel = hasResult
    ? 'Resultado cerrado'
    : ended
      ? 'Finalizado: bloqueado'
      : started
        ? 'En juego: bloqueado'
        : 'Por iniciar';

  return (
    <article className="match-card result-card">
      <MatchHeader match={match} />
      <div className={`result-status ${ended && !hasResult ? 'pending' : ''}`}>
        {statusLabel}
      </div>
      <div className="teams">
        <TeamName name={match.home} align="left" />
        <span>vs</span>
        <TeamName name={match.away} align="right" />
      </div>
      <div className="prediction-footer">
        <ScoreInputs value={result} onChange={onChange} disabled={resultLocked} />
        <div className="points-pill">{outcome ? outcomeLabel[outcome] : 'Sin resultado'}</div>
      </div>
    </article>
  );
}

function MatchHeader({ match }) {
  return (
    <div className="match-meta">
      <span>#{match.id}</span>
      <span>{match.stage}</span>
      <span>{getMatchDateLabel(match)}</span>
      <span>{match.venue}, {match.city}</span>
    </div>
  );
}

function Leaderboard({ leaderboard }) {
  const chartData = leaderboard.map((item, index) => ({
    ...item,
    color: playerColorPalette[index % playerColorPalette.length],
  }));

  return (
    <section className="leaderboard-layout">
      <div className="chart-panel">
        <h2>Ranking de puntos</h2>
        {chartData.length === 0 ? (
          <div className="empty-state">No hay participantes cargados.</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 12, left: -18, bottom: 0 }} barCategoryGap="38%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="points" barSize={24} radius={[4, 4, 0, 0]}>
                {chartData.map((item) => (
                  <Cell key={item.email} fill={item.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="ranking-list">
        {chartData.map((item, index) => (
          <article key={item.email} className="ranking-item">
            <span style={{ background: item.color }}>{index + 1}</span>
            <div>
              <strong>{item.name}</strong>
              <small>{item.picks} pronosticos</small>
            </div>
            <b>{item.points}</b>
          </article>
        ))}
      </div>
    </section>
  );
}

function TeamName({ name, align }) {
  const flag = flagMap[name] ?? '🏳️';
  return (
    <strong className={`team-name ${align === 'right' ? 'right' : ''}`}>
      <span className="team-flag" aria-hidden="true">{flag}</span>
      <span>{name}</span>
    </strong>
  );
}

createRoot(document.getElementById('root')).render(<App />);
