import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { apiJson, setToken, getToken, clearToken, API_BASE, getDbSlot, setDbSlot } from './api';
import { UiBanner, UiButton, UiCard, UiField } from './ui';

function AuthTopHeader() {
  return (
    <header className="modern-header ui-auth-header">
      <Link to="/" className="logo-title modern-header-logo-link">DataFlow Studio</Link>
      <nav className="modern-header-auth" aria-label="Account">
        <Link to="/register" className="modern-header-auth-btn modern-header-auth-btn--ghost">Register</Link>
        <Link to="/login" className="modern-header-auth-btn modern-header-auth-btn--primary">Log in</Link>
      </nav>
    </header>
  );
}

export function RequireAuth({ children }) {
  const navigate = useNavigate();
  useEffect(() => {
    const onLost = () => {
      clearToken();
      navigate('/login', { replace: true });
    };
    window.addEventListener('dfs-auth-lost', onLost);
    return () => window.removeEventListener('dfs-auth-lost', onLost);
  }, [navigate]);
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiJson('/auth/login', { method: 'POST', json: { email, password } });
      setToken(data.token);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  };

  return (
    <div className="ui-auth-page">
      <AuthTopHeader />
      <div className="ui-auth-wrap">
        <UiCard className="ui-auth-card">
          <h1 className="ui-auth-title">Log in</h1>
          <p className="ui-auth-subtitle">DataFlow Studio</p>
          {error && <UiBanner tone="error">{error}</UiBanner>}
          <form onSubmit={submit}>
            <UiField label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </UiField>
            <UiField label="Password">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </UiField>
            <UiButton type="submit" variant="primary" style={{ width: '100%' }}>Sign in</UiButton>
          </form>
          <p style={{ marginTop: 20, fontSize: 14, color: '#64748b' }}>
            No account? <Link to="/register" style={{ color: '#2563eb' }}>Register</Link>
          </p>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            <Link to="/" style={{ color: '#94a3b8' }}>← Home</Link>
          </p>
        </UiCard>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const data = await apiJson('/auth/register', { method: 'POST', json: { email, password } });
      setToken(data.token);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message || 'Registration failed');
    }
  };

  return (
    <div className="ui-auth-page">
      <AuthTopHeader />
      <div className="ui-auth-wrap">
        <UiCard className="ui-auth-card">
          <h1 className="ui-auth-title">Register</h1>
          <p className="ui-auth-subtitle">You get an empty workspace. After signing in, upload a SQLite file (.sqlite or .db) from the top bar to work with data.</p>
          {error && <UiBanner tone="error">{error}</UiBanner>}
          <form onSubmit={submit}>
            <UiField label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </UiField>
            <UiField label="Password (min. 6 characters)">
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
            </UiField>
            <UiButton type="submit" variant="success" style={{ width: '100%' }}>Create account</UiButton>
          </form>
          <p style={{ marginTop: 20, fontSize: 14, color: '#64748b' }}>
            Already have an account? <Link to="/login" style={{ color: '#2563eb' }}>Log in</Link>
          </p>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            <Link to="/" style={{ color: '#94a3b8' }}>← Home</Link>
          </p>
        </UiCard>
      </div>
    </div>
  );
}

export function AppUserBar() {
  const navigate = useNavigate();
  const barRef = useRef(null);
  const [email, setEmail] = useState('');
  const [uploadMsg, setUploadMsg] = useState('');
  const [activeSlot, setActiveSlot] = useState(getDbSlot());
  const [slotStatuses, setSlotStatuses] = useState({ db1: { hasDatabase: false }, db2: { hasDatabase: false } });

  const refreshMe = () => {
    apiJson('/auth/me')
      .then((d) => {
        setEmail(d.user?.email || '');
        setSlotStatuses(d.dbSlots || { db1: { hasDatabase: false }, db2: { hasDatabase: false } });
        if (d.activeDbSlot) {
          setDbSlot(d.activeDbSlot);
          setActiveSlot(d.activeDbSlot);
        }
      })
      .catch(() => {
        setEmail('');
        setSlotStatuses({ db1: { hasDatabase: false }, db2: { hasDatabase: false } });
      });
  };

  useEffect(() => {
    refreshMe();
    const onSlotChanged = () => refreshMe();
    window.addEventListener('dfs-db-slot-changed', onSlotChanged);
    return () => {
      window.removeEventListener('dfs-db-slot-changed', onSlotChanged);
    };
  }, []);

  useEffect(() => {
    const updateBarHeight = () => {
      const h = barRef.current ? barRef.current.offsetHeight : 0;
      document.documentElement.style.setProperty('--app-userbar-height', `${h}px`);
    };

    updateBarHeight();
    window.addEventListener('resize', updateBarHeight);
    return () => {
      window.removeEventListener('resize', updateBarHeight);
    };
  }, [slotStatuses, uploadMsg, activeSlot]);

  const logout = () => {
    clearToken();
    navigate('/login', { replace: true });
  };

  const onDbFile = (slot) => async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadMsg(`Uploading to ${slot.toUpperCase()}…`);
    try {
      const fd = new FormData();
      fd.append('database', file);
      const res = await fetch(`${API_BASE}/auth/upload-database/${slot}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'x-database-slot': slot },
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setDbSlot(slot);
      setActiveSlot(slot);
      setUploadMsg(`Database saved to ${slot.toUpperCase()}. Active slot switched.`);
      setSlotStatuses((prev) => ({ ...prev, [slot]: { hasDatabase: true } }));
      setTimeout(() => setUploadMsg(''), 4000);
      window.dispatchEvent(new CustomEvent('dfs-db-slot-changed', { detail: { slot } }));
    } catch (err) {
      setUploadMsg(err.message || 'Error');
    }
  };

  const onSwitchSlot = (slot) => {
    setDbSlot(slot);
    setActiveSlot(slot);
    window.dispatchEvent(new CustomEvent('dfs-db-slot-changed', { detail: { slot } }));
  };

  return (
    <div ref={barRef} className="app-userbar-wrap" style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {!slotStatuses[activeSlot]?.hasDatabase && (
        <div className="app-userbar-alert" style={{ padding: '10px 20px', background: '#422006', color: '#fef3c7', fontSize: 13, borderBottom: '1px solid #78350f' }}>
          No database uploaded for {activeSlot.toUpperCase()}. Upload a SQLite file for this slot.
        </div>
      )}
      <div className="app-userbar-main" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', background: '#0f172a', color: '#e2e8f0', borderBottom: '1px solid #1e293b' }}>
      <span style={{ fontSize: 13, opacity: 0.9 }}>{email}</span>
      <select value={activeSlot} onChange={(e) => onSwitchSlot(e.target.value)} style={{ background: '#111827', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px' }}>
        <option value="db1">DB1 {slotStatuses.db1?.hasDatabase ? '✅' : '—'}</option>
        <option value="db2">DB2 {slotStatuses.db2?.hasDatabase ? '✅' : '—'}</option>
      </select>
      <label className="ui-upload-btn" htmlFor="dfs-upload-db1">
        Upload to DB1
        <input id="dfs-upload-db1" type="file" accept=".sqlite,.db,.sqlite3,application/octet-stream" style={{ display: 'none' }} onChange={onDbFile('db1')} />
      </label>
      <label className="ui-upload-btn" htmlFor="dfs-upload-db2">
        Upload to DB2
        <input id="dfs-upload-db2" type="file" accept=".sqlite,.db,.sqlite3,application/octet-stream" style={{ display: 'none' }} onChange={onDbFile('db2')} />
      </label>
      {uploadMsg && <span style={{ fontSize: 12, color: '#94a3b8' }}>{uploadMsg}</span>}
      <button type="button" onClick={logout} style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#e2e8f0', cursor: 'pointer', fontSize: 13 }}>
        Log out
      </button>
      </div>
    </div>
  );
}
