// Topic research (spec §9, §13.1).
// Server switch (spec §9). Off → pages notFound(), APIs 404 topics_disabled, crons {skipped:'disabled'}.
export const topicsEnabled=(env:Record<string,string|undefined>=process.env):boolean=>env.TOPICS_ENABLED==='1';
/** D9: a current version older than this many days is marked stale. */
export const TOPIC_STALE_DAYS=90;
