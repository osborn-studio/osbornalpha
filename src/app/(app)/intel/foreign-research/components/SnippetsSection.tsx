'use client';
// Public bounded snippets grouped by purpose (spec §9.3).
import {useTranslations} from 'next-intl';
import type {PublicSnippetDto} from '@/lib/broker-research/public-dto';
import {groupSnippets} from './format';
import {CARD,EN,H2,TINY} from './ui';
export function SnippetsSection({snippets,maxChars}:{snippets:PublicSnippetDto[];maxChars:number|null}){const t=useTranslations('foreign-research.public.snippets');const groups=groupSnippets(snippets);return <section className={CARD}><h2 className={H2}>{t('title')}<span className={EN}>{t('titleEn',{n:maxChars??'—'})}</span></h2>{groups.length?groups.map(([p,list])=><div key={p}><h3 className={TINY}>{t(`purpose.${p}`)}</h3>{list.map(s=><blockquote key={s.snippetId} className="my-2 rounded border border-border p-3 text-sm">“{s.text}” · {t('page',{page:s.page??'—'})}</blockquote>)}</div>):<p>{t('none')}</p>}</section>;}
