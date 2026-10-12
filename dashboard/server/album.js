// Syncs a public iCloud shared album (photos.icloud.com/shared/album/<key>)
// into PHOTOS_DIR. Uses the anonymous CloudKit endpoints the iCloud web app uses.
// Only files named icloud-*.jpg are managed (added/removed) here.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CK = 'https://ckdatabasews.icloud.com';
const DB = '/database/1/com.apple.photos.cloud/production';
const EVERY_MS = 30 * 60 * 1000;
const HEAD = { 'Content-Type': 'text/plain', Origin: 'https://photos.icloud.com' };
export const albumStatus = { last: null, count: 0, error: null, running: false };

function photosDir() {
  let dir = process.env.PHOTOS_DIR || '~/coelho-photos';
  if (dir.startsWith('~')) dir = path.join(os.homedir(), dir.slice(1));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function albumKey() {
  const m = String(process.env.ALBUM_URL || '').match(/shared\/album\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: HEAD, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function listAlbum(key) {
  const qs = (extra) => new URLSearchParams({ remapEnums: 'true', getCurrentSyncToken: 'true', sharing_url_key: key, ...extra });
  const resolved = await post(`${CK}${DB}/public/records/resolve?${qs({})}`,
    { shortGUIDs: [{ value: key, shouldFetchRootRecord: true }] });
  const r = resolved.results && resolved.results[0];
  if (!r || !r.anonymousPublicAccess) throw new Error(r && r.reason ? r.reason : 'album not public');
  const { token, databasePartition } = r.anonymousPublicAccess;
  const base = String(databasePartition || CK).replace(/:443$/, '');
  const items = [];
  let marker = null;
  for (let page = 0; page < 50; page++) {
    const body = {
      query: {
        recordType: 'CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted',
        filterBy: [
          { fieldName: 'direction', comparator: 'EQUALS', fieldValue: { value: 'ASCENDING', type: 'STRING' } },
          { fieldName: 'startRank', comparator: 'EQUALS', fieldValue: { value: 0, type: 'INT64' } },
        ],
      },
      zoneID: r.zoneID,
      resultsLimit: 200,
    };
    if (marker) body.continuationMarker = marker;
    const d = await post(`${base}${DB}/shared/records/query?${qs({ publicAccessAuthToken: token })}`, body);
    for (const rec of d.records || []) {
      if (rec.recordType !== 'CPLMaster') continue;
      const f = rec.fields || {};
      const res = (f.resJPEGMedRes && f.resJPEGMedRes.value) || (f.resJPEGFullRes && f.resJPEGFullRes.value);
      if (!res || !res.downloadURL) continue;
      items.push({ id: rec.recordName, url: res.downloadURL.replace('${f}', 'photo.jpg') });
    }
    marker = d.continuationMarker;
    if (!marker || !(d.records || []).length) break;
  }
  return items;
}

export async function syncAlbum() {
  const key = albumKey();
  if (!key || albumStatus.running) return albumStatus;
  albumStatus.running = true;
  try {
    const dir = photosDir();
    const items = await listAlbum(key);
    const want = new Map(items.map((it) => [
      `icloud-${crypto.createHash('sha1').update(it.id).digest('hex').slice(0, 16)}.jpg`, it]));
    for (const [name, it] of want) {
      const out = path.join(dir, name);
      if (fs.existsSync(out)) continue;
      try {
        const res = await fetch(it.url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(`${out}.part`, buf);
        fs.renameSync(`${out}.part`, out);
      } catch { /* retry next sync */ }
    }
    for (const name of fs.readdirSync(dir)) {
      if (/^icloud-[0-9a-f]{16}\.jpg$/.test(name) && !want.has(name)) fs.unlinkSync(path.join(dir, name));
    }
    albumStatus.count = want.size;
    albumStatus.error = null;
  } catch (e) {
    albumStatus.error = String(e && e.message ? e.message : e);
  } finally {
    albumStatus.last = new Date().toISOString();
    albumStatus.running = false;
  }
  return albumStatus;
}

export function startAlbumSync() {
  if (!albumKey()) return;
  syncAlbum();
  setInterval(syncAlbum, EVERY_MS).unref();
}
