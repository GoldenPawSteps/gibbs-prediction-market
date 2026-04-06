import { useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useMarketState } from './hooks/useMarketState';
import { useAuth } from './hooks/useAuth';
import MathFormula from './components/MathFormula';
import AuthPanel from './components/AuthPanel';
import MarketDashboard from './components/MarketDashboard';
import './App.css';

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [darkMode, setDarkMode] = useState(true);
  const [showContinuous, setShowContinuous] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showEducation, setShowEducation] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authDevToken, setAuthDevToken] = useState('');
  const [authDevTokenLabel, setAuthDevTokenLabel] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [balance, setBalance] = useState(null);
  const [tradeError, setTradeError] = useState('');

  const market = useMarketState();
  const { loadState, exportState } = market;
  const auth = useAuth();
  const hasHydratedStateRef = useRef(false);

  // Keep balance in sync with auth.user (login, me refresh, post-trade updates)
  useEffect(() => {
    if (auth.user) {
      setBalance(auth.user.balance ?? null);
    } else {
      setBalance(null);
    }
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) {
      hasHydratedStateRef.current = false;
      setSyncStatus('idle');
      return;
    }

    let active = true;
    const hydrateStateFromServer = async () => {
      setSyncStatus('loading');
      try {
        const payload = await api('/api/market-state', { method: 'GET' });
        if (!active) return;
        if (payload?.state) {
          loadState(payload.state);
        }
        hasHydratedStateRef.current = true;
        setSyncStatus('saved');
      } catch {
        if (!active) return;
        hasHydratedStateRef.current = true;
        setSyncStatus('error');
      }
    };

    hydrateStateFromServer();

    return () => {
      active = false;
    };
  }, [auth.user, loadState]);

  useEffect(() => {
    if (!auth.user || !hasHydratedStateRef.current) return;

    const timeoutId = setTimeout(async () => {
      try {
        setSyncStatus('saving');
        await api('/api/market-state', {
          method: 'PUT',
          body: JSON.stringify({ state: exportState() }),
        });
        setSyncStatus('saved');
      } catch {
        setSyncStatus('error');
      }
    }, 700);

    return () => clearTimeout(timeoutId);
  }, [auth.user, exportState]);

  const handleLogin = async ({ email, password }) => {
    setAuthError('');
    setAuthNotice('');
    setAuthDevToken('');
    setAuthPending(true);
    try {
      await auth.login({ email, password });
      navigate('/market', { replace: true });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally {
      setAuthPending(false);
    }
  };

  const handleRegister = async ({ name, email, password }) => {
    setAuthError('');
    setAuthNotice('');
    setAuthDevToken('');
    setAuthPending(true);
    try {
      const payload = await auth.register({ name, email, password });
      setAuthNotice(payload?.message || 'Registration complete. Verify your email before signing in.');
      if (payload?.devVerificationToken) {
        setAuthDevToken(payload.devVerificationToken);
        setAuthDevTokenLabel('Dev verification token');
      }
        if (!payload?.requiresEmailVerification) {
          navigate('?mode=login', { replace: true });
        }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally {
      setAuthPending(false);
    }
  };

  const handleRequestVerification = async ({ email }) => {
    setAuthError('');
    setAuthNotice('');
    setAuthDevToken('');
    setAuthPending(true);
    try {
      const payload = await auth.requestEmailVerification({ email });
      setAuthNotice(payload?.message || 'Verification token sent if account exists.');
      if (payload?.devVerificationToken) {
        setAuthDevToken(payload.devVerificationToken);
        setAuthDevTokenLabel('Dev verification token');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send verification token.');
    } finally {
      setAuthPending(false);
    }
  };

  const handleVerifyEmail = async ({ email, token }) => {
    setAuthError('');
    setAuthNotice('');
    setAuthDevToken('');
    setAuthPending(true);
    try {
      const payload = await auth.verifyEmail({ email, token });
      setAuthNotice(payload?.message || 'Email verified. You can now sign in.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to verify email.');
    } finally {
      setAuthPending(false);
    }
  };

  const handleRequestReset = async ({ email }) => {
    setAuthError('');
    setAuthNotice('');
    setAuthDevToken('');
    setAuthPending(true);
    try {
      const payload = await auth.requestPasswordReset({ email });
      setAuthNotice(payload?.message || 'Password reset token sent if account exists.');
      if (payload?.devResetToken) {
        setAuthDevToken(payload.devResetToken);
        setAuthDevTokenLabel('Dev reset token');
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send reset token.');
    } finally {
      setAuthPending(false);
    }
  };

  const handleResetPassword = async ({ email, token, newPassword }) => {
    setAuthError('');
    setAuthNotice('');
    setAuthDevToken('');
    setAuthPending(true);
    try {
      const payload = await auth.resetPassword({ email, token, newPassword });
      setAuthNotice(payload?.message || 'Password reset complete. Sign in with your new password.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setAuthPending(false);
    }
  };

  const handleExecuteTrade = async () => {
    setTradeError('');
    try {
      const result = await api('/api/trade', {
        method: 'POST',
        body: JSON.stringify({
          deltaQs: market.deltaQs,
          priors: market.priors,
          beta: market.beta,
        }),
      });
      setBalance(result.balance);
      market.applyTradeResult(result);
    } catch (error) {
      setTradeError(error instanceof Error ? error.message : 'Trade failed.');
    }
  };

  const handleLogout = async () => {
    try {
      await auth.logout();
      navigate('/login', { replace: true });
    } catch {
      setAuthError('Unable to log out. Please try again.');
    }
  };

  const showAuthActions = Boolean(auth.user && location.pathname.startsWith('/market'));
  const searchParams = new URLSearchParams(location.search);
  const initialMode = searchParams.get('mode') || undefined;
  const initialEmail = searchParams.get('email') || undefined;
  const initialToken = searchParams.get('token') || undefined;

  return (
    <div className={`app ${darkMode ? 'dark' : 'light'}`}>
      <header className="header">
        <div className="header-inner">
          <div className="header-title">
            <span className="header-icon">⚡</span>
            <div>
              <h1 className="app-title">Gibbs Prediction Market</h1>
              <p className="app-subtitle">Log-Partition Cost Function · LMSR · Exponential Families</p>
            </div>
          </div>
          <div className="header-actions">
            {showAuthActions && (
              <div className="user-pill">
                Signed in as <strong>{auth.user?.name}</strong>
              </div>
            )}
            <button
              className="toggle-btn"
              onClick={() => setDarkMode(d => !d)}
              title="Toggle dark/light mode"
            >
              {darkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            {showAuthActions && (
              <button className="btn-secondary" onClick={handleLogout}>
                Log Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route
            path="/login"
            element={
              auth.user ? (
                <Navigate to="/market" replace />
              ) : (
                <>
                  <div className="formula-banner">
                    <MathFormula
                      formula={String.raw`C(q) = \beta \ln \sum_{i=1}^n P_i \, e^{q_i/\beta}`}
                      display
                    />
                  </div>
                  {auth.loading ? (
                    <div className="panel auth-status-panel">Checking authentication session...</div>
                  ) : (
                    <AuthPanel
                      key={location.search}
                      onLogin={handleLogin}
                      onRegister={handleRegister}
                      onRequestVerification={handleRequestVerification}
                      onVerifyEmail={handleVerifyEmail}
                      onRequestReset={handleRequestReset}
                      onResetPassword={handleResetPassword}
                      initialMode={initialMode}
                      initialEmail={initialEmail}
                      initialToken={initialToken}
                      loading={authPending}
                      error={authError}
                      notice={authNotice}
                      devToken={authDevToken}
                      devTokenLabel={authDevTokenLabel}
                    />
                  )}
                </>
              )
            }
          />
          <Route
            path="/market"
            element={
              auth.loading ? (
                <div className="panel auth-status-panel">Checking authentication session...</div>
              ) : auth.user ? (
                <MarketDashboard
                  market={market}
                  darkMode={darkMode}
                  showAdvanced={showAdvanced}
                  setShowAdvanced={setShowAdvanced}
                  showContinuous={showContinuous}
                  setShowContinuous={setShowContinuous}
                  showEducation={showEducation}
                  setShowEducation={setShowEducation}
                  syncStatus={syncStatus}
                  balance={balance}
                  onExecuteTrade={handleExecuteTrade}
                  tradeError={tradeError}
                />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to={auth.user ? '/market' : '/login'} replace />} />
        </Routes>
      </main>

      <footer className="footer">
        <p>
          Gibbs Prediction Market &middot; Log-partition cost function &middot;{' '}
          <MathFormula formula={String.raw`C(q) = \beta \ln \mathbb{E}_P[e^{q/\beta}]`} />
        </p>
      </footer>
    </div>
  );
}
