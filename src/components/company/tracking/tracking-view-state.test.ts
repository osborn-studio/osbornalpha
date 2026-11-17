import {expect,it} from 'vitest';
import {trackingViewState} from './tracking-view-state';
it('distinguishes loading, unavailable, empty and ok; errors suppress old rows',()=>{
 expect(trackingViewState({error:null,loading:true,rowCount:0})).toBe('loading');
 expect(trackingViewState({error:'down',loading:false,rowCount:4})).toBe('unavailable');
 expect(trackingViewState({error:'down',loading:true,rowCount:4})).toBe('unavailable');
 expect(trackingViewState({error:null,loading:false,rowCount:0})).toBe('empty');
 expect(trackingViewState({error:null,loading:false,rowCount:4})).toBe('ok');
});
