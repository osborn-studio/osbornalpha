import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {connectorHasPriority} from './offline-queue.mjs';

test('background inference yields to recent model requests and older pending work using only event metadata',t=>{
  const directory=mkdtempSync(join(tmpdir(),'feishu-priority-'));
  const path=join(directory,'queue.sqlite');
  const db=new DatabaseSync(path);
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  db.exec('CREATE TABLE feishu_workflow_events(kind TEXT,status TEXT,received_at TEXT)');
  const insert=db.prepare('INSERT INTO feishu_workflow_events VALUES(?,?,?)');
  const now=Date.UTC(2026,1,10);
  const update=(kind,state,ms)=>{
    db.exec('DELETE FROM feishu_workflow_events');
    insert.run(kind,state,new Date(now-ms).toISOString());
  };
  update('pairing','responded',100);assert.equal(connectorHasPriority(path,now),false);
  update('chat','responded',100);assert.equal(connectorHasPriority(path,now),true);
  update('chat','responded',9000);assert.equal(connectorHasPriority(path,now),false);
  assert.equal(connectorHasPriority(path,now,60000),true);
  update('supplement','pending',90000);assert.equal(connectorHasPriority(path,now),true);
  update('supplement','responded',90000);assert.equal(connectorHasPriority(path,now),false);
});
