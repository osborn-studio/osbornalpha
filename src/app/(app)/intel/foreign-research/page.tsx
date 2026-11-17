// Dynamic public list shell (spec §9.1–9.2).
import {Suspense} from 'react';
import {ListClient} from './components/ListClient';
export const dynamic='force-dynamic';
export default function ForeignResearchListPage(){return <Suspense fallback={null}><ListClient/></Suspense>;}
