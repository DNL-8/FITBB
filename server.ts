import path from 'node:path';
import { pathToFileURL } from 'node:url';
import handler, {
  createAppServer,
  getServerlessApp,
  handleVercelRequest,
  startLocalNodeServer,
  type AppEnv,
} from './src/server/index.ts';

export {
  createAppServer,
  getServerlessApp,
  handleVercelRequest,
  startLocalNodeServer,
  type AppEnv,
};

export default handler;

function isMainEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (!process.env.VERCEL && isMainEntrypoint()) {
  void startLocalNodeServer();
}
