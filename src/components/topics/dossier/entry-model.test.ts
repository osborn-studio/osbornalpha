import {expect,it} from 'vitest';
import {excerptLines} from './entry-model';
it('retains only credits and links in masked rows',()=>{
 const credit={attribution:'A',url:'https://example.org'};
 expect(excerptLines({key:'q',entry_type:'licensed_excerpt',masked:true,reason:'licence_revoked',attributions:[credit]})).toEqual([{...credit,text:null,date:null}]);
});
