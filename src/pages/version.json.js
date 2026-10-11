import { WEB_VERSION } from '../lib/webVersion.js';

export function GET() {
  return new Response(JSON.stringify(WEB_VERSION), {
    headers: { 'Content-Type': 'application/json' }
  });
}
