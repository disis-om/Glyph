import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const DEFAULT_URL = 'https://dm-chat-api.shares.zrok.io';

interface Metrics {
  sampledAt: string;
  app: {
    users: number;
    messages: number;
  };
  server: {
    uptimeSeconds: number;
    node: string;
    platform: string;
    arch: string;
    pid: number;
  };
  system: {
    memory: {
      usedPercent: number;
      used: number;
      total: number;
      process: {
        rss: number;
      };
    };
    loadavg: number[];
    cpus: number;
    hostname: string;
    uptimeSeconds: number;
    android?: {
      brand?: string;
      model?: string;
      release?: string;
    };
  };
  battery: {
    percent?: number;
    status?: string;
    temperatureC?: number;
    source?: string;
  };
  network: {
    rxBps: number;
    txBps: number;
    activeInterface?: string;
  };
}

function cleanUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function fmtBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function fmtDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function drawLine(canvas: HTMLCanvasElement | null, series: number[], color: string, maxValue?: number) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(205,239,226,.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  if (series.length < 2) return;
  const max = maxValue || Math.max(...series, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((value, index) => {
    const x = (index / (Math.max(series.length - 1, 1))) * width;
    const y = height - (Math.min(value, max) / max) * (height - 8) - 4;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawNet(canvas: HTMLCanvasElement | null, rx: number[], tx: number[]) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const max = Math.max(...rx, ...tx, 1);
  const draw = (series: number[], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((value, index) => {
      const x = (index / (Math.max(series.length - 1, 1))) * width;
      const y = height - (Math.min(value, max) / max) * (height - 8) - 4;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  draw(rx, '#64b5ff');
  draw(tx, '#ff5f99');
}

export default function App() {
  const [endpoint, setEndpoint] = useState(localStorage.getItem('monitor-backend-url') || DEFAULT_URL);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Idle');
  const [log, setLog] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const historyRef = useRef({ ram: [] as number[], rx: [] as number[], tx: [] as number[], load: [] as number[], battery: [] as number[] });
  const ramCanvas = useRef<HTMLCanvasElement | null>(null);
  const netCanvas = useRef<HTMLCanvasElement | null>(null);
  const loadCanvas = useRef<HTMLCanvasElement | null>(null);
  const batteryCanvas = useRef<HTMLCanvasElement | null>(null);

  const rows = useMemo(() => {
    const android = metrics?.system.android || {};
    return [
      ['Sampled', metrics?.sampledAt || '--'],
      ['Endpoint', endpoint],
      ['Node', metrics ? `${metrics.server.node} (${metrics.server.platform}/${metrics.server.arch})` : '--'],
      ['PID', metrics?.server.pid ?? '--'],
      ['CPU cores', metrics?.system.cpus ?? '--'],
      ['Hostname', metrics?.system.hostname ?? '--'],
      ['System uptime', metrics ? fmtDuration(metrics.system.uptimeSeconds) : '--'],
      ['Process RSS', metrics ? fmtBytes(metrics.system.memory.process.rss) : '--'],
      ['Network interface', metrics?.network.activeInterface || '--'],
      ['Battery source', metrics?.battery.source || '--'],
      ['Android', [android.brand, android.model, android.release && `Android ${android.release}`].filter(Boolean).join(' · ') || '--'],
    ];
  }, [endpoint, metrics]);

  const pushLine = (message: string) => {
    const time = new Date().toLocaleTimeString();
    setLog((current) => [`[${time}] ${message}`, ...current].slice(0, 200));
  };

  const renderMetrics = (data: Metrics) => {
    const rxKb = data.network.rxBps / 1024;
    const txKb = data.network.txBps / 1024;
    const ramUsed = data.system.memory.usedPercent || 0;
    const battery = data.battery.percent ?? 0;
    const load = data.system.loadavg?.[0] || 0;

    const history = historyRef.current;
    history.ram.push(ramUsed);
    history.rx.push(rxKb);
    history.tx.push(txKb);
    history.load.push(load);
    history.battery.push(battery);
    if (history.ram.length > 80) history.ram.shift();
    if (history.rx.length > 80) history.rx.shift();
    if (history.tx.length > 80) history.tx.shift();
    if (history.load.length > 80) history.load.shift();
    if (history.battery.length > 80) history.battery.shift();

    setMetrics(data);
  };

  const connect = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    const url = cleanUrl(endpoint || DEFAULT_URL);
    setEndpoint(url);
    localStorage.setItem('monitor-backend-url', url);
    setConnected(false);
    setStatus('Connecting...');

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    try {
      const response = await fetch(`${url}/metrics`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as Metrics;
      renderMetrics(data);
      pushLine('Initial metrics fetched.');
    } catch (error: any) {
      setStatus(`Fetch failed: ${error?.message || 'unknown'}`);
      pushLine(`Fetch failed: ${error?.message || 'unknown'}`);
    }

    const socket = io(url, { transports: ['websocket', 'polling'], reconnectionDelayMax: 4000 });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setStatus('Live metrics connected');
      pushLine(`Socket connected: ${socket.id}`);
      socket.emit('metrics:subscribe');
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      setStatus(`Disconnected: ${reason}`);
      pushLine(`Disconnected: ${reason}`);
    });

    socket.on('connect_error', (error) => {
      setConnected(false);
      setStatus(`Socket error: ${error?.message || 'unknown'}`);
      pushLine(`Socket error: ${error?.message || 'unknown'}`);
    });

    socket.on('metrics:update', (data: Metrics) => {
      renderMetrics(data);
      setStatus(`Updated ${new Date(data.sampledAt).toLocaleTimeString()}`);
    });
  };

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    drawLine(ramCanvas.current, historyRef.current.ram, '#31e39a', 100);
    drawNet(netCanvas.current, historyRef.current.rx, historyRef.current.tx);
    drawLine(loadCanvas.current, historyRef.current.load, '#ffc857');
    drawLine(batteryCanvas.current, historyRef.current.battery, '#ff5f99', 100);
  }, [metrics]);

  useEffect(() => {
    const handleResize = () => {
      drawLine(ramCanvas.current, historyRef.current.ram, '#31e39a', 100);
      drawNet(netCanvas.current, historyRef.current.rx, historyRef.current.tx);
      drawLine(loadCanvas.current, historyRef.current.load, '#ffc857');
      drawLine(batteryCanvas.current, historyRef.current.battery, '#ff5f99', 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="muted">Realtime backend</p>
          <h1>Observatory</h1>
        </div>
        <form className="endpoint-form" onSubmit={connect}>
          <input
            id="endpoint"
            aria-label="Backend URL"
            value={endpoint}
            onChange={(event) => setEndpoint(event.target.value)}
          />
          <button type="submit">Connect</button>
          <div className="status-line">
            <span className={`dot${connected ? ' live' : ''}`} />
            <span className="muted" id="statusText">{status}</span>
          </div>
        </form>
      </section>

      <section className="cards">
        <div className="card">
          <span>Online users</span>
          <strong id="users">{metrics?.app.users ?? '--'}</strong>
        </div>
        <div className="card">
          <span>Messages</span>
          <strong id="messages">{metrics?.app.messages ?? '--'}</strong>
        </div>
        <div className="card">
          <span>Server uptime</span>
          <strong id="backendUptime">{metrics ? fmtDuration(metrics.server.uptimeSeconds) : '--'}</strong>
        </div>
        <div className="card">
          <span>RAM usage</span>
          <strong id="ram">{metrics ? `${metrics.system.memory.usedPercent}%` : '--'}</strong>
        </div>
        <div className="card">
          <span>Battery</span>
          <strong id="battery">{metrics?.battery.percent == null ? '--' : `${metrics.battery.percent}%`}</strong>
        </div>
        <div className="card">
          <span>Network</span>
          <strong id="net">{metrics ? `${(metrics.network.rxBps / 1024).toFixed(1)}↓` : '--'}</strong>
        </div>
      </section>

      <section className="main-grid">
        <div className="panel">
          <h2>Live Graphs</h2>
          <div className="graph-grid">
            <div className="graph">
              <header>
                <b>RAM Used %</b>
                <span id="ramNow">{metrics ? `${fmtBytes(metrics.system.memory.used)} / ${fmtBytes(metrics.system.memory.total)}` : '--'}</span>
              </header>
              <canvas id="ramChart" ref={ramCanvas}></canvas>
            </div>
            <div className="graph">
              <header>
                <b>Network RX/TX KB/s</b>
                <span id="netNow">{metrics ? `${(metrics.network.rxBps / 1024).toFixed(1)} KB/s ↓  ${(metrics.network.txBps / 1024).toFixed(1)} KB/s ↑` : '--'}</span>
              </header>
              <canvas id="netChart" ref={netCanvas}></canvas>
            </div>
            <div className="graph">
              <header>
                <b>Load Average</b>
                <span id="loadNow">{metrics ? metrics.system.loadavg.map((item) => item.toFixed(2)).join(' / ') : '--'}</span>
              </header>
              <canvas id="loadChart" ref={loadCanvas}></canvas>
            </div>
            <div className="graph">
              <header>
                <b>Battery %</b>
                <span id="batteryNow">{metrics ? `${metrics.battery.status || 'unknown'} · ${metrics.battery.temperatureC ?? '--'}°C` : '--'}</span>
              </header>
              <canvas id="batteryChart" ref={batteryCanvas}></canvas>
            </div>
          </div>
        </div>

        <aside className="panel">
          <h2>Backend Details</h2>
          <table className="table">
            <tbody id="details">
              {rows.map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </aside>
      </section>

      <section className="panel">
        <h2>Live Event Log</h2>
        <div className="log" id="log">
          {log.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
