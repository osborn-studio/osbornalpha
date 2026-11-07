// Issuer-scoped "watch changed" signal (plan Task 17 review): the header TrackButton, the in-view TrackButton and
// CompanyTrackingView all depend on whether the user tracks one issuer; whoever changes it announces it here and
// every other subscriber for that issuer re-checks. Module-level listeners (browser-only use; pure for tests).
type Listener=(issuerId:string)=>void;
const listeners=new Set<Listener>();
export function subscribeWatchChanged(issuerId:string,fn:()=>void):()=>void{
 const l:Listener=(id)=>{if(id===issuerId)fn();};
 listeners.add(l);
 return ()=>{listeners.delete(l);};
}
export function notifyWatchChanged(issuerId:string):void{for(const l of [...listeners])l(issuerId);}
