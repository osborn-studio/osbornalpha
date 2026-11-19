// TOPICS ↓
import type {ReactNode} from 'react';
import {topicsEnabled} from '@/lib/topics/flags';
import {adminGate} from '@/app/(app)/admin/topics/_shared/gate';
import {FromThesisLinkProvider} from '@/app/(app)/admin/topics/new/from-thesis';

export default async function ThesisLayout({children}:{children:ReactNode}){
 if(!topicsEnabled()||!await adminGate())return children;
 return <FromThesisLinkProvider>{children}</FromThesisLinkProvider>;
}
// TOPICS ↑
