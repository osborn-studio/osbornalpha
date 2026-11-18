import {topicCron} from '@/lib/topics/cron-route';
import {cronDeps} from '@/lib/topics/deps';
import {runDrift} from '@/lib/topics/drift';

export const dynamic='force-dynamic';
export const maxDuration=300;
const run=topicCron('topic-drift',async()=>runDrift(await cronDeps(),{deadlineMs:250_000}));
export {run as GET,run as POST};
