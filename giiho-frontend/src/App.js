import React, { useEffect, useState, useMemo, useCallback } from "react";
import './App.css';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { api, getToken } from './api';
import { RequireAuth, LoginPage, RegisterPage, AppUserBar } from './AuthPages';
import { UiBanner, UiCard, UiDataTable, UiEmptyState, UiPageHeader } from './ui';
import AIDashboard from './AIDashboard';

function asStringArray(value) {
  return Array.isArray(value) ? value : [];
}

function LandingPage() {
  const navigate = useNavigate();
  const centerX = 210;
  const centerY = 210;
  const radius = 140;
  const nodeR = 38;
  const angles = [270, 342, 54, 126, 198];
  const labels = [
    { label: 'Transform', grad: 'transformGrad' },
    { label: 'Model', grad: 'modelGrad' },
    { label: 'Quality', grad: 'qualityGrad', sub: 'Check' },
    { label: 'Results', grad: 'resultsGrad' },
    { label: 'Raw', grad: 'rawGrad' },
  ];
  const nodes = angles.map((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    return { x: centerX + radius * Math.cos(rad), y: centerY + radius * Math.sin(rad), angle: deg, ...labels[i] };
  });
  function arcPath(cx, cy, r, startDeg, endDeg) {
    const rad = a => (a * Math.PI) / 180;
    const x1 = cx + r * Math.cos(rad(startDeg));
    const y1 = cy + r * Math.sin(rad(startDeg));
    const x2 = cx + r * Math.cos(rad(endDeg));
    const y2 = cy + r * Math.sin(rad(endDeg));
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweep = 1;
    return `M${x1} ${y1} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
  }

  return (
    <div className="modern-root">
      <header className="modern-header">
        <Link to="/" className="logo-title modern-header-logo-link">DataFlow Studio</Link>
        <nav className="modern-header-auth" aria-label="Профил">
          {getToken() ? (
            <button type="button" className="modern-header-auth-btn modern-header-auth-btn--primary" onClick={() => navigate('/app')}>
              Моето пространство
            </button>
          ) : (
            <>
              <Link to="/register" className="modern-header-auth-btn modern-header-auth-btn--ghost">Регистрация</Link>
              <Link to="/login" className="modern-header-auth-btn modern-header-auth-btn--primary">Вход в профил</Link>
            </>
          )}
        </nav>
      </header>

      <section className="modern-hero">
        <div className="hero-left">
          <h1>Transform Your Data Visually</h1>
          <p className="hero-desc">A modern platform to manage, build, and launch your data pipelines with ease. Visualize dependencies, track execution, and document everything in one place.</p>
          <button className="modern-cta" onClick={() => navigate(getToken() ? '/app' : '/login')}>Get Started</button>
        </div>
        <div className="hero-right pipeline-center">
          <svg width="420" height="420" viewBox="0 0 420 420" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block', maxWidth: '100%', transform: 'scale(1.2)' }}>
            <defs>
              <linearGradient id="rawGrad" x1="60" y1="210" x2="140" y2="290" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60a5fa" />
                <stop offset="1" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="transformGrad" x1="210" y1="60" x2="290" y2="140" gradientUnits="userSpaceOnUse">
                <stop stopColor="#2563eb" />
                <stop offset="1" stopColor="#60a5fa" />
              </linearGradient>
              <linearGradient id="modelGrad" x1="340" y1="170" x2="420" y2="250" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9" />
                <stop offset="1" stopColor="#60a5fa" />
              </linearGradient>
              <linearGradient id="qualityGrad" x1="260" y1="340" x2="340" y2="420" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f59e42" />
                <stop offset="1" stopColor="#fbbf24" />
              </linearGradient>
              <linearGradient id="resultsGrad" x1="100" y1="340" x2="180" y2="420" gradientUnits="userSpaceOnUse">
                <stop stopColor="#22c55e" />
                <stop offset="1" stopColor="#4ade80" />
              </linearGradient>
            </defs>
            <ellipse cx="210" cy="210" rx="170" ry="170" fill="#60a5fa" fillOpacity="0.07" />
			{(() => {
			  const r = radius - 10;
			  const segments = [
				{ start: 0, end: 200, color: '#3b82f6', cls: 'ring-arc ring-arc--blue' },
				{ start: 200, end: 300, color: '#22c55e', cls: 'ring-arc ring-arc--green' },
				{ start: 300, end: 360, color: '#f59e0b', cls: 'ring-arc ring-arc--orange' },
			  ];
			  return segments.map((seg, i) => (
				<path key={i} className={seg.cls} d={arcPath(centerX, centerY, r, seg.start, seg.end)} stroke={seg.color} strokeWidth="6" fill="none" strokeLinecap="round" />
			  ));
			})()}
			{nodes.map((node, i) => (
			  <g key={i}>
				<circle className={`diagram-node${i === 0 ? ' active' : ''}`} cx={node.x} cy={node.y} r={nodeR} fill={`url(#${node.grad})`} stroke="#fff" strokeWidth={i === 0 ? 4 : 6} />
				<text className="diagram-label" x={node.x} y={node.y + 7} textAnchor="middle" fontSize="18" fill="#fff">{node.label}</text>
				{node.sub && (<text className="diagram-label" x={node.x} y={node.y + 25} textAnchor="middle" fontSize="13" fill="#fff">{node.sub}</text>)}
			  </g>
			))}
          </svg>
        </div>
      </section>

      <section id="how" className="features-section timeline-features">
        <h2 className="features-title">How It Works</h2>
        <div className="features-timeline">
          {[
            { title: 'Raw Data', desc: 'Import & Organize' },
            { title: 'Transform', desc: 'Visual Builder' },
            { title: 'Model', desc: 'ML Integration' },
            { title: 'Analytics', desc: 'Live Results' },
            { title: 'Security', desc: 'Safe & Reliable' },
            { title: 'Automation', desc: 'Scheduling' },
          ].map((item, i, arr) => (
            <div className="timeline-step" key={item.title}>
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-title">{item.title}</div>
                <div className="timeline-desc">{item.desc}</div>
              </div>
              {i !== arr.length - 1 && <div className="timeline-line" />}
            </div>
          ))}
        </div>
      </section>

      <section id="why" className="modern-why no-icons-why">
        <h2>Why Choose Us?</h2>
        <p className="why-intro">Build, manage, and launch pipelines—fast.</p>
        <div className="why-list">
          {[
            { title: 'No-Code', desc: 'Drag & Drop' },
            { title: 'Clarity', desc: 'Visual Dependencies' },
            { title: 'Tracking', desc: 'Real-Time Status' },
            { title: 'Docs', desc: 'Centralized' },
            { title: 'Modern UX', desc: 'Intuitive' },
          ].map((r) => (
            <div className="why-list-item" key={r.title}>
              <span className="why-list-title">{r.title}</span>
              <span className="why-list-desc">{r.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="modern-footer">
        <div className="footer-content">
          <span>© {new Date().getFullYear()} DataFlow Studio</span>
          <a href="https://github.com/" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
        </div>
      </footer>
    </div>
  );
}

function Staging() {
  const location = useLocation();
  const [stagingName, setStagingName] = React.useState("");
  const [sqlInput, setSqlInput] = React.useState("");
  const [previewRows, setPreviewRows] = React.useState([]);
  const [previewError, setPreviewError] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState("");
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [, setStagings] = React.useState([]);
  const [selectedStaging, setSelectedStaging] = React.useState("");
  const [documentation, setDocumentation] = React.useState([]); // [{name, type, nullable, unique, description, testNull, testUnique, nullWarning, uniqueWarning}]
  const [tableDescription, setTableDescription] = React.useState("");
  const [dialect, setDialect] = React.useState("sqlite");


  // Load all saved stagings on mount or after save
  const loadStagings = useCallback(() => {
    api("/stagings")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStagings([]);
          return;
        }
        setStagings(Array.isArray(data.stagings) ? data.stagings : []);
      })
      .catch(() => {
        setStagings([]);
      });
  }, []);

  React.useEffect(() => {
    loadStagings();
  }, [saveStatus, loadStagings]);
  // Load a selected staging
  React.useEffect(() => {
    if (!selectedStaging) return;
    api(`/staging/${selectedStaging}`)
      .then(res => res.json())
      .then(data => {
        setStagingName(data?.name || selectedStaging || "");
        setSqlInput(data?.sql || "");
        setPreviewRows(data.preview || []);
        setDocumentation((data.documentation || []).map(col => {
          // Normalize field names: support both 'column' (old format) and 'name' (new format)
          const normalizedCol = {
          ...col,
            name: col.name || col.column || col.source || col.original,
            // Preserve all existing fields
            type: col.type,
            description: col.description || '',
            nullable: col.nullable,
            unique: col.unique,
          testNull: !!col.testNull,
          testUnique: !!col.testUnique,
            // Reset runtime-only fields
          nullWarning: "",
          uniqueWarning: ""
          };
          return normalizedCol;
        }));
        setTableDescription(data.tableDescription || "");
        setDialect(data.dialect || "sqlite");
        setPreviewError("");
        setSaveStatus("");
      })
      .catch(err => {
        setPreviewError("Failed to load staging: " + err.message);
      });
  }, [selectedStaging]);

  // Auto-load staging if coming from sidebar
  React.useEffect(() => {
    if (location.state && location.state.loadStaging) {
      setSelectedStaging(location.state.loadStaging);
    }
    // eslint-disable-next-line
  }, [location.state]);

  // If navigated from the Staging button, always reset selectedStaging
  React.useEffect(() => {
    if (location.state && location.state.fromStagingButton) {
      setSelectedStaging("");
      setStagingName("");
      setSqlInput("");
      setPreviewRows([]);
      setDocumentation([]);
      setTableDescription("");
      setPreviewError("");
      setSaveStatus("");
      setDialect("sqlite");
    }
    // eslint-disable-next-line
  }, [location.state]);

  // In Staging component, after saving or selecting a staging, reload tables
  React.useEffect(() => {
    if (!selectedStaging && !saveStatus) return;
    // Fetch tables to ensure staged table appears in sidebar
    api("/tables")
      .then(res => res.json())
      .then(tableList => {
        if (typeof window !== 'undefined' && window.setTables) {
          window.setTables(tableList);
        }
      });
  }, [selectedStaging, saveStatus]);

  const handlePreview = async () => {
    setPreviewError("");
    setPreviewRows([]);
    setDocumentation([]);
    setIsPreviewing(true);
    try {
      const res = await api("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlInput })
      });
      const data = await res.json();
      if (data.error) {
        setPreviewError(data.error);
      } else {
        setPreviewRows(data.preview);
        if (data.columns && data.columns.length > 0) {
          setDocumentation(data.columns.map(col => ({
            ...col,
            description: "",
            testNull: false,
            testUnique: false,
            nullWarning: "",
            uniqueWarning: ""
          })));
        } else {
          setDocumentation([]);
        }
      }
    } catch (err) {
      setPreviewError("Failed to preview: " + err.message);
    }
    setIsPreviewing(false);
  };

  const handleColumnDescriptionChange = (idx, value) => {
    setDocumentation(prev => prev.map((col, i) => i === idx ? { ...col, description: value } : col));
  };

  // Add a function to run column tests on previewRows
  const runColumnTests = (docs, previewRows) => {
    return docs.map((col, idx) => {
      let nullWarning = "";
      let uniqueWarning = "";
      if (col.testNull) {
        const hasNull = previewRows.some(row => row[col.name] === null || row[col.name] === undefined || row[col.name] === "");
        if (hasNull) nullWarning = `Warning: NULL values found in column ${col.name}.`;
      }
      if (col.testUnique) {
        const values = previewRows.map(row => row[col.name]);
        const unique = new Set(values.filter(v => v !== null && v !== undefined));
        if (unique.size < values.filter(v => v !== null && v !== undefined).length) {
          uniqueWarning = `Warning: Duplicate values found in column ${col.name}.`;
        }
      }
      return { ...col, nullWarning, uniqueWarning };
    });
  };

  // When previewRows or documentation changes, rerun tests
  React.useEffect(() => {
    if (previewRows.length > 0 && documentation.length > 0) {
      setDocumentation(prevDocs => runColumnTests(prevDocs, previewRows));
    }
    // eslint-disable-next-line
  }, [previewRows]);

  // Handler for test checkboxes
  const handleTestCheckboxChange = (idx, field) => {
    setDocumentation(prev => {
      return prev.map((col, i) => {
        if (i !== idx) return col;
        // Toggle the test field
        const updatedCol = { ...col, [field]: !col[field] };
        // Only run the test for this column
        const colName = updatedCol.name || updatedCol.source || updatedCol.original;
        let nullWarning = updatedCol.nullWarning;
        let uniqueWarning = updatedCol.uniqueWarning;
        if (field === 'testNull') {
          if (!updatedCol.testNull) {
            nullWarning = "";
          } else {
            const hasNull = previewRows.some(
              row => row[colName] === null || row[colName] === undefined || row[colName] === ""
            );
            nullWarning = hasNull ? `Warning: NULL values found in column ${colName}.` : "";
          }
        }
        if (field === 'testUnique') {
          if (!updatedCol.testUnique) {
            uniqueWarning = "";
          } else {
            const values = previewRows.map(row => row[colName]);
            const unique = new Set(values.filter(v => v !== null && v !== undefined && v !== ""));
            uniqueWarning = unique.size < values.filter(v => v !== null && v !== undefined && v !== "").length ? `Warning: Duplicate values found in column ${colName}.` : "";
          }
        }
        return { ...updatedCol, nullWarning, uniqueWarning };
      });
    });
  };

  const handleSave = async () => {
    setSaveStatus("");
    setIsSaving(true);
    try {
      const res = await api("/save-staging-sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: stagingName,
          sql: sqlInput,
          dialect,
          createTable: true,
          documentation: documentation.map(col => ({
            ...col,
            nullWarning: undefined,
            uniqueWarning: undefined
          })),
          tableDescription,
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("Staging saved successfully!");
        setSelectedStaging(stagingName); // reload this staging
        // Immediately refresh tables so Models updates
        api("/tables").then(res => res.json()).then(tableList => {
          if (typeof window !== 'undefined' && window.setTables) {
            window.setTables(tableList);
          }
        });
      } else {
        setSaveStatus(data.error || "Failed to save staging.");
      }
    } catch (err) {
      setSaveStatus("Failed to save staging: " + err.message);
    }
    setIsSaving(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fa', padding: 0 }}>
      <h1 style={{ padding: '40px 0 0 40px' }}>Manual Staging Definition</h1>
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
        {/* Remove the Load Saved Staging dropdown and its label */}
        {/* <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ fontWeight: 600 }}>Load Saved Staging:</label>
          <select
            value={selectedStaging}
            onChange={e => setSelectedStaging(e.target.value)}
            style={{ fontSize: 16, padding: 8, borderRadius: 4, border: '1px solid #ccc', minWidth: 220 }}
          >
            <option value="">-- Select --</option>
            {stagings.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div> */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
          {/* Left: SQL Editor */}
          <div style={{ flex: 2, minWidth: 0, height: '100%' }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>Staging Name</label><br />
              <input
                type="text"
                value={stagingName}
                onChange={e => setStagingName(e.target.value)}
                placeholder="e.g. stg_products_transformed"
                style={{ width: 400, fontSize: 16, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>SQL Query (SQLite dialect)</label><br />
              <textarea
                value={sqlInput}
                onChange={e => setSqlInput(e.target.value)}
                placeholder="SQL за трансформацията. Няма готови примери — започнете от вашите таблици след като качите .sqlite база; тогава използвайте Preview и Save."
                style={{ width: '100%', minHeight: 120, fontSize: 15, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={handlePreview}
                disabled={!sqlInput.trim() || isPreviewing}
                style={{ padding: '10px 24px', fontSize: 16, background: '#36f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 16 }}
              >
                {isPreviewing ? 'Previewing...' : 'Preview'}
              </button>
              <button
                onClick={handleSave}
                disabled={!stagingName.trim() || !sqlInput.trim() || isSaving}
                style={{ padding: '10px 24px', fontSize: 16, background: '#00b887', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 16 }}
              >
                {isSaving ? 'Saving...' : 'Save Staging'}
              </button>
              <button
                onClick={async () => {
                  if (!selectedStaging || !selectedStaging.startsWith('stg_')) return;
                  try {
                    const r = await api(`/download-staged/${selectedStaging}`);
                    const blob = await r.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `${selectedStaging}.csv`);
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  } catch (e) {
                    setSaveStatus('Download failed.');
                  }
                }}
                disabled={!selectedStaging || !selectedStaging.startsWith('stg_')}
                style={{ padding: '10px 24px', fontSize: 16, background: '#222b45', color: '#fff', border: 'none', borderRadius: 6, cursor: (!selectedStaging || !selectedStaging.startsWith('stg_')) ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                Download CSV
              </button>
              {saveStatus && <span style={{ marginLeft: 18, color: saveStatus.includes('success') ? '#00b887' : 'red', fontWeight: 600 }}>{saveStatus}</span>}
            </div>
            {previewError && <div style={{ color: 'red', marginBottom: 16 }}>{previewError}</div>}
            {previewRows.length > 0 && (
              <div style={{ marginTop: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 10 }}>
                <h3 style={{ marginTop: 0 }}>Preview Result (up to 100 rows)</h3>
                <div style={{ overflow: 'auto', maxHeight: 400 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {Object.keys(previewRows[0]).map(key => (
                          <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                          {Object.values(row).map((val, i) => (
                            <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          {/* Right: Documentation Panel (full height, vertical layout) */}
          <div style={{ flex: 1.5, minWidth: 420, background: '#f7fafc', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 0, marginLeft: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h3 style={{ marginTop: 0 }}>Documentation</h3>
              {/* Group Table Description and Columns Table in a flex column, so YAML is always at the bottom */}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {/* Table Description at the top */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontWeight: 600, fontSize: 14 }}>Table Description</label>
                  <textarea
                    value={tableDescription}
                    onChange={e => setTableDescription(e.target.value)}
                    placeholder="Short description of the table..."
                    style={{ width: '100%', minHeight: 96, fontSize: 15, padding: 10, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
                  />
                </div>
                {/* Columns Table (scrollable, fills available space) */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 0, minHeight: 0 }}>
                  {documentation.length > 0 ? (
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Column Name</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Type</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Description</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Test</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentation.map((col, idx) => (
                          <tr key={col.name + idx}>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>{col.source || col.original || col.name}</td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>{col.type}</td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>
                              <textarea
                                value={col.description || ""}
                                onChange={e => handleColumnDescriptionChange(idx, e.target.value)}
                                placeholder="Description..."
                                style={{ width: '100%', fontSize: 14, padding: 6, borderRadius: 4, border: '1px solid #ccc', minHeight: 48, resize: 'vertical' }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', minWidth: 120 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!col.testNull}
                                    onChange={() => handleTestCheckboxChange(idx, 'testNull')}
                                  />
                                  NULL
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!col.testUnique}
                                    onChange={() => handleTestCheckboxChange(idx, 'testUnique')}
                                  />
                                  Unique
                                </label>
                                {col.nullWarning && <div style={{ color: 'red', fontSize: 12, marginTop: 2 }}>{col.nullWarning}</div>}
                                {col.uniqueWarning && <div style={{ color: 'red', fontSize: 12, marginTop: 2 }}>{col.uniqueWarning}</div>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: '#8f9bb3', fontSize: 14 }}>No documentation generated yet. Click Preview to generate.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarNavWrapper(props) {
  const navigate = useNavigate();
  return <SidebarNav {...props} navigate={navigate} />;
}

function SidebarNav({ tables, selectedTable, setSelectedTable, sidebarStagings, curatedModels, setSelectedCurated, selectedCurated, martsModels, setSelectedMart, selectedMart, navigate }) {
  // Single-select accordion state
  const [openSection, setOpenSection] = useState(null); // 'tables' | 'staging' | 'curated' | 'marts' | null
  const [showCuratedPanel, setShowCuratedPanel] = useState(false);
  const [showMartsPanel, setShowMartsPanel] = useState(false);

  const tableList = asStringArray(tables);
  const stagingNames = asStringArray(sidebarStagings);
  const curatedNames = asStringArray(curatedModels);
  const martNames = asStringArray(martsModels);

  // Effect: When switching to 'staging', clear selected table
  React.useEffect(() => {
    if (openSection === 'staging') {
      setSelectedTable('');
    }
  }, [openSection, setSelectedTable]);

  // Add a function to filter only original (non-staged) tables
  const sourceTables = tableList.filter(
    t => !t.toLowerCase().startsWith('stg_') &&
         !t.toLowerCase().startsWith('staging') &&
         !t.toLowerCase().includes('stg') &&
         !t.toLowerCase().includes('staging') &&
         !t.toLowerCase().includes('hpjpp')
  );

  // Models should reflect only user-created staging layer objects, not raw DB table names.
  const modelTables = stagingNames;

  // Add state for delete loading and error
  const [deletingStaging, setDeletingStaging] = React.useState("");
  const [deleteError, setDeleteError] = React.useState("");

  return (
    <aside style={{ width: 220, background: '#222b45', color: '#fff', padding: 0, boxShadow: '2px 0 8px #0001', height: 'calc(100vh - var(--app-userbar-height, 0px))', minHeight: 'calc(100vh - var(--app-userbar-height, 0px))', display: 'flex', flexDirection: 'column', position: 'fixed', left: 0, top: 'var(--app-userbar-height, 0px)', zIndex: 10, overflowY: 'auto' }}>
      <div style={{ padding: '24px 0 0 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ color: '#8f9bb3', fontWeight: 700, fontSize: 15, padding: '0 0 18px 26px', letterSpacing: 1 }}>Menu</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', width: '100%' }}>
          {/* Source Accordion Button */}
          <button
            onClick={() => setOpenSection(openSection === 'source' ? null : 'source')}
            style={{
              background: 'linear-gradient(90deg, #00b887 0%, #36f 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              margin: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #00b887',
              cursor: 'pointer',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
          >
            Source
            <span style={{ marginLeft: 8 }}>{openSection === 'source' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'source' && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0 0' }}>
              {sourceTables.map(table => (
                <li key={table}>
                  <button
                    style={{
                      width: '100%',
                      background: selectedTable === table ? '#00b887' : 'transparent',
                      color: selectedTable === table ? '#222b45' : '#fff',
                      border: 'none',
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 6,
                      cursor: openSection === 'source' ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      fontWeight: selectedTable === table ? 700 : 400,
                      transition: 'background 0.2s, color 0.2s',
                      opacity: openSection === 'source' ? 1 : 0.5,
                    }}
                    disabled={openSection !== 'source'}
                    onClick={() => {
                      if (openSection === 'source') {
                        setSelectedTable(table);
                        navigate('/app');
                      }
                    }}
                  >
                    {table}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Models Accordion Button (was Tables) */}
          <button
            onClick={() => setOpenSection(openSection === 'tables' ? null : 'tables')}
            style={{
              background: 'linear-gradient(90deg, #00d68f 0%, #36f 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              margin: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #00d68f',
              cursor: 'pointer',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
          >
            Models
            <span style={{ marginLeft: 8 }}>{openSection === 'tables' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'tables' && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0 0' }}>
              {modelTables.map(table => (
                <li key={table}>
                  <button
                    style={{
                      width: '100%',
                      background: selectedTable === table ? '#00d68f' : 'transparent',
                      color: selectedTable === table ? '#222b45' : '#fff',
                      border: 'none',
                      padding: '10px 12px',
                      marginBottom: 6,
                      borderRadius: 6,
                      cursor: openSection === 'tables' ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      fontWeight: selectedTable === table ? 700 : 400,
                      transition: 'background 0.2s, color 0.2s',
                      opacity: openSection === 'tables' ? 1 : 0.5,
                    }}
                    disabled={openSection !== 'tables'}
                    onClick={() => {
                      if (openSection === 'tables') {
                        setSelectedTable(table);
                        navigate('/app');
                      }
                    }}
                  >
                    {table}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Staging Accordion Button */}
          <button
            onClick={() => setOpenSection(openSection === 'staging' ? null : 'staging')}
            style={{
              background: 'linear-gradient(90deg, #36f 0%, #00d68f 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              margin: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #36f',
              cursor: 'pointer',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
          >
            Staging
            <span style={{ marginLeft: 8 }}>{openSection === 'staging' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'staging' && (
            <div style={{ marginTop: -8, marginBottom: 12, paddingLeft: 8 }}>
              <div style={{ color: '#8f9bb3', fontSize: 13, marginBottom: 4, marginLeft: 2 }}>Saved Stagings</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {stagingNames.length === 0 && (
                  <li style={{ color: '#8f9bb3', fontSize: 13, padding: '6px 10px' }}>No stagings saved.</li>
                )}
                {stagingNames.map(name => (
                  <li key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link
                      to={`/app/staging`}
                      state={{ loadStaging: name }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, color: '#fff', textDecoration: 'none',
                        background: '#232f45', borderRadius: 6, padding: '10px 0', fontSize: 14, fontWeight: 500,
                        transition: 'background 0.15s',
                        width: '100%',
                        margin: 0,
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="3" y="5" width="14" height="10" rx="2" fill="#36f" fillOpacity="0.12" stroke="#36f" strokeWidth="1.2"/>
                        <rect x="5.5" y="7.5" width="9" height="5" rx="1" fill="#00b887" fillOpacity="0.18" stroke="#00b887" strokeWidth="0.8"/>
                      </svg>
                      {name}
                    </Link>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDeleteError("");
                        setDeletingStaging(name);
                        try {
                          const resp = await api(`/staging/${name}`, { method: 'DELETE' });
                          if (!resp.ok) {
                            const data = await resp.json();
                            setDeleteError(data.error || 'Failed to delete.');
                          } else {
                            // Refresh stagings and tables
                            api("/stagings").then(async (res) => {
                              const data = await res.json().catch(() => ({}));
                              const list = res.ok && Array.isArray(data.stagings) ? data.stagings : [];
                              if (window.setSidebarStagings) window.setSidebarStagings(list);
                            });
                            api("/tables").then(res => res.json()).then((body) => window.setTables && window.setTables(body));
                          }
                        } catch (err) {
                          setDeleteError(err.message || 'Failed to delete.');
                        }
                        setDeletingStaging("");
                      }}
                      style={{ marginLeft: 4, background: 'transparent', border: 'none', color: '#f55', cursor: deletingStaging ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16, opacity: deletingStaging === name ? 0.5 : 1 }}
                      title="Delete staging"
                      disabled={!!deletingStaging}
                    >
                      {deletingStaging === name ? '…' : '×'}
                    </button>
                  </li>
                ))}
                {deleteError && <div style={{ color: 'red', fontSize: 13, marginTop: 8 }}>{deleteError}</div>}
                {/* New Staging Button */}
                <button
                  onClick={() => navigate('/app/staging', { state: { fromStagingButton: true } })}
                  style={{
                    marginTop: 10,
                    background: '#36f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 0',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 1px 4px #0002',
                    transition: 'background 0.2s',
                  }}
                >
                  + New Staging
                </button>
              </ul>
            </div>
          )}
          {/* Curated Accordion Button */}
          <button
            onClick={() => setOpenSection(openSection === 'curated' ? null : 'curated')}
            style={{
              background: 'linear-gradient(90deg, #36f 0%, #00b887 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              margin: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #36f',
              cursor: 'pointer',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
          >
            Curated
            <span style={{ marginLeft: 8 }}>{openSection === 'curated' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'curated' && (
            <div style={{ marginTop: -8, marginBottom: 12, paddingLeft: 8 }}>
              <div style={{ color: '#8f9bb3', fontSize: 13, marginBottom: 4, marginLeft: 2 }}>Curated Models</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {curatedNames.length === 0 && (
                  <li style={{ color: '#8f9bb3', fontSize: 13, padding: '6px 10px' }}>No curated models.</li>
                )}
                {curatedNames.map(name => (
                  <li key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, color: '#fff', textDecoration: 'none',
                        background: selectedCurated === name ? '#232f45' : 'transparent', borderRadius: 6, padding: '10px 0', fontSize: 14, fontWeight: 500,
                        transition: 'background 0.15s', width: '100%', margin: 0, border: 'none', cursor: 'pointer',
                      }}
                      onClick={() => {
                        setSelectedCurated(name);
                        setSelectedTable('');
                        navigate('/app/curated');
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
                {/* New Curated Model Button */}
                <button
                  onClick={() => {
                    setSelectedCurated('');
                    setSelectedTable('');
                    navigate('/app/curated');
                  }}
                  style={{
                    marginTop: 10,
                    background: '#36f',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 0',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 1px 4px #0002',
                    transition: 'background 0.2s',
                  }}
                >
                  + New Curated Model
                </button>
                <button
                  onClick={() => setShowCuratedPanel(true)}
                  style={{
                    marginTop: 8,
                    background: 'linear-gradient(90deg, #36f 0%, #00b887 100%)',
                    color: '#fff',
                    border: '1px solid #36f',
                    borderRadius: 6,
                    padding: '10px 0',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 1px 4px #0003',
                    transition: 'background 0.2s, transform 0.1s',
                  }}
                  title="Open curated tables panel"
                >
                  Curated Model
                </button>
              </ul>
            </div>
          )}
          {/* Marts Accordion Button */}
          <button
            onClick={() => setOpenSection(openSection === 'marts' ? null : 'marts')}
            style={{
              background: 'linear-gradient(90deg, #00b887 0%, #36f 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              margin: 0,
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              userSelect: 'none',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #00b887',
              cursor: 'pointer',
              textDecoration: 'none',
              color: '#fff',
              fontWeight: 600,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
          >
            Marts
            <span style={{ marginLeft: 8 }}>{openSection === 'marts' ? '▲' : '▼'}</span>
          </button>
          {openSection === 'marts' && (
            <div style={{ marginTop: -8, marginBottom: 12, paddingLeft: 8 }}>
              <div style={{ color: '#8f9bb3', fontSize: 13, marginBottom: 4, marginLeft: 2 }}>Mart Models</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {martNames.length === 0 && (
                  <li style={{ color: '#8f9bb3', fontSize: 13, padding: '6px 10px' }}>No mart models.</li>
                )}
                {martNames.map(name => (
                  <li key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, color: '#fff', textDecoration: 'none',
                        background: selectedMart === name ? '#232f45' : 'transparent', borderRadius: 6, padding: '10px 0', fontSize: 14, fontWeight: 500,
                        transition: 'background 0.15s', width: '100%', margin: 0, border: 'none', cursor: 'pointer',
                      }}
                      onClick={() => {
                        setSelectedMart(name);
                        setSelectedTable('');
                        navigate('/app/marts');
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
                {/* New Mart Model Button */}
                <button
                  onClick={() => {
                    setSelectedMart('');
                    setSelectedTable('');
                    navigate('/app/marts');
                  }}
                  style={{
                    marginTop: 10,
                    background: '#00b887',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '10px 0',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 1px 4px #0002',
                    transition: 'background 0.2s',
                  }}
                >
                  + New Mart Model
                </button>
                <button
                  onClick={() => setShowMartsPanel(true)}
                  style={{
                    marginTop: 8,
                    background: 'linear-gradient(90deg, #00b887 0%, #36f 100%)',
                    color: '#fff',
                    border: '1px solid #00b887',
                    borderRadius: 6,
                    padding: '10px 0',
                    fontWeight: 600,
                    fontSize: 15,
                    cursor: 'pointer',
                    width: '100%',
                    boxShadow: '0 1px 4px #0003',
                    transition: 'background 0.2s, transform 0.1s',
                  }}
                  title="Open mart models panel"
                >
                  Marts model
                </button>
              </ul>
            </div>
          )}
          <button
            onClick={() => navigate('/app/ai')}
            style={{
              marginTop: 4,
              background: 'linear-gradient(90deg, #6366f1 0%, #0ea5e9 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #4f46e5',
              cursor: 'pointer',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
            title="Open AI dashboard analysis"
          >
            AI Dashboard
          </button>
          <button
            onClick={() => navigate('/app/compare')}
            style={{
              marginTop: 4,
              background: 'linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%)',
              borderRadius: 8,
              boxShadow: '0 1.5px 6px #0001',
              padding: '10px 0',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: '1.5px solid #1d4ed8',
              cursor: 'pointer',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: 1,
              textShadow: '0 1px 4px #0001',
              transition: 'box-shadow 0.2s, border 0.2s',
              minWidth: 0,
            }}
            title="Compare raw data queries against mart results"
          >
            Performance Compare
          </button>
        </div>
      </div>
      {showCuratedPanel && (
        <div style={{ position: 'fixed', top: 0, left: 220, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#f7fafc', borderRadius: 10, width: '520px', maxHeight: '80vh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px', background: '#222b45', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Curated Tables</div>
              <button onClick={() => setShowCuratedPanel(false)} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
              {curatedNames.length === 0 && <div style={{ color: '#8f9bb3', fontSize: 14 }}>No curated models available.</div>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {curatedNames.map(name => (
                  <li key={name}>
                    <button
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: selectedCurated === name ? '#e0e7ff' : '#fff',
                        color: '#111827',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        transition: 'background 0.15s, border 0.15s',
                      }}
                      onClick={() => {
                        setSelectedCurated(name);
                        setSelectedTable('');
                        setShowCuratedPanel(false);
                        navigate('/app/curated', { state: { loadCuratedData: true, fullData: true } });
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      {showMartsPanel && (
        <div style={{ position: 'fixed', top: 0, left: 220, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#f7fafc', borderRadius: 10, width: '520px', maxHeight: '80vh', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 18px', background: '#222b45', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, letterSpacing: 0.5 }}>Mart Models</div>
              <button onClick={() => setShowMartsPanel(false)} style={{ background: 'transparent', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
              {martNames.length === 0 && <div style={{ color: '#8f9bb3', fontSize: 14 }}>No mart models available.</div>}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {martNames.map(name => (
                  <li key={name}>
                    <button
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: selectedMart === name ? '#e0f2fe' : '#fff',
                        color: '#111827',
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        padding: '10px 12px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        transition: 'background 0.15s, border 0.15s',
                      }}
                      onClick={() => {
                        setSelectedMart(name);
                        setSelectedTable('');
                        setShowMartsPanel(false);
                        navigate('/app/marts', { state: { loadMartData: true, fullData: true } });
                      }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// CuratedModel component for curated layer
function CuratedModel({ curatedModels, setCuratedModels, selectedCurated, setSelectedCurated }) {
  const location = useLocation();
  const [modelName, setModelName] = React.useState("");
  const [sqlInput, setSqlInput] = React.useState("");
  const [previewRows, setPreviewRows] = React.useState([]);
  const [previewError, setPreviewError] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState("");
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [documentation, setDocumentation] = React.useState([]); // [{name, type, description, testNull, testUnique, nullWarning, uniqueWarning, acceptedValues}]
  const [tableDescription, setTableDescription] = React.useState("");
  const [dataRows, setDataRows] = React.useState([]);
  const [dataError, setDataError] = React.useState("");
  const [isLoadingData, setIsLoadingData] = React.useState(false);
  const [availableTables, setAvailableTables] = React.useState([]);
  const [aiSelectedTables, setAiSelectedTables] = React.useState([]);
  const [aiCriteria, setAiCriteria] = React.useState('');
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiSuggestions, setAiSuggestions] = React.useState([]);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState('');
  const [aiSource, setAiSource] = React.useState('');
  const [aiHistory, setAiHistory] = React.useState([]);

  React.useEffect(() => {
    api('/tables')
      .then((res) => res.json())
      .then((tables) => {
        const list = Array.isArray(tables) ? tables : [];
        setAvailableTables(list);
      })
      .catch(() => setAvailableTables([]));
    api('/ai/curated-history')
      .then((res) => res.json())
      .then((data) => setAiHistory(Array.isArray(data.entries) ? data.entries : []))
      .catch(() => setAiHistory([]));
  }, []);

  // Load a selected curated model
  React.useEffect(() => {
    if (!selectedCurated) {
      setModelName("");
      setSqlInput("");
      setPreviewRows([]);
      setDocumentation([]);
      setTableDescription("");
      setPreviewError("");
      setSaveStatus("");
      return;
    }
    api(`/curated-model/${selectedCurated}`)
      .then(res => res.json())
      .then(data => {
        setModelName(data.name);
        setSqlInput(data?.sql || "");
        setPreviewRows(data.preview || []);
        setDocumentation((data.documentation || []).map(col => ({
          ...col,
          testNull: !!col.testNull,
          testUnique: !!col.testUnique,
          nullWarning: "",
          uniqueWarning: ""
        })));
        setTableDescription(data.tableDescription || "");
        setPreviewError("");
        setSaveStatus("");
      })
      .catch(err => {
        setPreviewError("Failed to load curated model: " + err.message);
      });
  }, [selectedCurated]);

  // Preview logic
  const handlePreview = async () => {
    setPreviewError("");
    setPreviewRows([]);
    setDocumentation([]);
    setIsPreviewing(true);
    try {
      const res = await api("/api/curated-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlInput })
      });
      const data = await res.json();
      if (data.error) {
        setPreviewError(data.error);
      } else {
        setPreviewRows(data.preview);
        if (data.columns && data.columns.length > 0) {
          setDocumentation(data.columns.map(col => ({
            ...col,
            description: "",
            testNull: false,
            testUnique: false,
            nullWarning: "",
            uniqueWarning: "",
            acceptedValues: ""
          })));
        } else {
          setDocumentation([]);
        }
      }
    } catch (err) {
      setPreviewError("Failed to preview: " + err.message);
    }
    setIsPreviewing(false);
  };

  // Documentation test logic (same as staging, but with acceptedValues)
  const handleTestCheckboxChange = (idx, field) => {
    setDocumentation(prev => {
      return prev.map((col, i) => {
        if (i !== idx) return col;
        const updatedCol = { ...col, [field]: !col[field] };
        const colName = updatedCol.name || updatedCol.source || updatedCol.original;
        let nullWarning = updatedCol.nullWarning;
        let uniqueWarning = updatedCol.uniqueWarning;
        if (field === 'testNull') {
          if (!updatedCol.testNull) {
            nullWarning = "";
          } else {
            const hasNull = previewRows.some(
              row => row[colName] === null || row[colName] === undefined || row[colName] === ""
            );
            nullWarning = hasNull ? `Warning: NULL values found in column ${colName}.` : "";
          }
        }
        if (field === 'testUnique') {
          if (!updatedCol.testUnique) {
            uniqueWarning = "";
          } else {
            const values = previewRows.map(row => row[colName]);
            const unique = new Set(values.filter(v => v !== null && v !== undefined && v !== ""));
            uniqueWarning = unique.size < values.filter(v => v !== null && v !== undefined && v !== "").length ? `Warning: Duplicate values found in column ${colName}.` : "";
          }
        }
        return { ...updatedCol, nullWarning, uniqueWarning };
      });
    });
  };

  // Accepted values test (optional, for future extension)
  // ...

  // When previewRows changes, rerun tests for all columns with checked tests
  React.useEffect(() => {
    if (previewRows.length > 0 && documentation.length > 0) {
      setDocumentation(prevDocs => prevDocs.map(col => {
        const colName = col.name || col.source || col.original;
        let nullWarning = col.nullWarning;
        let uniqueWarning = col.uniqueWarning;
        if (col.testNull) {
          const hasNull = previewRows.some(
            row => row[colName] === null || row[colName] === undefined || row[colName] === ""
          );
          nullWarning = hasNull ? `Warning: NULL values found in column ${colName}.` : "";
        } else {
          nullWarning = "";
        }
        if (col.testUnique) {
          const values = previewRows.map(row => row[colName]);
          const unique = new Set(values.filter(v => v !== null && v !== undefined && v !== ""));
          uniqueWarning = unique.size < values.filter(v => v !== null && v !== undefined && v !== "").length ? `Warning: Duplicate values found in column ${colName}.` : "";
        } else {
          uniqueWarning = "";
        }
        return { ...col, nullWarning, uniqueWarning };
      }));
    }
    // eslint-disable-next-line
  }, [previewRows]);

  // Save logic
  const handleSave = async () => {
    setSaveStatus("");
    setIsSaving(true);
    try {
      const res = await api("/curated-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modelName,
          sql: sqlInput,
          documentation: documentation.map(col => ({
            ...col,
            nullWarning: undefined,
            uniqueWarning: undefined
          })),
          tableDescription,
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("Curated model saved successfully!");
        setSelectedCurated(modelName);
        // Refresh curated models in sidebar
        api("/curated-models").then(async (res) => {
          const data = await res.json().catch(() => ({}));
          setCuratedModels(res.ok && Array.isArray(data.models) ? data.models : []);
        });
        // Refresh tables so curated tables become queryable by marts layer
        api("/tables").then(res => res.json()).then(tableList => {
          if (typeof window !== 'undefined' && window.setTables) {
            window.setTables(tableList);
          }
        });
      } else {
        setSaveStatus(data.error || "Failed to save curated model.");
      }
    } catch (err) {
      setSaveStatus("Failed to save curated model: " + err.message);
    }
    setIsSaving(false);
  };

  // Download export logic
  const handleDownload = async (format = 'csv') => {
    if (!selectedCurated) {
      setSaveStatus("Please select a curated model first.");
      return;
    }
    try {
      const response = await api(`/curated-model/${selectedCurated}/export?format=${format}`);
      if (!response.ok) {
        const errorData = await response.json();
        setSaveStatus(errorData.error || "Failed to download data.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedCurated}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSaveStatus("Data downloaded successfully!");
    } catch (err) {
      setSaveStatus("Failed to download data: " + err.message);
    }
  };

  // Load curated model full data (table view style)
  const handleLoadCuratedData = async (fullData = false) => {
    if (!selectedCurated) {
      setSaveStatus("Please select a curated model first.");
      return;
    }
    setIsLoadingData(true);
    setDataError("");
    try {
      const limitParam = fullData ? 'all' : '1000';
      const res = await api(`/curated-model/${selectedCurated}/data?limit=${limitParam}`);
      const data = await res.json();
      if (data.error) {
        setDataError(data.error);
        setDataRows([]);
      } else {
        setDataRows(data.rows || []);
      }
    } catch (err) {
      setDataError("Failed to load curated data: " + err.message);
      setDataRows([]);
    }
    setIsLoadingData(false);
  };

  // When navigated with loadCuratedData flag, auto-load data table
  React.useEffect(() => {
    if (location.state && location.state.loadCuratedData) {
      const wantFull = !!location.state.fullData;
      handleLoadCuratedData(wantFull);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, selectedCurated]);

  const showTableOnly = (location.state && location.state.loadCuratedData && dataRows.length > 0) || false;

  const toggleAiTable = (tableName) => {
    setAiSelectedTables((prev) => (
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    ));
  };

  const handleGenerateAiSuggestions = async () => {
    setAiError('');
    setAiSuggestions([]);
    setAiSource('');
    if (aiSelectedTables.length === 0) {
      setAiError('Избери поне една таблица за AI предложения.');
      return;
    }
    setAiLoading(true);
    try {
      const res = await api('/ai/curated-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedTables: aiSelectedTables,
          criteria: aiCriteria,
          prompt: aiPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiError(data.error || 'Неуспешно генериране на AI предложения.');
      } else {
        setAiSource(data.source || '');
        setAiSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        const h = await api('/ai/curated-history').then((r) => r.json()).catch(() => ({ entries: [] }));
        setAiHistory(Array.isArray(h.entries) ? h.entries : []);
      }
    } catch (err) {
      setAiError(err.message || 'Неуспешно генериране на AI предложения.');
    } finally {
      setAiLoading(false);
    }
  };

  if (showTableOnly) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f6fa', padding: 0 }}>
        <h1 style={{ padding: '40px 0 0 40px' }}>Curated Model Data</h1>
        <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
          {dataError && <div style={{ color: 'red', marginBottom: 16 }}>{dataError}</div>}
          {isLoadingData && <div style={{ marginBottom: 16, color: '#666' }}>Loading...</div>}
          {dataRows.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ color: '#00b887', fontWeight: 700 }}>Showing curated table ({dataRows.length} rows)</div>
                <button
                  onClick={() => handleLoadCuratedData(true)}
                  style={{ padding: '8px 14px', fontSize: 14, background: '#4b5563', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                  disabled={isLoadingData}
                  title="Reload full curated table"
                >
                  Reload full table
                </button>
              </div>
              <div style={{ overflow: 'auto', maxHeight: 650 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {Object.keys(dataRows[0] || {}).map(key => (
                        <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                        {Object.values(row).map((val, i) => (
                          <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!dataRows.length && !isLoadingData && (
            <div style={{ color: '#8f9bb3', fontSize: 14 }}>No data available.</div>
          )}
        </div>
      </div>
    );
  }

  // UI
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fa', padding: 0 }}>
      <h1 style={{ padding: '40px 0 0 40px' }}>Curated Model Definition</h1>
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
          {/* Left: SQL Editor and Preview */}
          <div style={{ flex: 2, minWidth: 0, height: '100%' }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>Curated Model Name</label><br />
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="e.g. curated_sales_summary"
                style={{ width: 400, fontSize: 16, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>SQL Query (use staging tables)</label><br />
              <textarea
                value={sqlInput}
                onChange={e => setSqlInput(e.target.value)}
                placeholder="SQL за curated модел. Създава се от нулата — без шаблони; нужна е качена база за Preview/Save и обикновено вече дефинирани staging таблици."
                style={{ width: '100%', minHeight: 120, fontSize: 15, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 20, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>AI SQL Suggestions</div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
                Избери таблици, добави критерии и prompt, после AI ще предложи заявки за Curated.
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tables</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {availableTables.map((table) => (
                    <label key={table} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <input
                        type="checkbox"
                        checked={aiSelectedTables.includes(table)}
                        onChange={() => toggleAiTable(table)}
                      />
                      <span style={{ fontSize: 13 }}>{table}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Criteria (SQL WHERE без "WHERE")</label>
                  <input
                    value={aiCriteria}
                    onChange={(e) => setAiCriteria(e.target.value)}
                    placeholder={`e.g. order_date >= '2025-01-01'`}
                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Prompt</label>
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. focus on churn KPI and monthly trend"
                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleGenerateAiSuggestions}
                disabled={aiLoading}
                style={{ padding: '8px 14px', border: 'none', borderRadius: 6, background: '#4338ca', color: '#fff', fontWeight: 700, cursor: aiLoading ? 'not-allowed' : 'pointer' }}
              >
                {aiLoading ? 'Генериране...' : 'Generate AI Suggestions'}
              </button>
              {aiError && <div style={{ marginTop: 8, color: '#b91c1c', fontSize: 13 }}>{aiError}</div>}
              {aiSource && <div style={{ marginTop: 8, color: '#334155', fontSize: 12 }}>Suggestion source: {aiSource}</div>}
              {aiSuggestions.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {aiSuggestions.map((s, idx) => (
                    <div key={`${s.title}-${idx}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                      <div style={{ color: '#475569', fontSize: 13, marginBottom: 8 }}>{s.rationale}</div>
                      <textarea value={s.sql} readOnly style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }} />
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          onClick={async () => {
                            setSqlInput(s.sql);
                            await api('/ai/curated-history/use', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ suggestionIndex: idx }),
                            }).catch(() => null);
                            const h = await api('/ai/curated-history').then((r) => r.json()).catch(() => ({ entries: [] }));
                            setAiHistory(Array.isArray(h.entries) ? h.entries : []);
                          }}
                          style={{ padding: '6px 10px', border: 'none', borderRadius: 6, background: '#0ea5e9', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Use in SQL editor
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {aiHistory.length > 0 && (
                <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>AI Suggestion History</div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Generated</th>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Source</th>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Tables</th>
                          <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid #e2e8f0' }}>Used</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiHistory.slice(0, 8).map((entry) => (
                          <tr key={entry.id}>
                            <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{entry.generatedAt ? new Date(entry.generatedAt).toLocaleString() : '-'}</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{entry.source || '-'}</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{(entry.selectedTables || []).join(', ')}</td>
                            <td style={{ padding: 6, borderBottom: '1px solid #f1f5f9' }}>{entry.usedAt ? `yes (${entry.usedSuggestionIndex ?? 0})` : 'no'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={handlePreview}
                disabled={!sqlInput.trim() || isPreviewing}
                style={{ padding: '10px 24px', fontSize: 16, background: '#36f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 16 }}
              >
                {isPreviewing ? 'Previewing...' : 'Preview'}
              </button>
              <button
                onClick={handleSave}
                disabled={!modelName.trim() || !sqlInput.trim() || isSaving}
                style={{ padding: '10px 24px', fontSize: 16, background: '#00b887', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 16 }}
              >
                {isSaving ? 'Saving...' : 'Save Curated Model'}
              </button>
              <button
                onClick={() => handleDownload('csv')}
                disabled={!selectedCurated}
                style={{
                  padding: '10px 24px',
                  fontSize: 16,
                  background: selectedCurated ? 'linear-gradient(90deg, #4b5563 0%, #1f2937 100%)' : '#94a3b8',
                  color: '#e5e7eb',
                  border: '1px solid #1f2937',
                  borderRadius: 8,
                  cursor: !selectedCurated ? 'not-allowed' : 'pointer',
                  fontWeight: 650,
                  marginRight: 16,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  transition: 'transform 0.08s ease, box-shadow 0.12s ease',
                }}
                onMouseEnter={e => {
                  if (selectedCurated) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.22)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
                }}
                title="Download all query results as CSV file"
              >
                📥 Download Data
              </button>
              {saveStatus && <span style={{ marginLeft: 18, color: saveStatus.includes('success') ? '#00b887' : 'red', fontWeight: 600 }}>{saveStatus}</span>}
            </div>
            {previewError && <div style={{ color: 'red', marginBottom: 16 }}>{previewError}</div>}
            {previewRows.length > 0 && (
              <div style={{ marginTop: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 10 }}>
                <h3 style={{ marginTop: 0 }}>Preview Result (up to 100 rows)</h3>
                <div style={{ overflow: 'auto', maxHeight: 400 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {Object.keys(previewRows[0]).map(key => (
                          <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                          {Object.values(row).map((val, i) => (
                            <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {isLoadingData && <div style={{ marginTop: 12, color: '#666' }}>Loading saved mart table…</div>}
            {dataError && <div style={{ color: 'red', marginTop: 12 }}>{dataError}</div>}
            {dataRows.length > 0 && (
              <div style={{ marginTop: 20, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ color: '#00b887', fontWeight: 700 }}>Saved mart table ({dataRows.length} rows)</div>
                  <button
                    onClick={() => handleLoadCuratedData(true)}
                    disabled={isLoadingData}
                    style={{ padding: '8px 14px', fontSize: 13, background: '#4b5563', color: '#fff', border: 'none', borderRadius: 6, cursor: isLoadingData ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                    title="Reload all rows"
                  >
                    Reload All
                  </button>
                </div>
                <div style={{ overflow: 'auto', maxHeight: 500 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {Object.keys(dataRows[0] || {}).map(key => (
                          <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataRows.map((row, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                          {Object.values(row).map((val, i) => (
                            <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          {/* Right: Documentation Panel */}
          <div style={{ flex: 1.5, minWidth: 420, background: '#f7fafc', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 0, marginLeft: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h3 style={{ marginTop: 0 }}>Documentation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {/* Table Description at the top */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontWeight: 600, fontSize: 14 }}>Table Description</label>
                  <textarea
                    value={tableDescription}
                    onChange={e => setTableDescription(e.target.value)}
                    placeholder="Short description of the table..."
                    style={{ width: '100%', minHeight: 96, fontSize: 15, padding: 10, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
                  />
                </div>
                {/* Columns Table (scrollable, fills available space) */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 0, minHeight: 0 }}>
                  {documentation.length > 0 ? (
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Column Name</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Type</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Description</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Test</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentation.map((col, idx) => (
                          <tr key={col.name + idx}>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>{col.name || col.source || col.original}</td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>{col.type}</td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>
                              <textarea
                                value={col.description || ""}
                                onChange={e => setDocumentation(prev => prev.map((c, i) => i === idx ? { ...c, description: e.target.value } : c))}
                                placeholder="Description..."
                                style={{ width: '100%', fontSize: 14, padding: 6, borderRadius: 4, border: '1px solid #ccc', minHeight: 48, resize: 'vertical' }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', minWidth: 120 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!col.testNull}
                                    onChange={() => handleTestCheckboxChange(idx, 'testNull')}
                                  />
                                  NULL
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!col.testUnique}
                                    onChange={() => handleTestCheckboxChange(idx, 'testUnique')}
                                  />
                                  Unique
                                </label>
                                {col.nullWarning && <div style={{ color: 'red', fontSize: 12, marginTop: 2 }}>{col.nullWarning}</div>}
                                {col.uniqueWarning && <div style={{ color: 'red', fontSize: 12, marginTop: 2 }}>{col.uniqueWarning}</div>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: '#8f9bb3', fontSize: 14 }}>No documentation generated yet. Click Preview to generate.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// MartModel component for marts layer (uses curated tables)
function MartModel({ martsModels, setMartsModels, selectedMart, setSelectedMart }) {
  const location = useLocation();
  const [modelName, setModelName] = React.useState("");
  const [sqlInput, setSqlInput] = React.useState("");
  const [previewRows, setPreviewRows] = React.useState([]);
  const [previewError, setPreviewError] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState("");
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [documentation, setDocumentation] = React.useState([]);
  const [tableDescription, setTableDescription] = React.useState("");
  const [dataRows, setDataRows] = React.useState([]);
  const [dataError, setDataError] = React.useState("");
  const [isLoadingData, setIsLoadingData] = React.useState(false);
  const [showChart, setShowChart] = React.useState(false);

  // Load a selected mart model
  React.useEffect(() => {
    if (!selectedMart) {
      setModelName("");
      setSqlInput("");
      setPreviewRows([]);
      setDocumentation([]);
      setTableDescription("");
      setPreviewError("");
      setSaveStatus("");
      return;
    }
    api(`/mart/${selectedMart}`)
      .then(res => res.json())
      .then(data => {
        setModelName(data.name);
        setSqlInput(data?.sql || "");
        setPreviewRows(data.preview || []);
        setDocumentation((data.documentation || []).map(col => ({
          ...col,
          testNull: !!col.testNull,
          testUnique: !!col.testUnique,
          nullWarning: "",
          uniqueWarning: ""
        })));
        setTableDescription(data.tableDescription || "");
        setPreviewError("");
        setSaveStatus("");
      })
      .catch(err => {
        setPreviewError("Failed to load mart model: " + err.message);
      });
  }, [selectedMart]);

  // Preview logic
  const handlePreview = async () => {
    setPreviewError("");
    setPreviewRows([]);
    setDocumentation([]);
    setIsPreviewing(true);
    try {
      const res = await api("/api/mart-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: sqlInput })
      });
      const data = await res.json();
      if (data.error) {
        setPreviewError(data.error);
      } else {
        setPreviewRows(data.preview);
        if (data.columns && data.columns.length > 0) {
          setDocumentation(data.columns.map(col => ({
            ...col,
            description: "",
            testNull: false,
            testUnique: false,
            nullWarning: "",
            uniqueWarning: "",
            acceptedValues: ""
          })));
        } else {
          setDocumentation([]);
        }
      }
    } catch (err) {
      setPreviewError("Failed to preview: " + err.message);
    }
    setIsPreviewing(false);
  };

  // Documentation test logic
  const handleTestCheckboxChange = (idx, field) => {
    setDocumentation(prev => {
      return prev.map((col, i) => {
        if (i !== idx) return col;
        const updatedCol = { ...col, [field]: !col[field] };
        const colName = updatedCol.name || updatedCol.source || updatedCol.original;
        let nullWarning = updatedCol.nullWarning;
        let uniqueWarning = updatedCol.uniqueWarning;
        if (field === 'testNull') {
          if (!updatedCol.testNull) {
            nullWarning = "";
          } else {
            const hasNull = previewRows.some(
              row => row[colName] === null || row[colName] === undefined || row[colName] === ""
            );
            nullWarning = hasNull ? `Warning: NULL values found in column ${colName}.` : "";
          }
        }
        if (field === 'testUnique') {
          if (!updatedCol.testUnique) {
            uniqueWarning = "";
          } else {
            const values = previewRows.map(row => row[colName]);
            const unique = new Set(values.filter(v => v !== null && v !== undefined && v !== ""));
            uniqueWarning = unique.size < values.filter(v => v !== null && v !== undefined && v !== "").length ? `Warning: Duplicate values found in column ${colName}.` : "";
          }
        }
        return { ...updatedCol, nullWarning, uniqueWarning };
      });
    });
  };

  // When previewRows changes, rerun tests for all columns with checked tests
  React.useEffect(() => {
    if (previewRows.length > 0 && documentation.length > 0) {
      setDocumentation(prevDocs => prevDocs.map(col => {
        const colName = col.name || col.source || col.original;
        let nullWarning = col.nullWarning;
        let uniqueWarning = col.uniqueWarning;
        if (col.testNull) {
          const hasNull = previewRows.some(
            row => row[colName] === null || row[colName] === undefined || row[colName] === ""
          );
          nullWarning = hasNull ? `Warning: NULL values found in column ${colName}.` : "";
        } else {
          nullWarning = "";
        }
        if (col.testUnique) {
          const values = previewRows.map(row => row[colName]);
          const unique = new Set(values.filter(v => v !== null && v !== undefined && v !== ""));
          uniqueWarning = unique.size < values.filter(v => v !== null && v !== undefined && v !== "").length ? `Warning: Duplicate values found in column ${colName}.` : "";
        } else {
          uniqueWarning = "";
        }
        return { ...col, nullWarning, uniqueWarning };
      }));
    }
    // eslint-disable-next-line
  }, [previewRows]);

  // Save logic
  const handleSave = async () => {
    setSaveStatus("");
    setIsSaving(true);
    try {
      const res = await api("/marts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: modelName,
          sql: sqlInput,
          documentation: documentation.map(col => ({
            ...col,
            nullWarning: undefined,
            uniqueWarning: undefined
          })),
          tableDescription,
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("Mart model saved successfully!");
        setSelectedMart(modelName);
        // Refresh marts models in sidebar
        api("/marts").then(async (res) => {
          const data = await res.json().catch(() => ({}));
          setMartsModels(res.ok && Array.isArray(data.models) ? data.models : []);
        });
      } else {
        setSaveStatus(data.error || "Failed to save mart model.");
      }
    } catch (err) {
      setSaveStatus("Failed to save mart model: " + err.message);
    }
    setIsSaving(false);
  };

  // Download export logic
  const handleDownload = async (format = 'csv') => {
    if (!selectedMart) {
      setSaveStatus("Please select a mart model first.");
      return;
    }
    try {
      const response = await api(`/mart/${selectedMart}/export?format=${format}`);
      if (!response.ok) {
        const errorData = await response.json();
        setSaveStatus(errorData.error || "Failed to download data.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedMart}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSaveStatus("Data downloaded successfully!");
    } catch (err) {
      setSaveStatus("Failed to download data: " + err.message);
    }
  };

  // Load mart model full data (table view style)
  const handleLoadMartData = async (fullData = false) => {
    if (!selectedMart) {
      setSaveStatus("Please select a mart model first.");
      return;
    }
    setIsLoadingData(true);
    setDataError("");
    try {
      const limitParam = fullData ? 'all' : '1000';
      const res = await api(`/mart/${selectedMart}/data?limit=${limitParam}`);
      const data = await res.json();
      if (data.error) {
        setDataError(data.error);
        setDataRows([]);
      } else {
        setDataRows(data.rows || []);
      }
    } catch (err) {
      setDataError("Failed to load mart data: " + err.message);
      setDataRows([]);
    }
    setIsLoadingData(false);
  };

  // When navigated with loadMartData flag, auto-load data table
  React.useEffect(() => {
    if (location.state && location.state.loadMartData) {
      const wantFull = !!location.state.fullData;
      handleLoadMartData(wantFull);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, selectedMart]);

  // Reset chart toggle when dataset changes or mart changes
  React.useEffect(() => {
    setShowChart(false);
  }, [selectedMart, dataRows.length]);

  const chartData = useMemo(() => {
    if (!dataRows || dataRows.length === 0) return null;
    const first = dataRows[0] || {};
    const keys = Object.keys(first);
    if (keys.length === 0) return null;
    const numericKeys = keys.filter(k => dataRows.some(r => Number.isFinite(Number(r[k]))));
    const yKey = numericKeys[0];
    if (!yKey) return null;
    const xKey = keys.find(k => k !== yKey) || yKey;
    const rows = dataRows.slice(0, 20).map(r => ({
      x: r[xKey],
      y: Number(r[yKey]) || 0
    }));
    const max = Math.max(...rows.map(r => r.y), 1);
    return { xKey, yKey, rows, max };
  }, [dataRows]);

  const showTableOnly = (location.state && location.state.loadMartData && dataRows.length > 0) || false;

  if (showTableOnly) {
    return (
      <div style={{ minHeight: '100vh', background: '#f4f6fa', padding: 0 }}>
        <h1 style={{ padding: '40px 0 0 40px' }}>Mart Model Data</h1>
        <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button
              onClick={() => handleLoadMartData(false)}
              disabled={isLoadingData}
              style={{ padding: '10px 18px', fontSize: 15, background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, cursor: isLoadingData ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              title="Load up to 1000 rows of the saved mart table"
            >
              View Data (1k)
            </button>
            <button
              onClick={() => handleLoadMartData(true)}
              disabled={isLoadingData}
              style={{ padding: '10px 18px', fontSize: 15, background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: isLoadingData ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              title="Load all rows of the saved mart table"
            >
              View All Data
            </button>
            <button
              onClick={() => setShowChart(s => !s)}
              disabled={!chartData || isLoadingData}
              style={{ padding: '10px 16px', fontSize: 14, background: chartData ? '#10b981' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 6, cursor: !chartData ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              title={chartData ? 'Toggle chart view' : 'Chart unavailable (no numeric column)'}
            >
              {showChart ? 'Hide Chart' : 'Show Chart'}
            </button>
          </div>
          {dataError && <div style={{ color: 'red', marginBottom: 16 }}>{dataError}</div>}
          {isLoadingData && <div style={{ marginBottom: 16, color: '#666' }}>Loading...</div>}
          {dataRows.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ color: '#00b887', fontWeight: 700 }}>Showing mart table ({dataRows.length} rows)</div>
                <button
                  onClick={() => handleLoadMartData(true)}
                  style={{ padding: '8px 14px', fontSize: 14, background: '#4b5563', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                  disabled={isLoadingData}
                  title="Reload full mart table"
                >
                  Reload full table
                </button>
              </div>
              {chartData && (
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setShowChart(s => !s)}
                    style={{ padding: '8px 12px', fontSize: 13, background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                    title="Toggle chart view"
                  >
                    {showChart ? 'Hide Chart' : 'Show Chart'}
                  </button>
                </div>
              )}
              {showChart && chartData && (
                <div style={{ marginBottom: 14, background: '#f8fafc', border: '1px solid #e4e9f2', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
                    Bar chart: {chartData.yKey} by {chartData.xKey} (top {chartData.rows.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {chartData.rows.map((r, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 60px', alignItems: 'center', gap: 8 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827', fontSize: 13 }}>{String(r.x)}</div>
                        <div style={{ height: 12, background: '#e5e7eb', borderRadius: 6, position: 'relative' }}>
                          <div style={{ width: `${Math.max(4, (r.y / chartData.max) * 100)}%`, maxWidth: '100%', height: '100%', background: '#0ea5e9', borderRadius: 6 }} />
                        </div>
                        <div style={{ fontSize: 12, color: '#334155' }}>{r.y}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ overflow: 'auto', maxHeight: 650 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {Object.keys(dataRows[0] || {}).map(key => (
                        <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataRows.map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                        {Object.values(row).map((val, i) => (
                          <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {!dataRows.length && !isLoadingData && (
            <div style={{ color: '#8f9bb3', fontSize: 14 }}>No data available.</div>
          )}
        </div>
      </div>
    );
  }

  // UI
  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fa', padding: 0 }}>
      <h1 style={{ padding: '40px 0 0 40px' }}>Mart Model Definition</h1>
      <div style={{ padding: 40, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 32 }}>
          {/* Left: SQL Editor and Preview */}
          <div style={{ flex: 2, minWidth: 0, height: '100%' }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>Mart Model Name</label><br />
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder="e.g. mart_customer_analytics"
                style={{ width: 400, fontSize: 16, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 600 }}>SQL Query (use curated tables)</label><br />
              <textarea
                value={sqlInput}
                onChange={e => setSqlInput(e.target.value)}
                placeholder="SQL за mart модел. Без готови примери — дефинирайте го вие; нужна е качена база за Preview/Save и curated слой според вашия pipeline."
                style={{ width: '100%', minHeight: 120, fontSize: 15, padding: 8, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={handlePreview}
                disabled={!sqlInput.trim() || isPreviewing}
                style={{ padding: '10px 24px', fontSize: 16, background: '#36f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 16 }}
              >
                {isPreviewing ? 'Previewing...' : 'Preview'}
              </button>
              <button
                onClick={handleSave}
                disabled={!modelName.trim() || !sqlInput.trim() || isSaving}
                style={{ padding: '10px 24px', fontSize: 16, background: '#00b887', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginRight: 16 }}
              >
                {isSaving ? 'Saving...' : 'Save Mart Model'}
              </button>
              <button
                onClick={() => handleDownload('csv')}
                disabled={!selectedMart}
                style={{
                  padding: '10px 24px',
                  fontSize: 16,
                  background: selectedMart ? 'linear-gradient(90deg, #4b5563 0%, #1f2937 100%)' : '#94a3b8',
                  color: '#e5e7eb',
                  border: '1px solid #1f2937',
                  borderRadius: 8,
                  cursor: !selectedMart ? 'not-allowed' : 'pointer',
                  fontWeight: 650,
                  marginRight: 16,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
                  transition: 'transform 0.08s ease, box-shadow 0.12s ease',
                }}
                onMouseEnter={e => {
                  if (selectedMart) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.22)';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)';
                }}
                title="Download all query results as CSV file"
              >
                📥 Download Data
              </button>
              {saveStatus && <span style={{ marginLeft: 18, color: saveStatus.includes('success') ? '#00b887' : 'red', fontWeight: 600 }}>{saveStatus}</span>}
            </div>
            {previewError && <div style={{ color: 'red', marginBottom: 16 }}>{previewError}</div>}
            {previewRows.length > 0 && (
              <div style={{ marginTop: 24, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 10 }}>
                <h3 style={{ marginTop: 0 }}>Preview Result (up to 100 rows)</h3>
                <div style={{ overflow: 'auto', maxHeight: 400 }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {Object.keys(previewRows[0]).map(key => (
                          <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, idx) => (
                        <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                          {Object.values(row).map((val, i) => (
                            <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {dataError && <div style={{ color: 'red', marginTop: 16 }}>{dataError}</div>}
          </div>
          {/* Right: Documentation Panel */}
          <div style={{ flex: 1.5, minWidth: 420, background: '#f7fafc', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 0, marginLeft: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <h3 style={{ marginTop: 0 }}>Documentation</h3>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {/* Table Description at the top */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontWeight: 600, fontSize: 14 }}>Table Description</label>
                  <textarea
                    value={tableDescription}
                    onChange={e => setTableDescription(e.target.value)}
                    placeholder="Short description of the table..."
                    style={{ width: '100%', minHeight: 96, fontSize: 15, padding: 10, borderRadius: 4, border: '1px solid #ccc', marginTop: 4 }}
                  />
                </div>
                {/* Columns Table (scrollable, fills available space) */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 0, minHeight: 0 }}>
                  {documentation.length > 0 ? (
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Column Name</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Type</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Description</th>
                          <th style={{ background: '#e4e9f2', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #c5cee0', fontWeight: 600 }}>Test</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documentation.map((col, idx) => (
                          <tr key={col.name + idx}>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>{col.name || col.source || col.original}</td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>{col.type}</td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2' }}>
                              <textarea
                                value={col.description || ""}
                                onChange={e => setDocumentation(prev => prev.map((c, i) => i === idx ? { ...c, description: e.target.value } : c))}
                                placeholder="Description..."
                                style={{ width: '100%', fontSize: 14, padding: 6, borderRadius: 4, border: '1px solid #ccc', minHeight: 48, resize: 'vertical' }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', minWidth: 120 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!col.testNull}
                                    onChange={() => handleTestCheckboxChange(idx, 'testNull')}
                                  />
                                  NULL
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!col.testUnique}
                                    onChange={() => handleTestCheckboxChange(idx, 'testUnique')}
                                  />
                                  Unique
                                </label>
                                {col.nullWarning && <div style={{ color: 'red', fontSize: 12, marginTop: 2 }}>{col.nullWarning}</div>}
                                {col.uniqueWarning && <div style={{ color: 'red', fontSize: 12, marginTop: 2 }}>{col.uniqueWarning}</div>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ color: '#8f9bb3', fontSize: 14 }}>No documentation generated yet. Click Preview to generate.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Performance comparison between raw SQL (source tables) and mart query
function PerformanceCompare({ martsModels, selectedMart, setSelectedMart }) {
  const martOptions = asStringArray(martsModels);
  const [rawSql, setRawSql] = React.useState("");
  const [rowLimit, setRowLimit] = React.useState(500);
  const [rawRows, setRawRows] = React.useState([]);
  const [martRows, setMartRows] = React.useState([]);
  const [rawDuration, setRawDuration] = React.useState(null);
  const [martDuration, setMartDuration] = React.useState(null);
  const [error, setError] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [loadingMartSql, setLoadingMartSql] = React.useState(false);

  // When a mart is selected, prefill the raw SQL with the mart query
  React.useEffect(() => {
    if (!selectedMart) {
      setRawSql("");
      return;
    }
    setLoadingMartSql(true);
    api(`/mart/${selectedMart}/source-sql`)
      .then(res => res.json())
      .then(data => {
        const sql = data.sourceSql || data.martSql || "";
        setRawSql(sql);
      })
      .catch(() => {
        setRawSql("");
      })
      .finally(() => setLoadingMartSql(false));
  }, [selectedMart]);

  const runComparison = async () => {
    setError("");
    setIsRunning(true);
    setRawRows([]);
    setMartRows([]);
    setRawDuration(null);
    setMartDuration(null);
    try {
      // Get preview rows for display
      const rawRes = await api("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: rawSql, limit: rowLimit }),
      });
      const rawData = await rawRes.json();
      if (!rawRes.ok || rawData.error) {
        throw new Error(rawData.error || "Failed to run raw SQL");
      }
      setRawRows(rawData.preview || rawData.rows || []);

      // Fetch mart rows for display
      const martRes = await api(`/mart/${selectedMart}/data?limit=${rowLimit || 500}`);
      const martData = await martRes.json();
      if (!martRes.ok || martData.error) {
        throw new Error(martData.error || "Failed to fetch mart data");
      }
      setMartRows(martData.rows || []);

      // Server-side compare for reliable timings (warm-up + median)
      try {
        const cmpRes = await api(`/mart/${selectedMart}/compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceSql: rawSql, rowLimit: rowLimit, runs: 5 })
        });
        const cmp = await cmpRes.json();
        if (cmpRes.ok && !cmp.error) {
          // Prefer median timings if available
          const rawMs = cmp.raw_median_time_ms || cmp.raw_stats?.avg_ms;
          const martMs = cmp.mart_median_time_ms || cmp.mart_stats?.avg_ms;
          setRawDuration(rawMs != null ? Number(rawMs) : null);
          setMartDuration(martMs != null ? Number(martMs) : null);
        }
      } catch (e) {
        // Ignore compare failures — we still show preview data
      }
    } catch (err) {
      setError(err.message);
    }
    setIsRunning(false);
  };

  const rowsSummary = (rows) => (rows && rows.length ? `${rows.length} rows` : "No rows");

  const renderTable = (rows) => {
    if (!rows || rows.length === 0) return <div style={{ color: '#8f9bb3' }}>No data</div>;
    const keys = Object.keys(rows[0] || {});
    return (
      <div style={{ overflow: 'auto', maxHeight: 320, background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #0001', padding: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr>
              {keys.map(key => (
                <th key={key} style={{ background: '#f7fafc', color: '#222b45', padding: '4px 6px', borderBottom: '2px solid #e4e9f2', position: 'sticky', top: 0, fontWeight: 600 }}>{key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} style={{ background: idx % 2 === 0 ? '#f7fafc' : '#fff', height: 28 }}>
                {keys.map((key, i) => (
                  <td key={i} style={{ padding: '4px 6px', borderBottom: '1px solid #e4e9f2', color: '#333', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
    </div>
  );
  };

  return (
    <div style={{ padding: 32, background: '#f4f6fa', minHeight: '100vh' }}>
      <h1 style={{ margin: 0, color: '#111827' }}>Performance Compare</h1>
      <p style={{ color: '#6b7280', marginTop: 6 }}>Compare raw SQL against a mart model query.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20, marginTop: 18 }}>
        <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#111827', fontWeight: 700, marginBottom: 6 }}>Mart model</div>
            <select
              value={selectedMart}
              onChange={e => setSelectedMart(e.target.value)}
              style={{ padding: 10, minWidth: 260, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc' }}
            >
              <option value="">-- Select mart model --</option>
              {martOptions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#111827', fontWeight: 700, marginBottom: 6 }}>Row limit</div>
            <input
              type="number"
              value={rowLimit}
              onChange={e => setRowLimit(Number(e.target.value))}
              style={{ width: 140, padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}
            />
            </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ color: '#111827', fontWeight: 700, marginBottom: 6 }}>Raw SQL (source tables)</div>
          <textarea
              value={rawSql}
              onChange={e => setRawSql(e.target.value)}
              placeholder="Mart SQL with curated tables inlined to their underlying queries; edit if needed"
              style={{ width: '100%', minHeight: 160, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', padding: 12, fontSize: 14 }}
          />
            {loadingMartSql && <div style={{ color: '#6b7280', fontSize: 12, marginTop: 6 }}>Loading mart SQL… adjust to source tables.</div>}
            {!loadingMartSql && selectedMart && (
              <div style={{ color: '#6b7280', fontSize: 12, marginTop: 6 }}>
                Prefilled by inlining curated tables into the mart query so it runs directly on their source definitions.
          </div>
            )}
          </div>
          <button
            onClick={runComparison}
            disabled={!rawSql.trim() || !selectedMart || isRunning}
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              border: 'none',
              background: (!rawSql.trim() || !selectedMart) ? '#cbd5e1' : 'linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%)',
              color: '#fff',
              fontWeight: 700,
              cursor: (!rawSql.trim() || !selectedMart) ? 'not-allowed' : 'pointer',
              boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            }}
          >
            {isRunning ? 'Comparing...' : 'Run Comparison'}
          </button>
          {error && <div style={{ color: 'red', marginTop: 10 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 14 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, color: '#111827', fontSize: 14 }}>
              <div><div style={{ color: '#6b7280', fontSize: 12 }}>Raw rows</div><div style={{ fontWeight: 800 }}>{rowsSummary(rawRows)}</div></div>
              <div><div style={{ color: '#6b7280', fontSize: 12 }}>Mart rows</div><div style={{ fontWeight: 800 }}>{rowsSummary(martRows)}</div></div>
              <div><div style={{ color: '#6b7280', fontSize: 12 }}>Raw duration</div><div style={{ fontWeight: 800 }}>{rawDuration ? rawDuration.toFixed(1) : '—'} ms</div></div>
              <div><div style={{ color: '#6b7280', fontSize: 12 }}>Mart duration</div><div style={{ fontWeight: 800 }}>{martDuration ? martDuration.toFixed(1) : '—'} ms</div></div>
              </div>
              </div>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 14 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Raw result</div>
            {renderTable(rawRows)}
              </div>
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.06)', padding: 14 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Mart result</div>
            {renderTable(martRows)}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarStagings, setSidebarStagings] = useState([]);
  const [curatedModels, setCuratedModels] = useState([]); // List of curated model names
  const [selectedCurated, setSelectedCurated] = useState("");
  const [martsModels, setMartsModels] = useState([]); // List of marts model names
  const [selectedMart, setSelectedMart] = useState("");

  const loadAppData = useCallback(() => {
    api("/tables")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        const tableList = res.ok && Array.isArray(body) ? body : [];
        setTables(tableList);
        if (res.ok && Array.isArray(body)) {
          setError('');
          if (body.includes('data(1)')) {
            setSelectedTable('data(1)');
          }
        } else if (body && body.error === 'NO_DATABASE') {
          setError(body.message || 'Качете SQLite база данни от лентата с профила.');
        } else if (!res.ok) {
          setError('Could not fetch tables from backend.');
        }
      })
      .catch(() => setError("Could not fetch tables from backend."));
    api("/stagings")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const list = res.ok && Array.isArray(data.stagings) ? data.stagings : [];
        setSidebarStagings(list);
      })
      .catch(() => {
        setSidebarStagings([]);
      });
    api("/curated-models")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const list = res.ok && Array.isArray(data.models) ? data.models : [];
        setCuratedModels(list);
      })
      .catch(() => {
        setCuratedModels([]);
      });
    api("/marts")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        const list = res.ok && Array.isArray(data.models) ? data.models : [];
        setMartsModels(list);
      })
      .catch(() => {
        setMartsModels([]);
      });
  }, []);

  useEffect(() => {
    loadAppData();
    const onDbUploaded = () => loadAppData();
    const onDbSlotChanged = () => {
      setSelectedTable('');
      setSelectedCurated('');
      setSelectedMart('');
      setTableData([]);
      loadAppData();
    };
    window.addEventListener('dfs-db-uploaded', onDbUploaded);
    window.addEventListener('dfs-db-slot-changed', onDbSlotChanged);
    return () => {
      window.removeEventListener('dfs-db-uploaded', onDbUploaded);
      window.removeEventListener('dfs-db-slot-changed', onDbSlotChanged);
    };
  }, [loadAppData]);

  useEffect(() => {
    if (!selectedTable) return;
    setLoading(true);
    setError("");
    api(`/table/${selectedTable}`)
      .then(res => res.json())
      .then(data => {
        // Backend returns an object: { data: [...rows], pagination: {...} }
        // We only need the rows array for this simple table viewer.
        setTableData(Array.isArray(data) ? data : (data.data || []));
        setLoading(false);
      })
      .catch(() => {
        setError("Could not fetch table data.");
        setLoading(false);
      });
  }, [selectedTable]);

  // In App component, expose setTables globally for Staging to use (always coerce to array)
  useEffect(() => {
    window.setTables = (list) => setTables(asStringArray(list));
    return () => { delete window.setTables; };
  }, [setTables]);

  // In App component, expose setSidebarStagings globally for sidebar delete to use
  useEffect(() => {
    window.setSidebarStagings = (list) => setSidebarStagings(asStringArray(list));
    return () => { delete window.setSidebarStagings; };
  }, [setSidebarStagings]);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/app/*" element={
          <RequireAuth>
          <>
            <AppUserBar />
            <SidebarNavWrapper
              tables={tables}
              selectedTable={selectedTable}
              setSelectedTable={setSelectedTable}
              sidebarStagings={sidebarStagings}
              curatedModels={curatedModels}
              setSelectedCurated={setSelectedCurated}
              selectedCurated={selectedCurated}
              martsModels={martsModels}
              setSelectedMart={setSelectedMart}
              selectedMart={selectedMart}
            />
            <main style={{ flex: 1, marginLeft: 220 }}>
              <Routes>
                <Route index element={
                  <div style={{ padding: 40 }}>
                    <UiPageHeader
                      title="SQLite Database Viewer"
                      subtitle="Select a table from the sidebar to view its data."
                    />
                    {error && <UiBanner tone="error">{error}</UiBanner>}
                    {!selectedTable && (
                      <UiEmptyState>Click a table name on the left to view its data.</UiEmptyState>
                    )}
                    {selectedTable && (
                      <>
                        <UiCard style={{ marginBottom: 24, padding: 20, display: 'inline-block' }}>
                          <h2 style={{ margin: 0, color: '#00b887', fontSize: 22 }}>{selectedTable}</h2>
                          <span style={{ color: '#8f9bb3', fontSize: 14 }}>Rows: {tableData.length}</span>
                        </UiCard>
                        {loading && <p>Loading table data...</p>}
                        {!loading && tableData.length === 0 && (
                          <UiEmptyState>No data in this table.</UiEmptyState>
                        )}
                        {tableData.length > 0 && (
                          <UiDataTable rows={tableData} />
                        )}
                      </>
                    )}
                  </div>
                } />
                <Route path="staging" element={<Staging />} />
                <Route path="curated" element={<CuratedModel curatedModels={curatedModels} setCuratedModels={setCuratedModels} selectedCurated={selectedCurated} setSelectedCurated={setSelectedCurated} />} />
                <Route path="marts" element={<MartModel martsModels={martsModels} setMartsModels={setMartsModels} selectedMart={selectedMart} setSelectedMart={setSelectedMart} />} />
                <Route path="ai" element={<AIDashboard />} />
                <Route path="compare" element={<PerformanceCompare martsModels={martsModels} selectedMart={selectedMart} setSelectedMart={setSelectedMart} />} />
                {/* Optionally, add /curated/:name route for direct linking */}
              </Routes>
            </main>
          </>
          </RequireAuth>
        } />
      </Routes>
    </Router>
  );
}

export default App;
