import { createServer } from 'node:http';
import webPush from 'web-push';
import { openQueue, scheduleBody, uuid } from './queue.mjs';

const { KURS_ORIGIN, VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, DATABASE, PORT = '8787', HOST = '127.0.0.1' } = process.env;
if (!KURS_ORIGIN || !VAPID_CONTACT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !DATABASE) {
  process.stderr.write('Set KURS_ORIGIN, DATABASE and VAPID credentials before starting.\n');
  process.exit(1);
}
webPush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const queue = openQueue(DATABASE);
const maybeJson = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

let running = false;
async function dispatch() {
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    queue.prune(now);
    for (const job of queue.ready(now)) {
      if (!queue.stillDue(job)) continue;
      try {
        await webPush.sendNotification(JSON.parse(job.subscription), JSON.stringify({ id: job.id, ...(job.test ? { test: true } : {}) }),
          { TTL: job.test ? 120 : 1800, timeout: 8000, topic: job.id.replace(/-/g, '') });
        queue.delivered(job);
      } catch (error) {
        queue.failed(job, error.statusCode, Date.now());
      }
    }
  } finally { running = false; }
}
const timer = setInterval(() => void dispatch().catch(() => {}), 15_000);
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, data) => {
    res.statusCode = status;
    if (!data) { res.end(); return; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
  };
  if (origin !== KURS_ORIGIN) return reply(403);
  res.setHeader('Access-Control-Allow-Origin', KURS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return reply(204);
  const match = /^\/(?:push\/)?([0-9a-f-]+)\/(schedule|test)$/.exec(req.url ?? '');
  if (!match || !uuid(match[1])) return reply(404);
  const [, id, action] = match;
  const token = /^Bearer ([0-9a-f-]{72})$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return reply(401);
  const authorized = queue.authorize(id, token);
  if (authorized === false) return reply(401);
  if (action === 'schedule' && req.method === 'DELETE') { queue.remove(id); return reply(204); }
  if (action === 'schedule' && req.method === 'GET') return authorized ? reply(200, queue.status(id)) : reply(404);
  if (req.method !== 'PUT') return reply(405);
  try {
    const parsed = await maybeJson(req);
    const currentAuthorization = queue.authorize(id, token);
    if (currentAuthorization === false) return reply(401);
    const now = Date.now();
    if (action === 'schedule') {
      const input = scheduleBody(parsed, now);
      return !input ? reply(400) : queue.replace(id, token, input, now) ? reply(200, queue.status(id)) : reply(429);
    }
    if (!currentAuthorization) return reply(404);
    if (!uuid(parsed?.id)) return reply(400);
    if (!queue.test(id, parsed.id, now)) return reply(429);
    reply(202, { queued: true });
    void dispatch().catch(() => {});
  } catch {
    reply(400);
  }
});
server.requestTimeout = 15_000;
server.listen(Number(PORT), HOST);
function stop() {
  clearInterval(timer);
  server.close();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
