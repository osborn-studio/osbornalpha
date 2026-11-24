import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { parseProfileInput } from '../../src/lib/analyst/validate.ts';

export const defaultAnalystProfiles = [
  {id:'A', display_name:'分析师 A', kind:'human', note:null},
  {id:'B', display_name:'分析师 B', kind:'human', note:null},
];
const digest = token => createHash('sha256').update(token).digest('hex');
const normalizeName = name => name.normalize('NFKC').toLowerCase();

function fail(status, message) {
  throw Object.assign(new Error(message), {status});
}

export function openAnalystProfiles(db, legacyKeys) {
  db.exec(`CREATE TABLE IF NOT EXISTS replay_analysts (
    seq INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK(kind IN ('human','agent')),
    note TEXT,
    token TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE
  )`);
  const select = db.prepare('SELECT id, display_name, kind, note FROM replay_analysts ORDER BY seq');
  const find = db.prepare('SELECT id FROM replay_analysts WHERE id=?');
  const findName = db.prepare('SELECT id FROM replay_analysts WHERE name_key=?');
  const auth = db.prepare('SELECT id FROM replay_analysts WHERE token_hash=?');
  const tokens = db.prepare('SELECT id, token FROM replay_analysts ORDER BY seq');
  const insert = db.prepare('INSERT INTO replay_analysts(id, display_name, name_key, kind, note, token, token_hash) VALUES (?,?,?,?,?,?,?)');
  const reservedNames = new Set(['PM', ...defaultAnalystProfiles.map(p => p.display_name)].map(normalizeName));

  function list() {
    return [...defaultAnalystProfiles.map(profile => ({...profile})), ...select.all().map(row => ({...row}))];
  }

  function create(raw) {
    const parsed = parseProfileInput(raw);
    if (!parsed.ok) {
      const message = parsed.error.startsWith('note') ? '备注过长，请控制在 4000 字符以内。' :
        parsed.error.startsWith('kind') ? '请选择真人或 Agent 类型。' : '请填写 1–60 字符的分析师显示名称。';
      fail(400,message);
    }
    const {display_name, kind, note} = parsed.value;
    if (/[\u0000-\u001f\u007f-\u009f]/u.test(display_name)) fail(400,'显示名称须填写在一行内。');
    const nameKey = normalizeName(display_name);
    if (reservedNames.has(nameKey) || findName.get(nameKey)) fail(409,'这个显示名称已被使用。');

    const profile = {id:'analyst-' + randomUUID(),display_name,kind,note:note?.trim() || null};
    const token = randomBytes(32).toString('base64url');
    insert.run(profile.id,display_name,nameKey,kind,profile.note,token,digest(token));
    return {profile,token};
  }

  // Legacy credentials remain in the original role-keys file. Dynamic credentials
  // live with their profiles, so a restart never invalidates an existing invitation.
  function credentials() {
    return {...legacyKeys, ...Object.fromEntries(tokens.all().map(row => [row.id,row.token]))};
  }
  function authenticate(bearer) {
    return bearer ? auth.get(digest(bearer))?.id : undefined;
  }
  function exists(id) {
    return typeof id === 'string' && (defaultAnalystProfiles.some(p => p.id === id) || Boolean(find.get(id)));
  }

  return {list,create,credentials,authenticate,exists};
}
