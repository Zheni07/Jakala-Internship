const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { ensureLimit } = require('../lib/sqlHelpers');
const config = require('../config');

const perfJobs = new Map();

function broadcastSample(job, payload) {
  job.esClients.forEach((res) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  });
}

function closeClients(job) {
  job.esClients.forEach((res) => res.end());
  job.esClients.clear();
}

function savePerfArtifacts(job, finalSample) {
  try {
    const perfDir = job.perfDir;
    fs.mkdirSync(perfDir, { recursive: true });
    const outJsonPath = path.join(perfDir, `${job.runId}.json`);
    const baseMeta = { ...job.meta };

    const labels = job.samples.map((_, i) => i + 1);
    const elapsedSeries = job.samples.map((s) => s.elapsedMs);
    const cpuUserSeries = job.samples.map((s) => s.cpuUserMs);
    const cpuSysSeries = job.samples.map((s) => s.cpuSystemMs);
    const rssSeries = job.samples.map((s) => s.rssMb);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Report - ${job.runId}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 20px; box-shadow: 0 15px 40px rgba(0,0,0,0.35); margin-bottom: 20px; }
    h1 { margin: 0 0 10px 0; color: #cbd5e1; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .label { color: #94a3b8; font-size: 13px; }
    .value { color: #e2e8f0; font-size: 20px; font-weight: 700; }
    canvas { background: #0b1224; border-radius: 10px; padding: 10px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Performance Run - ${job.meta.curatedName || 'manual'}</h1>
    <div class="label">${new Date().toLocaleString()}</div>
    <div class="grid" style="margin-top:12px;">
      <div><div class="label">Mode</div><div class="value">${job.meta.mode}</div></div>
      <div><div class="label">Elapsed (ms)</div><div class="value">${finalSample.elapsedMs.toFixed(2)}</div></div>
      <div><div class="label">CPU User (ms)</div><div class="value">${finalSample.cpuUserMs.toFixed(2)}</div></div>
      <div><div class="label">CPU System (ms)</div><div class="value">${finalSample.cpuSystemMs.toFixed(2)}</div></div>
      <div><div class="label">Rows Processed</div><div class="value">${finalSample.rowsProcessed}</div></div>
      <div><div class="label">Row Limit</div><div class="value">${job.meta.rowLimit}</div></div>
    </div>
  </div>
  <div class="card">
    <h2 style="margin-top:0;color:#cbd5e1;">Time / CPU Over Time</h2>
    <canvas id="chart-time" height="220"></canvas>
    <canvas id="chart-cpu" height="220" style="margin-top:16px;"></canvas>
    <canvas id="chart-rss" height="180" style="margin-top:16px;"></canvas>
  </div>
  <script>
    const labels = ${JSON.stringify(labels)};
    const elapsed = ${JSON.stringify(elapsedSeries)};
    const cpuUser = ${JSON.stringify(cpuUserSeries)};
    const cpuSys = ${JSON.stringify(cpuSysSeries)};
    const rss = ${JSON.stringify(rssSeries)};
    new Chart(document.getElementById('chart-time'), {
      type: 'line',
      data: { labels, datasets: [{ label: 'Elapsed ms', data: elapsed, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.15)', fill: true, tension: 0.15, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:true}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}}}}
    });
    new Chart(document.getElementById('chart-cpu'), {
      type: 'line',
      data: { labels, datasets: [
        { label: 'CPU User ms', data: cpuUser, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.15)', fill: true, tension: 0.15, pointRadius: 0 },
        { label: 'CPU Sys ms', data: cpuSys, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.15)', fill: true, tension: 0.15, pointRadius: 0 }
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:true}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}}}}
    });
    new Chart(document.getElementById('chart-rss'), {
      type: 'bar',
      data: { labels, datasets: [{ label: 'RSS MB', data: rss, backgroundColor: '#fbbf24' }]},
      options: { responsive: true, maintainAspectRatio: false, plugins:{ legend:{display:true}}, scales:{ x:{ticks:{color:'#94a3b8'}}, y:{ticks:{color:'#94a3b8'}}}}
    });
  </script>
</body>
</html>`;

    const outHtmlPath = path.join(perfDir, `${job.runId}.html`);
    fs.writeFileSync(outHtmlPath, html);
    const enrichedMeta = { ...baseMeta, reportPath: path.basename(outHtmlPath), jsonPath: path.basename(outJsonPath) };
    fs.writeFileSync(outJsonPath, JSON.stringify({ ...enrichedMeta, final: finalSample, samples: job.samples }, null, 2));
    return { jsonPath: outJsonPath, htmlPath: outHtmlPath, meta: enrichedMeta };
  } catch (err) {
    console.error('Failed to save perf artifacts:', err.message);
    return {};
  }
}

async function runPerfJob({
  runId,
  mode,
  sql,
  curatedName,
  rowLimit = config.fullChartRows,
  userId,
  dbPath,
  perfDir,
}) {
  const job = {
    runId,
    userId,
    dbPath,
    perfDir,
    mode,
    meta: {
      runId,
      mode,
      curatedName: curatedName || null,
      rowLimit,
      sql,
      startedAt: new Date().toISOString(),
    },
    status: 'running',
    samples: [],
    esClients: new Set(),
    cancelRequested: false,
  };

  perfJobs.set(runId, job);

  const startCpu = process.cpuUsage();
  const startTime = process.hrtime.bigint();
  let rowsProcessed = 0;

  const pushSample = (status = 'running') => {
    const elapsedNs = process.hrtime.bigint() - startTime;
    const elapsedMs = Number(elapsedNs) / 1e6;
    const cpu = process.cpuUsage(startCpu);
    const cpuUserMs = cpu.user / 1000;
    const cpuSystemMs = cpu.system / 1000;
    const rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
    const sample = { elapsedMs, cpuUserMs, cpuSystemMs, rssMb, rowsProcessed, status, ts: Date.now() };
    job.samples.push(sample);
    broadcastSample(job, sample);
    return sample;
  };

  const sampler = setInterval(() => {
    if (job.status !== 'running') return;
    pushSample('running');
  }, 400);

  const sqldb = new sqlite3.Database(dbPath);
  job.db = sqldb;
  try {
    const finalSql = ensureLimit(sql, rowLimit);
    await new Promise((resolve, reject) => {
      sqldb.all(finalSql, (err, rows) => {
        if (err) return reject(err);
        rowsProcessed = rows.length;
        resolve();
      });
    });
    if (job.cancelRequested) throw new Error('Cancelled');
    job.status = 'done';
    const finalSample = pushSample('done');
    job.meta.finishedAt = new Date().toISOString();
    job.meta.rowsProcessed = rowsProcessed;
    const artifacts = savePerfArtifacts(job, finalSample);
    if (artifacts.meta) {
      job.meta = { ...job.meta, ...artifacts.meta };
    } else {
      job.meta.reportPath = artifacts.htmlPath ? path.basename(artifacts.htmlPath) : null;
      job.meta.jsonPath = artifacts.jsonPath ? path.basename(artifacts.jsonPath) : null;
    }
    broadcastSample(job, { ...finalSample, status: 'done', reportPath: job.meta.reportPath });
    closeClients(job);
  } catch (err) {
    job.status = job.cancelRequested ? 'cancelled' : 'error';
    const finalSample = pushSample(job.status);
    job.meta.error = err.message;
    broadcastSample(job, { ...finalSample, status: job.status, error: err.message });
    closeClients(job);
  } finally {
    clearInterval(sampler);
    try {
      sqldb.close();
    } catch (e) {
      /* ignore */
    }
    job.db = null;
  }
  return job;
}

module.exports = {
  perfJobs,
  runPerfJob,
};
