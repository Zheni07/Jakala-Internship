import React, { useEffect, useState } from 'react';
import { apiJson } from './api';
import { UiBanner, UiCard, UiEmptyState, UiPageHeader } from './ui';

export default function AIDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [snapshots, setSnapshots] = useState([]);

  const loadAnalysis = async () => {
    setLoading(true);
    setError('');
    try {
      const [data, history] = await Promise.all([
        apiJson('/ai/database-analysis'),
        apiJson('/ai/analysis-history').catch(() => ({ snapshots: [] })),
      ]);
      setAnalysis(data);
      setSnapshots(Array.isArray(history.snapshots) ? history.snapshots : []);
    } catch (err) {
      setError(err.message || 'AI analysis failed.');
      setAnalysis(null);
      setSnapshots([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalysis();
    const onDbChanged = () => loadAnalysis();
    window.addEventListener('dfs-db-slot-changed', onDbChanged);
    return () => window.removeEventListener('dfs-db-slot-changed', onDbChanged);
  }, []);

  return (
    <div style={{ padding: 40 }}>
      <UiPageHeader
        title="AI Database Dashboard"
        subtitle="Profile metrics are computed locally; AI Insights are generated only with Ollama from summary statistics (no raw row dump)."
      />
      {error && <UiBanner tone="error">{error}</UiBanner>}
      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={loadAnalysis}
          style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700 }}
        >
          Refresh AI analysis
        </button>
      </div>

      {loading && <UiCard style={{ padding: 16 }}>Running AI analysis on the database…</UiCard>}

      {!loading && !analysis && (
        <UiEmptyState>No analysis yet. Upload a database or click &quot;Refresh AI analysis&quot;.</UiEmptyState>
      )}

      {!loading && analysis && (
        <div style={{ display: 'grid', gap: 16 }}>
          <UiCard style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
              <Metric title="Tables" value={analysis.summary?.tables} />
              <Metric title="Total rows" value={analysis.summary?.totalRows} />
              <Metric title="Total columns" value={analysis.summary?.totalColumns} />
            </div>
          </UiCard>

          <UiCard style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>AI Insights</h3>
            {!analysis.aiInsights?.length && <div>No insights yet.</div>}
            {analysis.aiInsights?.map((insight, idx) => (
              <div key={`${insight.kind}-${idx}`} style={{ padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700 }}>{insight.title}</div>
                <div style={{ color: '#475569', fontSize: 14 }}>{insight.explanation}</div>
              </div>
            ))}
          </UiCard>

          <UiCard style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Latest Important Characteristics</h3>
            {snapshots.length < 2 && <div style={{ color: '#64748b' }}>At least two snapshots are required for comparison.</div>}
            {snapshots.length >= 2 && (
              <SimpleTable rows={buildLatestCharacteristicsRows(snapshots[0], snapshots[1])} />
            )}
          </UiCard>

          <UiCard style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Analysis History</h3>
            <SimpleTable rows={snapshots.slice(0, 10).map((s) => ({
              generatedAt: new Date(s.generatedAt).toLocaleString(),
              tables: s.summary?.tables ?? 0,
              totalRows: s.summary?.totalRows ?? 0,
              topTable: s.importantCharacteristics?.topTable?.table || '-',
            }))} />
          </UiCard>

          <UiCard style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Largest tables</h3>
            <SimpleTable rows={(analysis.largestTables || []).map((t) => ({
              table: t.table,
              rows: t.rowCount,
              columns: t.columnCount,
            }))} />
          </UiCard>

          <UiCard style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>Data Quality Risks</h3>
            <SimpleTable rows={(analysis.qualityRisks || []).map((r) => ({
              severity: r.severity,
              issue: r.title,
              detail: r.detail,
            }))} />
          </UiCard>
        </div>
      )}
    </div>
  );
}

function buildLatestCharacteristicsRows(currentSnapshot, previousSnapshot) {
  const rows = [];
  const cur = currentSnapshot?.importantCharacteristics || {};
  const prev = previousSnapshot?.importantCharacteristics || {};
  rows.push({
    metric: 'Top table',
    current: cur.topTable?.table || '-',
    previous: prev.topTable?.table || '-',
    change: cur.topTable?.table === prev.topTable?.table ? 'no change' : 'changed',
  });
  rows.push({
    metric: 'Top table rows',
    current: cur.topTable?.rowCount ?? 0,
    previous: prev.topTable?.rowCount ?? 0,
    change: (cur.topTable?.rowCount ?? 0) - (prev.topTable?.rowCount ?? 0),
  });
  rows.push({
    metric: 'Top risk',
    current: cur.topRisk?.title || '-',
    previous: prev.topRisk?.title || '-',
    change: cur.topRisk?.title === prev.topRisk?.title ? 'no change' : 'changed',
  });
  rows.push({
    metric: 'Top numeric column',
    current: cur.topNumeric ? `${cur.topNumeric.table}.${cur.topNumeric.column}` : '-',
    previous: prev.topNumeric ? `${prev.topNumeric.table}.${prev.topNumeric.column}` : '-',
    change: (cur.topNumeric?.column || '') === (prev.topNumeric?.column || '') ? 'no change' : 'changed',
  });
  return rows;
}

function Metric({ title, value }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff' }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{title}</div>
      <div style={{ color: '#0f172a', fontWeight: 800, fontSize: 24 }}>{value ?? 0}</div>
    </div>
  );
}

function SimpleTable({ rows }) {
  if (!rows || rows.length === 0) return <div style={{ color: '#64748b' }}>No data.</div>;
  const columns = Object.keys(rows[0]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #e2e8f0' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col} style={{ padding: 8, borderBottom: '1px solid #f1f5f9' }}>{String(row[col] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
