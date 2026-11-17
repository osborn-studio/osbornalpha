'use client';
import {useState} from 'react';
import {Panel} from '@/components/ui';
import type {CycleTableView} from '@/lib/macro/strategy/contract';
import {cycleNotes, CYCLE_NOTES_VERSION, type CycleNoteSentence} from './cycle-notes';
import {EvidencePairDrawer, ObsRefTable} from './EvidencePairDrawer';
import {useStrategyT} from './use-strategy-t';

export function CycleNotes({view}:{view:CycleTableView}){
 const {locale,t}=useStrategyT();
 const [selection,setSelection]=useState<{view:CycleTableView;sentence:CycleNoteSentence}|null>(null);
 // Evidence belongs to the table DTO that supplied the sentence's endpoints.
 const drill=selection?.view===view?selection.sentence:null;
 const notes=cycleNotes(view,locale,t);
 const latest=view.episodes.reduce<string|null>((start,e)=>start===null||e.start>start?e.start:start,null);
 const latestKey=notes.find((_,i)=>view.episodes[i].start===latest)?.episodeKey;
 return (
  <Panel className="space-y-3">
   <h2 className="text-sm font-semibold">{t('cycleNotes.title')}</h2>
   <p className="text-xs text-text-dim">{t('cycleNotes.disclaimer')}</p>
   {notes.map(note=>(
    <details key={`${view.boundary}:${note.episodeKey}`} open={note.episodeKey===latestKey} className="rounded border border-border p-3">
     <summary className="cursor-pointer text-sm font-medium">{note.title}</summary>
     <ul className="mt-2 space-y-2 text-xs">
      {note.sentences.map(sentence=>(
       <li key={sentence.key}>
        {sentence.refs.length>0
         ?<button type="button" className="text-left underline-offset-2 hover:underline" aria-label={t('cycleNotes.openEvidence',{text:sentence.text})} onClick={()=>setSelection({view,sentence})}>{sentence.text}</button>
         :sentence.text}
       </li>
      ))}
     </ul>
    </details>
   ))}
   <p className="font-mono text-[11px] text-text-dim">{CYCLE_NOTES_VERSION}</p>
   <EvidencePairDrawer open={drill!==null} title={drill?.text??''} onClose={()=>setSelection(null)}>
    {drill?<ObsRefTable refs={drill.refs}/>:null}
   </EvidencePairDrawer>
  </Panel>
 );
}
