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
const rpc = async (name, args) => {
  window.calls.push({name,args});
  if (name === 'is_tateyoko_admin') return {data:true};
  if (name === 'get_admin_current_role') return {data:'owner'};
  if (name === 'get_admin_organization_mode_status') return {data:{active:true,expires_at:'2099-01-01'}};
  if (name === 'get_admin_dashboard') return {data:{accounts,projects:[],attention:[],payments:[],metrics:{}}};
  if (name === 'get_admin_account_impacts') return window.failImpact ? {error:{message:'simulated error'}} : {data:structuredClone(window.impacts)};
  if (name === 'get_admin_account_detail') return {data:{account:accounts.find(a=>a.id===args.input_account_id),owned_projects:[],supporting_projects:[]}};
  if (name === 'get_admin_trash_index') return {data:[{entity_type:'book_project',entity_id:'p2',snapshot:{owner_user_id:'account-1'}}]};
  if (name === 'get_admin_project_display_names') return {data:{}};
  return {data:[]};
};
const client = {rpc,auth:{getSession:async()=>({data:{session:{user:{id:'admin',email:'admin@example.test'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}, functions:{invoke:async()=>{window.retireCalls++; return {error:{message:'No real lifecycle action allowed in QA'}};}}};
createRoot(document.getElementById('root')).render(<AdminReview supabaseClient={client}/>);
