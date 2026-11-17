// Shared state vocabulary; section pages translate legacy states before rendering cells.
export const RESEARCH_STATES = ['missing','withheld','notServed','lowCoverage','reconstructed','stale','revised','retracted'] as const;
export type ResearchState = typeof RESEARCH_STATES[number];
/** Whether the cell may still show its value next to the badge. */
export const STATE_SHOWS_VALUE: Record<ResearchState,boolean> = {
  missing:false,withheld:false,notServed:false,lowCoverage:false,reconstructed:true,stale:true,revised:true,retracted:false,
};
export const STATE_SHAPE: Record<ResearchState,'dashed'|'dotted'|'solid'> = {
  missing:'dashed',withheld:'dotted',notServed:'solid',lowCoverage:'dashed',reconstructed:'solid',stale:'solid',revised:'solid',retracted:'solid',
};
export const STATE_TONE: Record<ResearchState,'neutral'|'warn'|'danger'|'accent'> = {
  missing:'neutral',withheld:'neutral',notServed:'neutral',lowCoverage:'neutral',reconstructed:'accent',stale:'warn',revised:'warn',retracted:'danger',
};
/** Each module's current word -> unified state. Section sessions use this to switch. */
export const LEGACY_STATE_MAP: Readonly<Record<string,ResearchState>> = {
  /** Macro status code M; industry cell display: 'missing'; em dash placeholder used in tables. */
  missing:'missing',M:'missing','—':'missing',
  /** restricted / R: macro status code R; unlicensed: industry dataset licence state; withheld: evidence resolver state (topic spec 4.1) and company evidence gate; 授权待确认: licence-pending wording in existing copy. */
  restricted:'withheld',R:'withheld',unlicensed:'withheld',withheld:'withheld','授权待确认':'withheld',
  /** Evidence resolver state / markets the product does not serve. */
  not_served:'notServed',
  /** coverageSic / insufficient / members: industry PublicCell.display; low_coverage: generic. */
  coverageSic:'lowCoverage',insufficient:'lowCoverage',members:'lowCoverage',low_coverage:'lowCoverage',
  /** Industry run history_class. */
  reconstruction:'reconstructed',
  /** dq freshness status. */
  stale:'stale',
  /** revised / 修订: revision wording; drift:revised: topic drift state. */
  revised:'revised','修订':'revised','drift:revised':'revised',
  /** quarantined / rejected: macro observation / fact row status; unpublished: publication snapshots; retracted: evidence resolver state. */
  quarantined:'retracted',rejected:'retracted',unpublished:'retracted',retracted:'retracted',
};
export function unifiedState(legacy:string):ResearchState|null {
  return Object.hasOwn(LEGACY_STATE_MAP,legacy)?LEGACY_STATE_MAP[legacy]:null;
}
