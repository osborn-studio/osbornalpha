/** Per-process bounded response memo. In-flight work shares the exact same version key. */
export class PresetsMemo<T>{
 private values=new Map<string,T>();
 private flights=new Map<string,Promise<{value:T;stored:boolean}>>();
 async get(key:string,compute:()=>Promise<T>,shouldStore?:(value:T)=>boolean):Promise<{value:T;hit:boolean}>{
  if(this.values.has(key)){
   const value=this.values.get(key)!;this.values.delete(key);this.values.set(key,value);return {value,hit:true};
  }
  const pending=this.flights.get(key);
  if(pending){const {value,stored}=await pending;return {value,hit:stored};}
  const flight=Promise.resolve().then(compute).then(value=>{
   const stored=shouldStore?.(value)??true;
   if(stored){
    this.values.set(key,value);
    if(this.values.size>32)this.values.delete(this.values.keys().next().value!);
   }
   return {value,stored};
  });this.flights.set(key,flight);
  try{
   const {value}=await flight;
   return {value,hit:false};
  }finally{this.flights.delete(key);}
 }
}
