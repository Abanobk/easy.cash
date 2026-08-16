import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export type ZkPunch = { enrollCode: string; punchedAt: Date };

export type ZkDeviceInfo = {
  userCounts: number;
  logCounts: number;
  logCapacity: number;
};

type ZkAttendanceRow = Record<string, unknown>;

function parsePunchTime(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEnrollCode(row: ZkAttendanceRow): string {
  const code = row.userId ?? row.uid ?? row.deviceUserId ?? row.pin ?? row.userSn;
  return code != null ? String(code).trim() : "";
}

function createZkClient(ip: string, port: number, commKey: number, timeoutMs: number) {
  const ZKLib = require("node-zklib") as new (
    ip: string,
    port: number,
    timeout: number,
    udpPort: number,
    commKey: number,
    protocol: string,
    maxChunk?: number,
  ) => {
    createSocket: (onErr?: (err: Error) => void, onClose?: () => void) => Promise<void>;
    disconnect: () => Promise<void>;
    getInfo: () => Promise<ZkDeviceInfo>;
    getAttendances: (onProgress?: (received: number, total: number) => void) => Promise<{ data: ZkAttendanceRow[]; err?: unknown }>;
    getUsers: () => Promise<{ data: ZkAttendanceRow[] }>;
  };
  return new ZKLib(ip, port, timeoutMs, 4000, commKey, "tcp", 8184);
}

export async function testZktecoConnection(opts: {
  ip: string;
  port?: number;
  commKey?: number;
  timeoutMs?: number;
}): Promise<ZkDeviceInfo> {
  const port = opts.port || 4370;
  const commKey = opts.commKey ?? 0;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const zk = createZkClient(opts.ip, port, commKey, timeoutMs);
  try {
    await zk.createSocket();
    return await zk.getInfo();
  } finally {
    try {
      await zk.disconnect();
    } catch {
      /* ignore */
    }
  }
}

export async function fetchZktecoAttendances(opts: {
  ip: string;
  port?: number;
  commKey?: number;
  timeoutMs?: number;
  since?: Date | null;
}): Promise<{ punches: ZkPunch[]; deviceInfo: ZkDeviceInfo; totalOnDevice: number }> {
  const port = opts.port || 4370;
  const commKey = opts.commKey ?? 0;
  const timeoutMs = opts.timeoutMs ?? 90000;
  const zk = createZkClient(opts.ip, port, commKey, timeoutMs);

  try {
    await zk.createSocket();
    const deviceInfo = await zk.getInfo();
    const result = await zk.getAttendances();
    const logs = Array.isArray(result?.data) ? result.data : [];
    const punches: ZkPunch[] = [];

    for (const row of logs) {
      const enrollCode = parseEnrollCode(row);
      const punchedAt = parsePunchTime(row.attTime ?? row.recordTime ?? row.timestamp ?? row.time);
      if (!enrollCode || !punchedAt) continue;
      if (opts.since && punchedAt <= opts.since) continue;
      punches.push({ enrollCode, punchedAt });
    }

    return { punches, deviceInfo, totalOnDevice: logs.length };
  } finally {
    try {
      await zk.disconnect();
    } catch {
      /* ignore */
    }
  }
}
