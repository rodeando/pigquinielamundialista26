import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarChart3,
  Bell,
  Check,
  ChevronDown,
  Eye,
  Lock,
  LogOut,
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
import './styles.css';

const USERS_KEY = 'quiniela2026:users';
const SESSION_KEY = 'quiniela2026:session';
const PICKS_KEY = 'quiniela2026:picks';
const RESULTS_KEY = 'quiniela2026:results';
const UNLOCK_KEY = 'quiniela2026:unlocked-phase';
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
  const [users, setUsers] = useState(() => readStorage(USERS_KEY, []));
  const [session, setSession] = useState(() => readStorage(SESSION_KEY, null));
  const [picks, setPicks] = useState(() => readStorage(PICKS_KEY, {}));
  const [results, setResults] = useState(() => readStorage(RESULTS_KEY, {}));
  const [unlockedOrder, setUnlockedOrder] = useState(() => readStorage(UNLOCK_KEY, 1));
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('Todos');
  const [activeTab, setActiveTab] = useState('quiniela');
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );

  const currentUser = users.find((user) => user.email === session?.email);

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

  const saveUsers = (nextUsers) => {
    setUsers(nextUsers);
    writeStorage(USERS_KEY, nextUsers);
  };

  const saveSession = (nextSession) => {
    setSession(nextSession);
    writeStorage(SESSION_KEY, nextSession);
  };

  const savePicks = (nextPicks) => {
    setPicks(nextPicks);
    writeStorage(PICKS_KEY, nextPicks);
  };

  const saveResults = (nextResults) => {
    setResults(nextResults);
    writeStorage(RESULTS_KEY, nextResults);
  };

  const saveUnlockedOrder = (nextOrder) => {
    setUnlockedOrder(nextOrder);
    writeStorage(UNLOCK_KEY, nextOrder);
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  };

  const handleAuth = (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = normalizeEmail(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const name = String(form.get('name') ?? '').trim();

    if (!email || !password || (authMode === 'register' && !name)) {
      setAuthError('Completa todos los campos.');
      return;
    }

    const existingUser = users.find((user) => user.email === email);
    if (authMode === 'register') {
      if (existingUser) {
        setAuthError('Ese correo ya esta registrado.');
        return;
      }
      const nextUsers = [...users, { email, password, name }];
      saveUsers(nextUsers);
      saveSession({ email });
      setAuthError('');
      return;
    }

    if (!existingUser || existingUser.password !== password) {
      setAuthError('Correo o contrasena incorrectos.');
      return;
    }
    saveSession({ email });
    setAuthError('');
  };

  const updatePick = (matchId, patch) => {
    const match = MATCHES.find((item) => item.id === matchId);
    if (!match || getMatchUnlockOrder(match) > unlockedOrder || hasMatchStarted(match)) return;
    const current = picks[currentUser.email]?.[matchId] ?? {};
    const nextPick = { ...current, ...patch };
    if ('homeScore' in patch || 'awayScore' in patch) {
      const outcome = getOutcome(nextPick.homeScore, nextPick.awayScore);
      if (outcome) nextPick.outcome = outcome;
    }
    savePicks({
      ...picks,
      [currentUser.email]: {
        ...(picks[currentUser.email] ?? {}),
        [matchId]: nextPick,
      },
    });
  };

  const updateResult = (matchId, patch) => {
    saveResults({
      ...results,
      [matchId]: {
        ...(results[matchId] ?? {}),
        ...patch,
      },
    });
  };

  const userPickCount = Object.keys(picks[currentUser?.email] ?? {}).length;
  const userPosition = leaderboard.findIndex((item) => item.email === currentUser?.email) + 1;
  const userPoints = leaderboard.find((item) => item.email === currentUser?.email)?.points ?? 0;
  const unlockedMatches = MATCHES.filter((match) => getMatchUnlockOrder(match) <= unlockedOrder).length;
  const currentPhase = unlockPhases.find((phase) => phase.order === unlockedOrder)?.label ?? 'Jornada 1 grupos';

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

          <form className="auth-form" onSubmit={handleAuth}>
            <div className="segmented">
              <button
                type="button"
                className={authMode === 'login' ? 'active' : ''}
                onClick={() => setAuthMode('login')}
              >
                Entrar
              </button>
              <button
                type="button"
                className={authMode === 'register' ? 'active' : ''}
                onClick={() => setAuthMode('register')}
              >
                Registro
              </button>
            </div>
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
            <label>
              Contrasena
              <input name="password" type="password" autoComplete="current-password" />
            </label>
            {authError && <p className="error">{authError}</p>}
            <button className="primary" type="submit">
              {authMode === 'register' ? <UserPlus size={18} /> : <ShieldCheck size={18} />}
              {authMode === 'register' ? 'Crear cuenta' : 'Iniciar sesion'}
            </button>
          </form>
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
        <button className="icon-text ghost" onClick={() => saveSession(null)}>
          <LogOut size={18} />
          Salir
        </button>
      </header>

      <section className="stats-grid">
        <Metric icon={<Trophy />} label="Tus puntos" value={userPoints} />
        <Metric icon={<BarChart3 />} label="Posicion" value={userPosition || '-'} />
        <Metric icon={<Check />} label="Pronosticos" value={`${userPickCount}/${unlockedMatches}`} />
      </section>

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
