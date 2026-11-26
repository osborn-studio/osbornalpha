import {createHash, timingSafeEqual} from 'node:crypto';
import {isUuid} from '@/lib/portfolio/validate';

const tokenFormat=/^[A-Za-z0-9._~-]{32,256}$/;
export const sourceKey=/^[A-Za-z0-9._:-]{1,200}$/;

// These bindings are supplied by the formal server, independently of the caller's group messages.
export function getFeishuAccountConfig() {
  const token=process.env.FEISHU_SIMULATION_INGEST_TOKEN??'';
  const ownerId=process.env.FEISHU_SIMULATION_OWNER_ID;
  if(!tokenFormat.test(token)||!isUuid(ownerId))return null;
  try{
    const value:unknown=JSON.parse(process.env.FEISHU_SIMULATION_ANALYSTS??'{}');
    if(value===null||typeof value!=='object'||Array.isArray(value))return null;
    const analysts=new Map<string,string>();
    for(const [key,id] of Object.entries(value)){
      if(!sourceKey.test(key)||!isUuid(id))return null;
      analysts.set(key,id.toLowerCase());
    }
    return {token,ownerId:ownerId.toLowerCase(),analysts};
  }catch{return null;}
}

export function hasFeishuAccountToken(request:Request,expected:string){
  const supplied=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9._~-]{32,256})$/)?.[1];
  if(!supplied)return false;
  const digest=(text:string)=>createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(supplied),digest(expected));
}
