// Explicit version route uses the same gated dossier frame (spec §7.2).
import TopicDossierPage from '../../page';
export const dynamic='force-dynamic';
export default async function TopicVersionPage(props:{params:Promise<{slug:string;n:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 return TopicDossierPage(props);
}
