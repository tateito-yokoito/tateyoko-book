import React from 'react';
import { createRoot } from 'react-dom/client';
import AdminReview from '../../src/admin/AdminReview.jsx';
const accounts = ['管理者', '確認用アカウント', '物語なし'].map((display_name, i) => ({ id: `account-${i}`, display_name, email: `example${i}@example.test`, owned_project_count: i === 1 ? 3 : 0, created_at: '2026-09-01', last_sign_in_at: '2026-09-11' }));
const project = (id, name, roles = ['owner']) => ({ id, name, roles, access_status: 'paid', answer_count: 4, starting_count: 3, addition_count: 2, video_count: 1, publication_count: 1, supporter_count: 2, sharing_count: 2, introduction_count: 1, introduction_addition_count: 1, hidden: false });
window.impacts = {
  'account-0': { is_admin: true, is_suspended: false, projects: [] },
  'account-1': { is_admin: false, is_suspended: false, projects: [project('p1','所有する物語A',['owner','purchaser']),{...project('p2','非表示の物語B'),hidden:true},project('p3','所有する物語C'),project('p4','お手伝い先の物語',['supporter','purchaser'])] },
  'account-2': { is_admin: false, is_suspended: false, projects: [] }
};
window.calls = []; window.failImpact = false; window.retireCalls = 0;
const storyRows = Array.from({length:8},(_,i)=>({id:`story-${i}`,subject_name:`物語の持ち主${i+1}`,owner_name:'利用者の名前',owner_email:'long-address-for-layout-verification@example.test',access_status:i%2?'paid':'trial',project_type:'self',answer_count:i*3,health_status:i%2?'error':'info',attention_reason:i%2?'配信先の情報を確認する必要があります。配信エラーが続いています。':'無料体験が7日以上停止',last_activity_at:'2026-09-11T12:00:00Z',purchased_at:'2026-09-10T12:00:00Z',stripe_checkout_session_id:'cs_test_very_long_checkout_session_identifier'}));
const rpc = async (name, args) => {
  window.calls.push({name,args});
  if (name === 'is_tateyoko_admin') return {data:true};
  if (name === 'get_admin_current_role') return {data:'owner'};
  if (name === 'get_admin_organization_mode_status') return {data:{active:true,expires_at:'2099-01-01'}};
  if (name === 'get_admin_dashboard') return {data:{accounts,projects:storyRows,attention:storyRows.slice(0,2),payments:storyRows,metrics:{}}};
  if (name === 'get_admin_project_detail') return {data:{project:storyRows.find(p=>p.id===args.input_project_id)}};
  if (name === 'get_admin_project_purchase') return {data:{}};
  if (name === 'get_admin_delivery_history') return {data:args?.input_account_id || args?.input_project_id ? [] : storyRows.map((p,i)=>({id:`delivery-${i}`,book_project_id:p.id,project_name:p.subject_name,delivery_kind:'question',delivery_status:i%2?'failed':'sent',recipient_email:p.owner_email,subject:'思い出についての長い問いの配信のお知らせ',error_message:i%2?'配信エラー。送信先を確認してください。':'',sent_at:'2026-09-11T12:00:00Z'}))};
  if (name === 'get_admin_account_impacts') return window.failImpact ? {error:{message:'simulated error'}} : {data:structuredClone(window.impacts)};
  if (name === 'get_admin_account_detail') return {data:{account:accounts.find(a=>a.id===args.input_account_id),owned_projects:[],supporting_projects:[]}};
  if (name === 'get_admin_trash_index') return {data:[{entity_type:'book_project',entity_id:'p2',snapshot:{owner_user_id:'account-1'}}]};
  if (name === 'get_admin_project_display_names') return {data:{}};
  return {data:[]};
};
const client = {rpc,from:()=>({select:()=>({eq:async()=>({data:[]})})}),auth:{getSession:async()=>({data:{session:{user:{id:'admin',email:'admin@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}, functions:{invoke:async(name)=>{if(name==='admin-account-lifecycle'){window.retireCalls++; return {error:{message:'No real lifecycle action allowed in QA'}};}return {data:{success:true,publication:null}};}}};
createRoot(document.getElementById('root')).render(<AdminReview supabaseClient={client}/>);
