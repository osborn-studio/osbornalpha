/** Starts only the isolated local acceptance services; never loads production .env. */
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const state=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(new URL(state.runtimeUrl).hostname!=='127.0.0.1')throw Error('local_acceptance_only');
const secret=randomBytes(32).toString('hex'),port=process.env.S6_WEB_PORT||'3156',origin='http://127.0.0.1:'+port;
writeFileSync(join(state.directory,'web-state.json'),JSON.stringify({secret,origin}),{mode:0o600});
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',port],{stdio:'inherit',env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'development',ALPHA_S4_ENABLED:'1',ALPHA_S6_ENABLED:'1',ALPHA_S4_DATABASE_URL:state.runtimeUrl,ALPHA_S4_LOCAL_AUTH:'1',ALPHA_S4_ORIGIN:origin,ALPHA_S4_LOCAL_SESSION_SECRET:secret}});
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exitCode=code||0);
