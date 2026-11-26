import {DatabaseSync} from 'node:sqlite';
import {setTimeout as sleep} from 'node:timers/promises';

// Only metadata is consulted; the optimizer yields between model calls to the live connector.
export function connectorHasPriority(path,now=Date.now(),quietMs=6000) {
  if (!path) return false;
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    return Boolean(db.prepare(`SELECT 1 FROM feishu_workflow_events
      WHERE (received_at>=? OR (status='pending' AND received_at>=?))
      AND kind IN ('chat','proposal','approval','assistant_command','formal_report','analyst_roster','proposal_ai','proposal_followup','supplement') LIMIT 1`)
      .get(new Date(now-quietMs).toISOString(),new Date(now-300000).toISOString()));
  } finally {db.close();}
}
export async function yieldToConnector(path) {
  while(path && connectorHasPriority(path)) await sleep(1500);
}
