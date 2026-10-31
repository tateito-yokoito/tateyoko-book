export async function shouldKickBookProduction(admin: any, orderId: string) {
  const { data, error } = await admin.from('commerce_orders')
    .select('pricing_version,production_method_v2')
    .eq('id', orderId)
    .single();
  if (error) throw error;
  // Legacy and self/family V2 orders retain the current production behavior.
  return !(data.pricing_version === 'v2' && data.production_method_v2 === 'interview_staff');
}
