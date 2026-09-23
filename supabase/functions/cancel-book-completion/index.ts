import {serve} from 'https://deno.land/std@0.224.0/http/server.ts';
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {requireFamilyRelease} from '../_shared/family-release.ts';
import {requireStripeEnvironment,requireEventMode} from '../_shared/experience-commerce.ts';
import {recoverCompletionCheckout} from '../_shared/completion-checkout.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({success:false},405);
 if(Deno.env.get('BOOK_COMPLETION_ENABLED')!=='true')return reply({success:false},403);
 try{
  const url=Deno.env.get('SUPABASE_URL')!,authorization=req.headers.get('Authorization')||'';
  const caller=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:auth,error:authError}=await caller.auth.getUser();if(authError||!auth.user)return reply({success:false},401);
  const {candidateId}=await req.json();if(!/^[0-9a-f-]{36}$/i.test(candidateId||''))return reply({success:false},400);
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:c,error}=await admin.from('book_completion_candidates').select('id,book_project_id,state,order_id,requested_by').eq('id',candidateId).maybeSingle();
  if(error||!c||c.requested_by!==auth.user.id)return reply({success:false},403);
  const {data:allowed,error:permissionError}=await caller.rpc('can_manage_book_cover',{input_project_id:c.book_project_id});
  if(permissionError||allowed!==true)return reply({success:false},403);
  await requireFamilyRelease(admin,c.book_project_id,auth.user.id);
  if(c.state==='completed')return reply({success:false,error:'注文は完了しています'},409);
  if(c.order_id){
   const {data:o,error:orderError}=await admin.from('commerce_orders').select('id,status,stripe_checkout_session_id,metadata,purchaser_user_id').eq('id',c.order_id).single();if(orderError)throw orderError;
   if(['paid','zero_paid'].includes(o.status))return reply({success:false,error:'注文は完了しています'},409);
   const secret=Deno.env.get('STRIPE_SECRET_KEY')!;requireStripeEnvironment(secret);
   let checkout=await recoverCompletionCheckout(secret,o);
   if(!checkout){
    const {error:unstartedError}=await admin.rpc('cancel_unstarted_book_completion',{input_candidate_id:c.id});
    if(unstartedError)throw unstartedError;
    return reply({success:true});
   }
   const endpoint=`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(checkout.id)}`;
   if(checkout.metadata?.order_id!==o.id || checkout.metadata?.user_id!==auth.user.id)return reply({success:false},403);
   if(checkout.status==='open'){
    const response=await fetch(endpoint+'/expire',{method:'POST',headers:{Authorization:`Bearer ${secret}`}});checkout=await response.json();
    if(!response.ok)throw Error('Payment status changed; retry');requireEventMode(checkout.livemode);
   }
   if(checkout.status!=='expired')return reply({success:false,error:'決済が完了、または確認中のため取りやめできません'},409);
   const {error:expireError}=await admin.rpc('expire_commerce_order',{input_order_id:o.id});if(expireError)throw expireError;
  }
  const {error:cancelError}=await admin.rpc('cancel_book_completion',{input_candidate_id:c.id});if(cancelError)throw cancelError;
  return reply({success:true});
 }catch{return reply({success:false,error:'注文を取りやめできませんでした。決済状況を確認して再試行してください'},409);}
});
