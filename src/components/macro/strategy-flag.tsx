'use client';
import {createContext,useContext,type ReactNode} from 'react';

const StrategyFlag=createContext(false);
export function StrategyFlagProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
 return <StrategyFlag.Provider value={enabled}>{children}</StrategyFlag.Provider>;
}
export function useStrategyFlag():boolean{
 return useContext(StrategyFlag);
}
