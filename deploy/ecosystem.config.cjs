/* eslint-disable @typescript-eslint/no-require-imports -- PM2 loads ecosystem files as CommonJS. */
const path = require('node:path');
const fs = require('node:fs');

const root = process.env.SUNFOOD_RELEASE_DIR;
const envFile = process.env.SUNFOOD_ENV_FILE;
if (!root || !path.isAbsolute(root)) throw new Error('Set SUNFOOD_RELEASE_DIR to an absolute release directory.');
if (!envFile || !path.isAbsolute(envFile)) throw new Error('Set SUNFOOD_ENV_FILE to a protected absolute env file.');
const envFileInfo = fs.statSync(envFile);
if (!envFileInfo.isFile()) throw new Error('SUNFOOD_ENV_FILE must be a file.');
if (process.platform !== 'win32' && (envFileInfo.mode & 0o077)) throw new Error('SUNFOOD_ENV_FILE permissions must be 600 or stricter.');
if (!process.env.PORT) throw new Error('Set PORT to the approved free canary/live port.');
const name = process.env.SUNFOOD_PROCESS_NAME || 'check-sunfood-canary';
const common = {
  cwd: root,
  interpreter: process.execPath,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  min_uptime: '15s',
  max_restarts: 5,
  restart_delay: 3000,
  kill_timeout: 30000,
  time: true,
  env: { NODE_ENV: 'production', SUNFOOD_ENV_FILE: envFile },
};

module.exports = { apps: [
  {
    ...common,
    name,
    script: path.join(root, 'scripts/start-standalone.mjs'),
    env: { ...common.env, HOSTNAME: '127.0.0.1', PORT: process.env.PORT },
  },
  // Disabled by default. Enable only once the worker contract and schema have
  // passed staging tests; only one worker may own the scheduled sync queue.
  ...(process.env.SUNFOOD_ENABLE_WORKER === 'true' ? [{
    ...common,
    name: `${name}-worker`,
    script: path.join(root, 'scripts/hanoicheck-worker.ts'),
    env: { ...common.env, DOTENV_CONFIG_PATH: envFile },
    node_args: [`--env-file=${envFile}`, '--import', 'tsx'],
  }] : []),
] };
