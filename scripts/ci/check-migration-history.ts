import {createHash} from 'node:crypto';
import {openSync,closeSync,readSync} from 'node:fs';
import {migrationInventory} from './research-checks';
import {verifyMigrationHistory} from './migration-history';

// Read at most 1 MiB; errors never echo paths, connection strings or file contents.
try {
 const args=process.argv.slice(2);
 if(args.length!==2)throw new Error('USAGE');
 const fd=openSync(args[0],'r');const buffer=Buffer.alloc(1048577);let size=0;
 try{while(size<buffer.length){const count=readSync(fd,buffer,size,buffer.length-size,null);if(!count)break;size+=count;}}finally{closeSync(fd);}
 if(size>1048576)throw new Error('OVERSIZE');
 const result=verifyMigrationHistory(migrationInventory(),JSON.parse(buffer.subarray(0,size).toString('utf8')),args[1]);
 console.log(JSON.stringify({...result,inputSha256:createHash('sha256').update(buffer.subarray(0,size)).digest('hex')},null,2));
} catch {
 console.error('Migration history check failed. Supply a current, complete, ordered version-only JSON export and the expected project reference. No database action was taken.');
 process.exitCode=1;
}
