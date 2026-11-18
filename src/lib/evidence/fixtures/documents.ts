// Topic spec §4.1 citation fixtures (X17).
import type {MemorySourcesInput} from '../memory-sources';
export const DOC={ok:'40000000-0000-4000-8000-000000000001',unknown:'40000000-0000-4000-8000-000000000002',later:'40000000-0000-4000-8000-000000000003',internal:'40000000-0000-4000-8000-000000000004',private:'40000000-0000-4000-8000-000000000005'};
export function documentFixture():MemorySourcesInput{
 return {documents:{citations:[DOC.ok,DOC.later,DOC.internal,DOC.private].map(id=>({
  citation_id:id,document_id:id,page_no:12,snippet:id===DOC.internal||id===DOC.private?'private snippet 87654321':'Public source excerpt',text_hash:'a'.repeat(64),
  visibility:id===DOC.internal?'internal' as const:'public' as const,created_at:id===DOC.later?'2026-11-20T00:00:00.000Z':'2026-11-01T00:00:00.000Z',
  document:{title:'Annual report',permission:id===DOC.private?'private' as const:'public' as const,publisher:'SEC',url:'https://example.com/report'},
 }))}};
}
