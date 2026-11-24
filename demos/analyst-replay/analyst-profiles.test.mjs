import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openAnalystProfiles } from './analyst-profiles.mjs';
import { renderLauncher } from './launcher.mjs';

const keys = Object.fromEntries(['A','B','PM'].map(role => [role,randomBytes(32).toString('base64url')]));

test('dynamic profile invitations stay distinct across store initialization and preserve existing roles', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const profiles = openAnalystProfiles(db, keys);
    assert.deepEqual(profiles.list().map(p => p.id), ['A','B']);
    assert.equal(profiles.exists('PM'),false);
    const a = profiles.create({display_name:' 新分析师 ',note:'港股'});
    const b = profiles.create({display_name:' Agent C ',kind:'agent'});
    assert.match(a.profile.id,/^analyst-[0-9a-f-]{36}$/);
    assert.equal(a.profile.display_name,'新分析师');
    assert.equal(a.profile.note,'港股');
    assert.equal(a.profile.kind,'human');
    assert.equal(b.profile.kind,'agent');
    assert.notEqual(a.token,b.token);
    assert.equal(profiles.authenticate(a.token),a.profile.id);
    assert.equal(profiles.authenticate(keys.PM),undefined);
    assert.equal(profiles.authenticate('unknown'),undefined);

    const restored = openAnalystProfiles(db, keys);
    assert.deepEqual(restored.list().slice(2),[a.profile,b.profile]);
    assert.equal(restored.exists(a.profile.id),true);
    assert.equal(restored.exists('B'),true);
    assert.equal(restored.authenticate(b.token),b.profile.id);
    const credentials = restored.credentials();
    for (const [role,token] of Object.entries(keys)) assert.equal(credentials[role],token);
    assert.equal(credentials[b.profile.id],b.token);
    assert.equal(restored.credentials()[a.profile.id],a.token);
    assert.ok(restored.list().every(p => !Object.hasOwn(p,'token') && !Object.hasOwn(p,'token_hash')));
  } finally {
    db.close();
  }
});

test('analyst names follow formal validation and the private launcher escapes names', () => {
  const db = new DatabaseSync(':memory:');
  try {
    const profiles = openAnalystProfiles(db, keys);
    for (const name of ['', ' ', 'x'.repeat(61), 'Name\nExtra']) {
      assert.throws(() => profiles.create({display_name:name}), {status:400});
    }
    assert.throws(() => profiles.create({display_name:'bad type',kind:'PM'}), {status:400});
    assert.throws(() => profiles.create({display_name:'pＭ'}), {status:409});
    assert.throws(() => profiles.create({display_name:'分析师 a'}), {status:409});
    const {profile,token} = profiles.create({display_name:'<New & Agent>'});
    assert.throws(() => profiles.create({display_name:'<new & agent>'}), {status:409});
    const names = Object.fromEntries(profiles.list().map(p => [p.id,p.display_name]));
    const html = renderLauncher('https://shared.example.test',profiles.credentials(),{...names,PM:'PM'});
    assert.equal(html.includes('<New & Agent>'),false);
    assert.ok(html.includes('&lt;New &amp; Agent&gt;'));
    assert.ok(html.includes('href="https://shared.example.test/#key=' + token + '"'));
    assert.ok(html.includes('href="https://shared.example.test/#key=' + keys.PM + '"'));
    assert.equal(profiles.exists(profile.id),true);
  } finally {
    db.close();
  }
});


test('PM can create an analyst invitation and the new login stays private and valid after restart', {timeout:15000}, async () => {
  const directory = await mkdtemp(join(tmpdir(),'osborn-profiles-'));
  const publicUrl = 'https://shared.example.test';
  const main = fileURLToPath(new URL('./server.mjs', import.meta.url));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  let server;
  let exited;
  async function start() {
    server = spawn(process.execPath, ['--import','tsx',main], {
      cwd:root, env:{...process.env,REPLAY_PORT:'0',REPLAY_DATA_DIR:directory,REPLAY_PUBLIC_URL:publicUrl},
      stdio:['ignore','pipe','pipe'],
    });
    exited = once(server,'close');
    let stdout = '';
    return new Promise((resolve,reject) => {
      server.stdout.setEncoding('utf8').on('data',chunk => {
        stdout += chunk;
        const base = stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (base) resolve(base);
      });
      server.once('error',reject);
      server.once('exit',() => reject(new Error('分析师邀请测试服务未启动。')));
    });
  }
  async function stop() {
    if (!server) return;
    server.kill('SIGTERM');
    await exited;
    server = null;
  }
  let local;
  async function request(token, path, body) {
    return fetch(local + path, {
      headers:{authorization:'Bearer ' + token,'content-type':'application/json'},
      signal:AbortSignal.timeout(3000),
      ...(body ? {method:'POST',body:JSON.stringify(body)} : {}),
    });
  }

  try {
    local = await start();
    const legacy = JSON.parse(await readFile(join(directory,'role-keys.json'),'utf8'));
    const payload = {display_name:'第三位分析师',kind:'agent'};
    assert.equal((await request(legacy.A,'/api/analysts',payload)).status,403);
    assert.equal((await request(legacy.B,'/api/analysts/invites')).status,403);
    const created = await request(legacy.PM,'/api/analysts',payload);
    assert.equal(created.status,201);
    const {profile,inviteUrl} = await created.json();
    const invite = new URL(inviteUrl);
    assert.equal(invite.origin,publicUrl);
    const token = new URLSearchParams(invite.hash.slice(1)).get('key');
    assert.ok(token && token !== legacy.A && token !== legacy.PM);
    assert.equal((await stat(join(directory,'start.html'))).mode & 0o777,0o600);
    assert.ok((await readFile(join(directory,'start.html'),'utf8')).includes(inviteUrl));
    assert.equal((await request(token,'/start.html')).status,404);
    assert.equal((await request(token,'/api/action',{kind:'start'})).status,403);
    assert.equal((await request(token,'/api/analysts/invites')).status,403);

    await stop();
    local = await start();
    const loggedIn = await request(token,'/api/state');
    assert.equal(loggedIn.status,200);
    const raw = await loggedIn.text();
    assert.ok([token,...Object.values(legacy)].every(key => !raw.includes(key)));
    const state = JSON.parse(raw);
    assert.equal(state.role,profile.id);
    assert.equal(state.names[profile.id],profile.display_name);
    assert.equal(state.replayParticipant,false);
    assert.deepEqual(state.analysts.map(a=>a.id),['A','B',profile.id]);
    assert.equal((await request(legacy.A,'/api/state')).status,200);
    assert.equal((await request(legacy.PM,'/api/state')).status,200);
    const {invites} = await (await request(legacy.PM,'/api/analysts/invites')).json();
    assert.ok(invites.some(item => item.profile.id === profile.id && item.inviteUrl === inviteUrl));
  } finally {
    await stop();
    await rm(directory,{recursive:true,force:true});
  }
});
