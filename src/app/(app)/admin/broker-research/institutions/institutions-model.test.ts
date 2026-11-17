import {expect,it} from 'vitest';
import {institutionSummary} from './institutions-model';
import type {InstitutionDetail} from './InstitutionsClient';
const d:InstitutionDetail={institution:{institution_id:'i',name_en:'Broker',name_zh:null,aliases:[]},scales:[],analysts:[]};
it('does not invent report counts, licence status or missing label counts',()=>{
 expect(institutionSummary(d,'2026-11-17')).toEqual({mapped:0,analysts:0,reports:null,licence:null});
});
it('counts distinct active labels and available analysts, excluding historical and future scales',()=>{
 const scale={scale_id:'s',raw_label:'Buy',normalized:'buy' as const,source_url:'https://example.test',valid_from:'2026-01-01',valid_to:null};
 expect(institutionSummary({...d,scales:[scale,{...scale,scale_id:'closed',valid_to:'2026-01-02'},{...scale,scale_id:'future',raw_label:'Sell',valid_from:'2027-01-01'}],analysts:[{analyst_id:'a',display_name:'A',name_variants:[],public_display:false}]},'2026-11-17')).toEqual({mapped:1,analysts:1,reports:null,licence:null});
});
