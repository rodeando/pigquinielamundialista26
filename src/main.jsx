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

const readStorage = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => localStorage.setItem(key, JSON.stringify(value));

const normalizeEmail = (email) => email.trim().toLowerCase();

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

const outcomeLabel = {
  home: 'Local',
  draw: 'Empate',
  away: 'Visitante',
};

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
  return new Date(`${year}-${monthMap[monthName]}-${String(day).padStart(2, '0')}T00:00:00-06:00`);
};

const hasMatchStarted = (match) => Date.now() >= getMatchStartDate(match).getTime();

const phaseStarts = unlockPhases.map((phase) => {
  const phaseMatches = MATCHES.filter((match) => getMatchUnlockOrder(match) === phase.order);
  const firstStart = Math.min(...phaseMatches.map((match) => getMatchStartDate(match).getTime()));
  return { ...phase, startsAt: firstStart };
});

function App() {
  const [users, setUsers] = useState([]);
  const [session, setSession] = useState(null);
  const [picks, setPicks] = useState({});
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
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );

  const currentUser = users.find((user) => user.id === session?.user?.id);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      setAuthError('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return undefined;
    }

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) await loadAppData();
      setIsLoading(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY');
      if (nextSession) {
        loadAppData();
      } else {
        setUsers([]);
        setPicks({});
        setResults({});
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

  const leaderboard = useMemo(() => {
    return users
      .map((user) => {
        const userPicks = picks[user.email] ?? {};
        const total = MATCHES.reduce((sum, match) => {
          const pick = userPicks[match.id];
          const result = results[match.id];
          if (!pick?.outcome || !hasCompleteScore(result)) return sum;
          const resultOutcome = getOutcome(result.homeScore, result.awayScore);
          const outcomePoints = pick.outcome === resultOutcome ? 1 : 0;
          const scorePoints =
            String(pick.homeScore) === String(result.homeScore) &&
            String(pick.awayScore) === String(result.awayScore)
              ? 2
              : 0;
          return sum + outcomePoints + scorePoints;
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

  const loadAppData = async () => {
    const [{ data: profiles }, { data: pickRows }, { data: resultRows }, { data: settingRows }] = await Promise.all([
      supabase.from('profiles').select('id,email,name').order('name'),
      supabase.from('picks').select('user_id,match_id,outcome,home_score,away_score'),
      supabase.from('results').select('match_id,home_score,away_score'),
      supabase.from('app_settings').select('key,value').eq('key', 'unlocked_phase').limit(1),
    ]);

    const nextUsers = profiles ?? [];
    const usersById = Object.fromEntries(nextUsers.map((user) => [user.id, user]));
    const nextPicks = {};

    for (const row of pickRows ?? []) {
      const user = usersById[row.user_id];
      if (!user) continue;
      nextPicks[user.email] ??= {};
      nextPicks[user.email][row.match_id] = {
        outcome: row.outcome,
        homeScore: row.home_score ?? '',
        awayScore: row.away_score ?? '',
      };
    }

    const nextResults = {};
    for (const row of resultRows ?? []) {
      nextResults[row.match_id] = {
        homeScore: row.home_score ?? '',
        awayScore: row.away_score ?? '',
      };
    }

    setUsers(nextUsers);
    setPicks(nextPicks);
    setResults(nextResults);
    setUnlockedOrder(Number(settingRows?.[0]?.value ?? 1));
  };

  const saveUnlockedOrder = async (nextOrder) => {
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
        setAuthError(error.message);
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
      setAuthError(error.message);
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
      setAuthError(error.message);
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
      setAccountError(error.message);
      setAccountNotice('');
      return;
    }

    event.currentTarget.reset();
    setAccountError('');
    setAccountNotice('Contrasena guardada correctamente.');
  };

  const updatePick = async (matchId, patch) => {
    const match = MATCHES.find((item) => item.id === matchId);
    if (!match || getMatchUnlockOrder(match) > unlockedOrder || hasMatchStarted(match)) return;
    const current = picks[currentUser.email]?.[matchId] ?? {};
    const nextPick = { ...current, ...patch };
    if ('homeScore' in patch || 'awayScore' in patch) {
      const outcome = getOutcome(nextPick.homeScore, nextPick.awayScore);
      if (outcome) nextPick.outcome = outcome;
    }
    const nextPicks = {
      ...picks,
      [currentUser.email]: {
        ...(picks[currentUser.email] ?? {}),
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

  const updateResult = async (matchId, patch) => {
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

  const userPickCount = Object.keys(picks[currentUser?.email] ?? {}).length;
  const userPosition = leaderboard.findIndex((item) => item.email === currentUser?.email) + 1;
  const userPoints = leaderboard.find((item) => item.email === currentUser?.email)?.points ?? 0;
  const unlockedMatches = MATCHES.filter((match) => getMatchUnlockOrder(match) <= unlockedOrder).length;
  const currentPhase = unlockPhases.find((phase) => phase.order === unlockedOrder)?.label ?? 'Jornada 1 grupos';

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
        <button className={activeTab === 'resultados' ? 'active' : ''} onClick={() => setActiveTab('resultados')}>
          Resultados
        </button>
      </nav>

      {activeTab === 'tabla' && <Leaderboard leaderboard={leaderboard} />}

      {activeTab !== 'tabla' && (
        <>
          {activeTab === 'resultados' && (
            <section className="phase-panel">
              <div>
                <p className="eyebrow">Control de torneo</p>
                <h2>Fase abierta: {currentPhase}</h2>
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
                    value={unlockedOrder}
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
                  pick={(picks[currentUser.email] ?? {})[match.id] ?? {}}
                  result={results[match.id]}
                  locked={getMatchUnlockOrder(match) > unlockedOrder || hasMatchStarted(match)}
                  lockReason={
                    hasMatchStarted(match)
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
                  revealed={hasMatchStarted(match)}
                />
              ) : (
                <ResultCard
                  key={match.id}
                  match={match}
                  result={results[match.id] ?? {}}
                  onChange={(patch) => updateResult(match.id, patch)}
                />
              ),
            )}
          </section>
        </>
      )}
    </main>
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
  const hasResult = hasCompleteScore(result);
  const resultOutcome = hasResult ? getOutcome(result.homeScore, result.awayScore) : '';
  const points =
    hasResult && pick.outcome
      ? (pick.outcome === resultOutcome ? 1 : 0) +
        (String(pick.homeScore) === String(result.homeScore) && String(pick.awayScore) === String(result.awayScore)
          ? 2
          : 0)
      : null;

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
  const resultOutcome = hasResult ? getOutcome(result.homeScore, result.awayScore) : '';

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
      {revealed ? (
        <div className="all-picks-list">
          {users.map((user) => {
            const pick = picks[user.email]?.[match.id];
            const pickPoints =
              hasResult && pick?.outcome
                ? (pick.outcome === resultOutcome ? 1 : 0) +
                  (String(pick.homeScore) === String(result.homeScore) &&
                  String(pick.awayScore) === String(result.awayScore)
                    ? 2
                    : 0)
                : null;

            return (
              <div className="all-pick-row" key={user.email}>
                <strong>{user.name}</strong>
                {pick ? (
                  <>
                    <span>{outcomeLabel[pick.outcome] ?? '-'}</span>
                    <b>{pick.homeScore ?? '-'} - {pick.awayScore ?? '-'}</b>
                    <small>{pickPoints === null ? 'Pendiente' : `${pickPoints} pts`}</small>
                  </>
                ) : (
                  <span className="muted">Sin pronostico</span>
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

function ResultCard({ match, result, onChange }) {
  const outcome = getOutcome(result.homeScore, result.awayScore);
  return (
    <article className="match-card result-card">
      <MatchHeader match={match} />
      <div className="teams">
        <TeamName name={match.home} align="left" />
        <span>vs</span>
        <TeamName name={match.away} align="right" />
      </div>
      <div className="prediction-footer">
        <ScoreInputs value={result} onChange={onChange} />
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
      <span>{match.date}</span>
      <span>{match.venue}, {match.city}</span>
    </div>
  );
}

function Leaderboard({ leaderboard }) {
  return (
    <section className="leaderboard-layout">
      <div className="chart-panel">
        <h2>Ranking de puntos</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={leaderboard} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="points" fill="#1f7a6f" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="ranking-list">
        {leaderboard.map((item, index) => (
          <article key={item.email} className="ranking-item">
            <span>{index + 1}</span>
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
