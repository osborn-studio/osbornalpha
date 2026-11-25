import {join} from 'node:path';
import {fixtureGildataSource,loadFixtureBody} from '../../vendor/gildata/fixture-source';
import {SW2021_L1_GILDATA} from './sw2021-gildata-codes';
export function fixtureDirSource(dir:string){
 return fixtureGildataSource({resolve(request){
  const entry=SW2021_L1_GILDATA.find(r=>r.nameZh===request.args.industry);
  const prefix=request.templateId==='sw_l1_members'?'members':request.templateId==='sw_l1_financials'?'financials':null;
  if(!entry||!prefix)return;
  try{return loadFixtureBody(join(dir,prefix+'-'+entry.gildataCode+'.json'));}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }});
}
