import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NextIntlClientProvider} from 'next-intl';
import {expect,it} from 'vitest';
import type {JudgmentCard} from '@/lib/industry/judgment-contract';
import zh from '../../../messages/zh/industries.json';
import en from '../../../messages/en/industries.json';
import zhJudgments from '../../../messages/zh/judgments.json';
import enJudgments from '../../../messages/en/judgments.json';
import {card,judgmentGallery} from '../../../e2e/fixtures/company';
import {JudgmentCards} from './JudgmentArea';

const settled={...card,subject:{type:'industry',key:'sic:sec-current:3674'},display:{...card.display,percent:null},
 lifecycle:'settled',outcome:'hit',settlement:{kind:'settled',outcome:'hit',realized:null,settled_at:'2026-01-30T12:00:00Z',evidence_summary:{zh:'已核对。',en:'Verified.'}},
 inputs:[judgmentGallery.cards[0].inputs[0]]} satisfies JudgmentCard;

for(const [locale,industries,judgments] of [['zh',zh,zhJudgments],['en',en,enJudgments]] as const)it(`localizes settled outcomes and input kinds (${locale})`,()=>{
 const html=renderToStaticMarkup(createElement(NextIntlClientProvider,{locale,timeZone:'UTC',messages:{industries,judgments},
  children:createElement(JudgmentCards,{cards:[settled]}),
 }));
 const paragraph=html.match(/<p\b[^>]* data-settlement="[^"]*"[^>]*>(.*?)<\/p>/s)?.[1]??'';
 const input=html.match(/<li\b[^>]* data-input="financial_fact"[^>]*>(.*?)<\/li>/s)?.[1]??'';
 expect.soft(paragraph).toContain(`>${judgments.outcome.hit}<`);
 expect.soft(paragraph).not.toContain('>hit<');
 expect.soft(input).toContain(`>${judgments.ui.inputKind.financial_fact}<`);
 expect.soft(input).not.toContain('>financial_fact<');
});
