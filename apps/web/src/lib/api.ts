export class ApiError extends Error { constructor(public status:number,public payload:any){super(payload?.error||`Request failed (${status})`)} }
export async function api<T=any>(path:string,options:RequestInit={}){const res=await fetch(path,{...options,credentials:'include',headers:{'content-type':'application/json',...(options.headers||{})}});let payload:any={};try{payload=await res.json()}catch{}if(!res.ok)throw new ApiError(res.status,payload);return payload as T;}
export const json=(body:unknown):RequestInit=>({method:'POST',body:JSON.stringify(body)});
