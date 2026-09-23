// Run only after a verified payment, not after a redirect or a client "success" flag.
export async function completeBookOrder(admin:any,orderId:string){
 if(Deno.env.get('BOOK_COMPLETION_ENABLED')!=='true')return;
 const {error}=await admin.rpc('complete_book_order',{input_order_id:orderId});
 if(error)throw error; // Payment retry/reconciliation can safely repeat this RPC.
}
