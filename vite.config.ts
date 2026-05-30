import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const trackerDataDir = path.resolve(process.cwd(), 'tracker-data');
const trackerStateFile = path.join(trackerDataDir, 'tracker-state.json');
const trackerStateTempFile = path.join(trackerDataDir, 'tracker-state.json.tmp');

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readRequestJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > 5_000_000) {
      throw new Error('Tracker state payload is too large.');
    }

    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : {};
}

function normalizeTrackerState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tracker state must be an object.');
  }

  const state = value as Record<string, unknown>;
  const settings = state.settings && typeof state.settings === 'object' && !Array.isArray(state.settings)
    ? state.settings
    : {};
  const progress = state.progress && typeof state.progress === 'object' && !Array.isArray(state.progress)
    ? state.progress
    : {};

  return {
    settings,
    progress,
  };
}

async function readTrackerState() {
  try {
    const state = JSON.parse(await readFile(trackerStateFile, 'utf8'));
    return { exists: true, state };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, state: null };
    }

    throw error;
  }
}

async function writeTrackerState(value: unknown) {
  const state = normalizeTrackerState(value);

  await mkdir(trackerDataDir, { recursive: true });
  await writeFile(trackerStateTempFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(trackerStateTempFile, trackerStateFile);

  return state;
}

function trackerStateApiPlugin(): Plugin {
  async function handle(req: IncomingMessage, res: ServerResponse) {
    try {
      if (req.method === 'GET') {
        sendJson(res, 200, {
          ...(await readTrackerState()),
          path: trackerStateFile,
        });
        return;
      }

      if (req.method === 'PUT') {
        const state = await writeTrackerState(await readRequestJson(req));
        sendJson(res, 200, {
          ok: true,
          state,
          path: trackerStateFile,
          savedAt: new Date().toISOString(),
        });
        return;
      }

      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Unexpected tracker state API error',
      });
    }
  }

  return {
    name: 'tracker-state-api',
    configureServer(server) {
      server.middlewares.use('/api/state', handle);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/state', handle);
    },
  };
}

export default defineConfig({
  plugins: [trackerStateApiPlugin(), react()],
});
