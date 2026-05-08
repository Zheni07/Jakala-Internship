import React from 'react';

export function UiCard({ children, className = '', style }) {
  return (
    <div className={`ui-card ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function UiButton({ children, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`ui-btn ui-btn--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function UiField({ label, children, hint }) {
  return (
    <label className="ui-field">
      {label && <span className="ui-field__label">{label}</span>}
      {children}
      {hint && <span className="ui-field__hint">{hint}</span>}
    </label>
  );
}

export function UiBanner({ children, tone = 'info' }) {
  return <div className={`ui-banner ui-banner--${tone}`}>{children}</div>;
}

export function UiPageHeader({ title, subtitle }) {
  return (
    <header className="ui-page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

export function UiEmptyState({ children }) {
  return <div className="ui-empty">{children}</div>;
}

export function UiDataTable({ rows }) {
  if (!rows || rows.length === 0) return null;
  const headers = Object.keys(rows[0] || {});
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {headers.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {headers.map((key) => (
                <td key={key}>{String(row[key] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
