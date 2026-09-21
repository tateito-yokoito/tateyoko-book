// Environment flag is necessary, never sufficient: DB rollout is checked too.
export function familyEnvironmentEnabled(env: (name:string)=>string|undefined) {
 const url=env('SUPABASE_URL');
 return (url==='https://zpswxefgfabzvxdbtyvq.supabase.co' && env('FAMILY_TEST_ENABLED')==='true') ||
   (url==='https://wquxjeqkumossjxehdop.supabase.co' && env('FAMILY_PRODUCTION_ENABLED')==='true');
}
export async function requireFamilyRelease(admin:any, projectId:string, actorId:string, env=(name:string)=>Deno.env.get(name)) {
 const {data:managed,error}=await admin.rpc('family_managed',{p:projectId});
 if(error)throw Error('Family release unavailable');
 if(managed===false)return false; // Existing self flow is independent of family flags.
 if(managed!==true || !actorId || !familyEnvironmentEnabled(env))throw Error('Family release disabled');
 const {data:allowed,error:gateError}=await admin.rpc('family_release_actor_allowed',{p:projectId,u:actorId});
 if(gateError || allowed!==true)throw Error('Family release denied');
 return true;
}
