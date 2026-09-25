import { cp } from 'node:fs/promises';
import path from 'node:path';

// output: 'standalone' only traces server code; static assets and public/ must be copied in
// by hand after every build, per Next.js's documented standalone deployment steps.
const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

await cp(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
