import type {AnalysisResult,AnalysisSpec,FrozenInputs} from './correlation';
import type {Bilingual,Region} from './types';
export interface PresetCard{
 preset_id:string;run_id:null;request_id:string;kind:AnalysisSpec['kind'];spec:AnalysisSpec;inputs:FrozenInputs;
 inputs_hash:string;data_hash:string;results:(AnalysisResult&{explanation:Bilingual})|null;error:string|null;
 status:'ok'|'failed';method_version:string;code_version:string;created_at:string;
}
export interface PresetsResponse{
 region:Region;snapshot_id:string;cutoff:string;computed_at:string;code_version:string;method_version:string;
 presets_version:string;catalog_version:string;cards:PresetCard[];
}
