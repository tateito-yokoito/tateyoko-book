import {TEST_SUPABASE_URL} from './publicTestSafety.js';

export function createFamilyDeliveryAccess(client,projectId) {
  if(client.supabaseUrl.replace(/\/$/,'')!==TEST_SUPABASE_URL)throw Error('TEST専用の設定です。');
  const call=async(name,patch={})=>{
    const {data,error}=await client.rpc(name,{p:projectId,...patch});
    if(error || !data?.delivery_suppressed)throw Error('お届け設定を保存できませんでした。');
    return data;
  };
  return {
    load:()=>call('family_test_delivery_preferences'),
    saveSchedules:schedules=>call('family_save_test_delivery',{schedules}),
    saveSms:enabled=>call('family_save_test_delivery',{sms_requested:enabled}),
  };
}
