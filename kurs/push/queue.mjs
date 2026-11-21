import { createHash, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const tokenHash = (token) => createHash('sha256').update(token).digest();
export const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const DAY = 86_400_000;
const permittedEndpoint = (host) => host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' ||
  host === 'web.push.apple.com' || host.endsWith('.web.push.apple.com');

export function validSubscription(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048) return false;
  let endpoint;
  try { endpoint = new URL(sub.endpoint); } catch { return false; }
  return endpoint.protocol === 'https:' && !endpoint.port && !endpoint.username && !endpoint.password &&
    !endpoint.hash && permittedEndpoint(endpoint.hostname) && typeof sub.keys?.auth === 'string' &&
    /^[A-Za-z0-9_-]{22}={0,2}$/.test(sub.keys.auth) && typeof sub.keys?.p256dh === 'string' &&
    /^[A-Za-z0-9_-]{87}={0,2}$/.test(sub.keys.p256dh);
}

export function scheduleBody(body, now) {
  if (!validSubscription(body?.subscription) || !Array.isArray(body?.scheduled) || body.scheduled.length > 160) return null;
  const schedule = new Map();
  for (const item of body.scheduled) {
    const at = typeof item?.at === 'string' ? Date.parse(item.at) : NaN;
    if (!uuid(item?.id) || !Number.isFinite(at) || at <= now || at > now + 48 * DAY || schedule.has(item.id)) return null;
    schedule.set(item.id, at);
  }
  const { endpoint, keys } = body.subscription;
  return { subscription: JSON.stringify({ endpoint, keys: { auth: keys.auth, p256dh: keys.p256dh } }), schedule };
}

export function openQueue(file) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS installations (id TEXT PRIMARY KEY, auth BLOB NOT NULL, subscription TEXT NOT NULL, touched INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (installation TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE, id TEXT NOT NULL,
      at INTEGER NOT NULL, test INTEGER NOT NULL DEFAULT 0, retry INTEGER NOT NULL DEFAULT 0, next INTEGER NOT NULL,
      PRIMARY KEY (installation, id));
    CREATE TABLE IF NOT EXISTS delivered (installation TEXT NOT NULL REFERENCES installations(id) ON DELETE CASCADE, id TEXT NOT NULL,
      at INTEGER NOT NULL, PRIMARY KEY (installation, id, at));
    CREATE INDEX IF NOT EXISTS ready_jobs ON jobs(next);
    CREATE INDEX IF NOT EXISTS same_subscription ON installations(subscription);`);
  const findInstall = db.prepare('SELECT auth, touched FROM installations WHERE id = ?');
  const remove = db.prepare('DELETE FROM installations WHERE id = ?');
  const add = db.prepare('INSERT OR IGNORE INTO jobs(installation,id,at,test,next) VALUES(?,?,?,?,?)');
  const already = db.prepare('SELECT id FROM delivered WHERE installation=? AND id=? AND at=?');
  const done = db.prepare('DELETE FROM jobs WHERE installation = ? AND id = ? AND at = ?');
  return {
    authorize(id, token) {
      const row = findInstall.get(id);
      return row ? timingSafeEqual(Buffer.from(row.auth), tokenHash(token)) : null;
    },
    replace(id, token, input, now) {
      if (!findInstall.get(id) && db.prepare('SELECT COUNT(*) AS n FROM installations').get().n >= 100) return false;
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM installations WHERE subscription=? AND id<>?').run(input.subscription, id);
        db.prepare(`INSERT INTO installations VALUES(?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,touched=excluded.touched`)
          .run(id, tokenHash(token), input.subscription, now);
        const existing = db.prepare('SELECT id,at FROM jobs WHERE installation=? AND test=0').all(id);
        for (const item of existing) if (input.schedule.get(item.id) !== item.at) done.run(id, item.id, item.at);
        for (const [job, at] of input.schedule) if (!already.get(id, job, at)) add.run(id, job, at, 0, at);
        db.exec('COMMIT');
        return true;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    status(id) {
      const row = findInstall.get(id);
      if (!row) return null;
      return { latestSync: new Date(row.touched).toISOString(), scheduled: db.prepare('SELECT COUNT(*) AS n FROM jobs WHERE installation=? AND test=0').get(id).n };
    },
    remove(id) { remove.run(id); },
    test(id, job, now) {
      if (db.prepare('SELECT id FROM jobs WHERE installation=? AND test=1 AND at>?').get(id, now - 15_000) ||
          db.prepare('SELECT id FROM delivered WHERE installation=? AND id=?').get(id, job) ||
          db.prepare('SELECT id FROM delivered WHERE installation=? AND at>? AND at<?').get(id, now - 15_000, now)) return false;
      add.run(id, job, now, 1, now);
      return true;
    },
    ready(now) {
      return db.prepare(`SELECT jobs.*, installations.subscription FROM jobs JOIN installations ON installations.id=jobs.installation
        WHERE next <= ? AND at >= ? ORDER BY next LIMIT 64`).all(now, now - 60 * 60_000);
    },
    stillDue(job) { return !!db.prepare('SELECT id FROM jobs WHERE installation=? AND id=? AND at=?').get(job.installation, job.id, job.at); },
    delivered(job) {
      db.prepare('INSERT OR IGNORE INTO delivered VALUES(?,?,?)').run(job.installation, job.id, job.at);
      done.run(job.installation, job.id, job.at);
    },
    failed(job, code, now) {
      if (code === 404 || code === 410) { remove.run(job.installation); return; }
      if ([400, 401, 403, 413].includes(code) || job.retry >= 4) { done.run(job.installation, job.id, job.at); return; }
      db.prepare('UPDATE jobs SET retry = retry + 1, next = ? WHERE installation = ? AND id = ? AND at = ?')
        .run(now + 60_000 * (2 ** job.retry), job.installation, job.id, job.at);
    },
    prune(now) {
      db.prepare('DELETE FROM jobs WHERE at < ?').run(now - 60 * 60_000);
      db.prepare('DELETE FROM delivered WHERE at < ?').run(now - 3 * DAY);
      db.prepare('DELETE FROM installations WHERE touched < ?').run(now - 50 * DAY);
    },
    close() { db.close(); },
  };
}
