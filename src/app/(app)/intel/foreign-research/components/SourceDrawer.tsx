'use client';
import {useTranslations} from 'next-intl';
import {SourceDrawer as SharedSourceDrawer} from '@/components/research-ui/source-drawer/SourceDrawer';
import type {PublicCitationDto,PublicSnippetDto} from '@/lib/broker-research/public-types';
import {brokerDrawerInput,type BrokerMetadata} from './source-drawer-adapter';
export interface DrawerSubject{label:string;targetKey:string|null;value:string;citation:PublicCitationDto|null;snippets:PublicSnippetDto[];judgment:boolean}
export function SourceDrawer({subject,availableAt,codeVersion,rulesVersion,publicationId,metadata,onClose}:{subject:DrawerSubject|null;availableAt:string|null;codeVersion:string|null;rulesVersion:string|null;publicationId:string|null;metadata?:BrokerMetadata;onClose:()=>void}){
 const t=useTranslations('foreign-research');
 return <SharedSourceDrawer input={subject?brokerDrawerInput({subject,availableAt,codeVersion,rulesVersion,publicationId,metadata,text:t}):null} text={t} onClose={onClose}/>;
}
