import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
let previousNet = null;
let previousSampleAt = 0;

async function readText(path) {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch {
    return null;
  }
}

async function getBattery() {
  try {
    const { stdout } = await execFileAsync('termux-battery-status', { timeout: 1200 });
    const battery = JSON.parse(stdout);
    return {
      percent: battery.percentage ?? null,
      status: battery.status ?? null,
      plugged: battery.plugged ?? null,
      temperatureC: battery.temperature ?? null,
      source: 'termux-api',
    };
  } catch {
    const capacity = await readText('/sys/class/power_supply/battery/capacity');
    const status = await readText('/sys/class/power_supply/battery/status');
    const temp = await readText('/sys/class/power_supply/battery/temp');
    if (!capacity) {
      try {
        const { stdout } = await execFileAsync('dumpsys', ['battery'], { timeout: 1200 });
        const level = stdout.match(/level:\s*(\d+)/i)?.[1];
        const scale = stdout.match(/scale:\s*(\d+)/i)?.[1] || '100';
        const statusCode = stdout.match(/status:\s*(\d+)/i)?.[1];
        const ac = /AC powered:\s*true/i.test(stdout);
        const usb = /USB powered:\s*true/i.test(stdout);
        const wireless = /Wireless powered:\s*true/i.test(stdout);
        const temperature = stdout.match(/temperature:\s*(\d+)/i)?.[1];
        const percent = level ? Math.round((Number(level) / Number(scale)) * 100) : null;
        const statusMap = { 2: 'charging', 3: 'discharging', 4: 'not charging', 5: 'full' };
        return {
          percent,
          status: statusMap[statusCode] || statusCode || null,
          plugged: ac || usb || wireless,
          temperatureC: temperature ? Number(temperature) / 10 : null,
          source: 'dumpsys',
        };
      } catch {
        return {
          percent: null,
          status: null,
          plugged: null,
          temperatureC: null,
          source: 'unavailable',
        };
      }
    }
    return {
      percent: capacity ? Number(capacity) : null,
      status,
      plugged: status ? status.toLowerCase() === 'charging' : null,
      temperatureC: temp ? Number(temp) / 10 : null,
      source: 'sysfs',
    };
  }
}

async function getNetwork() {
  const interfaces = {};
  try {
    const names = await readdir('/sys/class/net');
    for (const name of names) {
      const rxBytes = Number(await readText(`/sys/class/net/${name}/statistics/rx_bytes`));
      const txBytes = Number(await readText(`/sys/class/net/${name}/statistics/tx_bytes`));
      if (Number.isFinite(rxBytes) && Number.isFinite(txBytes)) {
        interfaces[name] = { rxBytes, txBytes };
      }
    }
  } catch {
    // Fall back to /proc/net/dev below.
  }

  const raw = Object.keys(interfaces).length ? null : await readText('/proc/net/dev');
  if (!raw && !Object.keys(interfaces).length) {
    return { interfaces, rxBps: 0, txBps: 0, activeInterface: null };
  }

  if (raw) {
    for (const line of raw.split('\n').slice(2)) {
      const [namePart, dataPart] = line.split(':');
      if (!dataPart) continue;
      const name = namePart.trim();
      const values = dataPart.trim().split(/\s+/).map(Number);
      interfaces[name] = {
        rxBytes: values[0] || 0,
        txBytes: values[8] || 0,
      };
    }
  }

  const activeInterface =
    ['wlan0', 'rmnet_data0', 'eth0'].find((name) => interfaces[name]) ||
    Object.keys(interfaces).find((name) => name !== 'lo') ||
    null;

  const now = Date.now();
  let rxBps = 0;
  let txBps = 0;
  if (activeInterface && previousNet?.interfaces?.[activeInterface] && previousSampleAt) {
    const elapsed = Math.max(1, (now - previousSampleAt) / 1000);
    rxBps = Math.max(0, (interfaces[activeInterface].rxBytes - previousNet.interfaces[activeInterface].rxBytes) / elapsed);
    txBps = Math.max(0, (interfaces[activeInterface].txBytes - previousNet.interfaces[activeInterface].txBytes) / elapsed);
  }

  previousNet = { interfaces };
  previousSampleAt = now;
  return { interfaces, rxBps, txBps, activeInterface };
}

function memoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total,
    free,
    used,
    usedPercent: total ? Math.round((used / total) * 100) : null,
    process: process.memoryUsage(),
  };
}

async function androidInfo() {
  try {
    const { stdout } = await execFileAsync('getprop', { timeout: 1200 });
    const props = {};
    for (const line of stdout.split('\n')) {
      const match = line.match(/^\[(.+?)\]: \[(.*?)\]$/);
      if (match) props[match[1]] = match[2];
    }
    return {
      model: props['ro.product.model'] || null,
      brand: props['ro.product.brand'] || null,
      release: props['ro.build.version.release'] || null,
      sdk: props['ro.build.version.sdk'] || null,
    };
  } catch {
    return null;
  }
}

export async function collectMetrics(store) {
  const network = await getNetwork();
  return {
    ok: true,
    sampledAt: new Date().toISOString(),
    server: {
      name: 'dm-chat-backend',
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    app: {
      users: store.listUsers().length,
      messages: store.messageCount(),
    },
    system: {
      hostname: os.hostname(),
      loadavg: os.loadavg(),
      cpus: os.cpus().length,
      memory: memoryInfo(),
      uptimeSeconds: Math.round(os.uptime()),
      android: await androidInfo(),
    },
    battery: await getBattery(),
    network,
  };
}
