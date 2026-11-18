// Topic plan T5.5: server/test-only lexical adapter. Never import from a client component.
import {ownerTextFailures} from '@/lib/topics/lexical';
import {parseSlots} from '@/lib/topics/slots';
import {attachFixes,type FieldFinding} from './lint-model';
export function lintField(text:string,evidence:{ordinal:number;state:string;text:string|null}[]):FieldFinding[]{
 return attachFixes([...ownerTextFailures(text),...parseSlots(text).filter(s=>!evidence.some(e=>e.ordinal===s.ordinal)).map(s=>({code:'dangling_slot' as const,match:s.raw}))],evidence);
}
