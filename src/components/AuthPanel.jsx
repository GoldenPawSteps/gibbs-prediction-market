import { useState } from 'react';

const VALID_MODES = new Set(['login', 'register', 'verify', 'request-reset', 'reset']);

function normalizeMode(mode) {
  return VALID_MODES.has(mode) ? mode : 'login';
}

export default function AuthPanel({
  onLogin,
  onRegister,
  onRequestVerification,
  onVerifyEmail,
  onRequestReset,
  onResetPassword,
  initialMode,
  initialEmail,
  initialToken,
  loading,
  error,
  notice,
  devToken,
  devTokenLabel,
}) {
  const [mode, setMode] = useState(normalizeMode(initialMode));
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail || '');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(initialToken || '');
  const [newPassword, setNewPassword] = useState('');

  const isRegister = mode === 'register';
  const isVerify = mode === 'verify';
  const isRequestReset = mode === 'request-reset';
  const isReset = mode === 'reset';

  const handleSubmit = async e => {
    e.preventDefault();

    if (isRegister) {
      await onRegister({ name, email, password });
      return;
    }

    if (isVerify) {
      await onVerifyEmail({ email, token });
      return;
    }

    if (isRequestReset) {
      await onRequestReset({ email });
      return;
    }

    if (isReset) {
      await onResetPassword({ email, token, newPassword });
      return;
    }

    await onLogin({ email, password });
  };

  const title = isRegister
    ? 'Create Account'
    : isVerify
      ? 'Verify Email'
      : isRequestReset
        ? 'Request Password Reset'
        : isReset
          ? 'Reset Password'
          : 'Sign In';

  return (
    <section className="panel auth-panel">
      <div className="auth-header">
        <h2 className="section-title">{title}</h2>
        <p className="panel-desc auth-desc">
          {isRegister
            ? 'Create an account to save your session and access trading controls.'
            : isVerify
              ? 'Enter your email and verification token to activate your account.'
              : isRequestReset
                ? 'Enter your email and we will issue a password reset token.'
                : isReset
                  ? 'Set a new password using your reset token.'
                  : 'Sign in to access the Gibbs market dashboard and trading tools.'}
        </p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {isRegister && (
          <label className="auth-label">
            Full Name
            <input
              className="num-input auth-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}

        <label className="auth-label">
          Email
          <input
            className="num-input auth-input"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {!isVerify && !isRequestReset && !isReset && (
          <label className="auth-label">
            Password
            <input
              className="num-input auth-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>
        )}

        {(isVerify || isReset) && (
          <label className="auth-label">
            Token
            <input
              className="num-input auth-input"
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              required
            />
          </label>
        )}

        {isReset && (
          <label className="auth-label">
            New Password
            <input
              className="num-input auth-input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
        )}

        {notice && <p className="auth-notice">{notice}</p>}
        {devToken && (
          <p className="auth-dev-token">
            {devTokenLabel || 'Dev token'}: <span className="mono">{devToken}</span>
          </p>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="btn-primary auth-submit" type="submit" disabled={loading}>
          {loading ? 'Please wait...' : title}
        </button>
      </form>

      <div className="auth-mode-toggle">
        <button type="button" className="btn-secondary" onClick={() => setMode('login')}>
          Sign In
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode('register')}>
          Create Account
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode('verify')}>
          Verify Email
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode('request-reset')}>
          Request Reset
        </button>
        <button type="button" className="btn-secondary" onClick={() => setMode('reset')}>
          Reset Password
        </button>

        {isVerify && (
          <button type="button" className="btn-secondary" onClick={() => onRequestVerification({ email })}>
            Resend Token
          </button>
        )}
      </div>
    </section>
  );
}