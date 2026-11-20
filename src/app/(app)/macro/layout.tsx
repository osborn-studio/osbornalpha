import type {ReactNode} from 'react';
import {StrategyFlagProvider} from '@/components/macro/strategy-flag';
import {strategyEnabled} from '@/lib/macro/strategy/flags';

export const dynamic = 'force-dynamic';

export default function MacroLayout({children}:{children:ReactNode}){
 return <StrategyFlagProvider enabled={strategyEnabled()}>{children}</StrategyFlagProvider>;
}
