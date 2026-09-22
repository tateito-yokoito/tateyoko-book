// Generates a scoped, privileged operator transaction. Does NOT connect/deploy.
// No permanent RPC, permission weakening, account impersonation or consent fabrication.
import assert from 'node:assert/strict';
export const approvedProductionTarget={
 person:'916a3a94-e164-43d5-b9dd-298b2a85dac4',project:'aaf7c9ee-ac7e-41d8-b57b-e960181947b8',
 mother:'f82e78ec-5ffe-46f9-a9b2-f947161ac120',daughter:'672684dd-115d-4d8f-9e91-73ed2815cb34',
 supporter:'852d2f69-1ffb-4c2a-8aee-66f1695fdf78',order:'f7a5acac-1201-4a68-904f-a594df6efa4f'
};
const lit=s=>{
 assert.ok(!/\$(?:adopt|undo)\$/.test(String(s)),'Operator input must not terminate a DO block');
 return "'"+String(s).replaceAll("'","''")+"'";
};
export function protectedSnapshot(t){
 for(const v of Object.values(t))assert.match(v,/^[a-f0-9-]{36}$/);
 const entries={
  persons:`select * from persons where id='${t.person}'`,
  project:`select * from book_projects where id='${t.project}'`,
  links:`select * from user_person_links where person_id='${t.person}' or user_id in('${t.mother}','${t.daughter}')`,
  profiles:`select * from profiles where id in('${t.mother}','${t.daughter}')`,
  accounts:`select id,email,phone,email_confirmed_at,phone_confirmed_at from auth.users where id in('${t.mother}','${t.daughter}')`,
  orders:`select * from commerce_orders where book_project_id='${t.project}'`,
  contracts:`select * from experience_contracts where book_project_id='${t.project}'`,
  supporters:`select * from project_supporters where book_project_id='${t.project}'`,
  invites:`select * from project_invites where book_project_id='${t.project}'`,
  participants:`select * from project_participants where book_project_id='${t.project}'`,
  questions:`select * from user_questions where book_project_id='${t.project}'`,
  answers:`select * from answers where book_project_id='${t.project}'`,
  media:`select * from media_assets where book_project_id='${t.project}'`,
  sharing:`select * from story_sharing_preferences where book_project_id='${t.project}'`,
  recipients:`select * from story_share_recipients where sharing_preference_id in(select id from story_sharing_preferences where book_project_id='${t.project}')`,
  books:`select * from book_work_manifests where book_project_id='${t.project}'`
 };
 return 'select jsonb_build_object('+Object.entries(entries).map(([k,q])=>`${lit(k)},(select md5(coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb)::text) from (${q}) x)`).join(',')+') as snapshot';
}
export function adoptionSQL(t,{test=false,operatorReference,approvalReference,expectedSnapshot}={}){
 assert.ok(operatorReference&&approvalReference&&expectedSnapshot);
 if(!test)assert.deepEqual(t,approvedProductionTarget,'Only this separately approved production pair is supported');
 const snapshot=protectedSnapshot(t);
 return `begin isolation level serializable;
set local lock_timeout='3s'; set local statement_timeout='60s';
do $adopt$ declare before_state jsonb; after_state jsonb; audit_id uuid;
begin
 if current_user in('anon','authenticated') then raise exception 'Privileged operator required';end if;
 perform pg_advisory_xact_lock(hashtextextended('existing-supporter:${t.project}',0));
 perform 1 from book_projects where id='${t.project}' for update;
 perform 1 from persons where id='${t.person}' for update;
 perform 1 from project_supporters where id='${t.supporter}' for update;
 select snapshot into before_state from (${snapshot}) s;
 if before_state<>${lit(JSON.stringify(expectedSnapshot))}::jsonb then raise exception 'Snapshot drift: stop and re-review';end if;
 if '${t.mother}'='${t.daughter}' then raise exception 'Identity collision';end if;
 if not exists(select 1 from book_projects where id='${t.project}' and subject_person_id='${t.person}' and owner_user_id='${t.mother}' and purchaser_user_id='${t.mother}' and commerce_order_id='${t.order}' and status='active' and access_status='paid') then raise exception 'Target project mismatch';end if;
 if (select count(*) from book_projects where subject_person_id='${t.person}')<>1 then raise exception 'Multi-project Person requires separate review';end if;
 if (select count(*) from user_person_links where person_id='${t.person}' and role='self')<>1 or not exists(select 1 from user_person_links where person_id='${t.person}' and user_id='${t.mother}' and role='self') then raise exception 'Existing subject mismatch';end if;
 if not exists(select 1 from auth.users where id='${t.daughter}' and email_confirmed_at is not null) then raise exception 'Verified supporter required';end if;
 if not exists(select 1 from project_supporters where id='${t.supporter}' and book_project_id='${t.project}' and supporter_user_id='${t.daughter}' and status='active' and can_operate_recording) then raise exception 'Existing supporter mismatch';end if;
 if not exists(select 1 from commerce_orders where id='${t.order}' and book_project_id='${t.project}' and purchaser_user_id='${t.mother}' and status='zero_paid' and includes_base_book and stripe_mode='${test?'test':'live'}') then raise exception 'Existing payment mismatch';end if;
 if exists(select 1 from family_subject_bindings where person_id='${t.person}' or subject_user_id='${t.mother}') or exists(select 1 from family_production_consents where project_id='${t.project}') then raise exception 'Already adopted: inspect, never duplicate';end if;
 if exists(select 1 from voice_publications where book_project_id='${t.project}' and status='published') then raise exception 'Published work needs separate review';end if;
 if not exists(select 1 from family_private.rollout where id and enabled and '${t.daughter}'::uuid=any(allowed_actor_ids) and not subject_connection_enabled) then raise exception 'Separate allowlisted release approval required; C must stay OFF';end if;
 ${test?`if (select count(*) from auth.users where id in('${t.mother}','${t.daughter}') and email like '%@example.invalid')<>2 then raise exception 'Synthetic TEST accounts only';end if;`:''}
 -- Existing self-link is preserved, not a new SMS claim. initiated_by is the
 -- rollout sponsor; the actual operator is recorded separately below.
 insert into family_subject_bindings(person_id,subject_user_id,initiated_by,claimed_at,consent_version,progress_enabled,production_mode)
 select '${t.person}','${t.mother}','${t.daughter}',created_at,'existing-self-link-v1',false,'self'
 from user_person_links where person_id='${t.person}' and user_id='${t.mother}' and role='self';
 select snapshot into after_state from (${snapshot}) s;
 if after_state<>before_state then raise exception 'Protected records changed';end if;
 insert into activity_logs(actor_user_id,subject_user_id,book_project_id,entity_type,entity_id,action,source,metadata)
 values(null,'${t.mother}','${t.project}','person','${t.person}','existing_supporter_adopted','operator',jsonb_build_object(
 'operator_reference',${lit(operatorReference)},'approval_reference',${lit(approvalReference)},'db_session_user',session_user,
 'supporter_account','${t.daughter}','supporter_id','${t.supporter}','identity_basis','existing self link, no new claim',
 'before_hashes',before_state,'after_hashes',after_state,'production_consent','not granted: supporter must explicitly confirm')) returning id into audit_id;
end $adopt$;
commit;`;
}

// Only usable BEFORE any consent/production operation. After use, revoke the
// supporter and forward-fix; removing the binding could revive legacy access.
export function preUseRollbackSQL(t,{test=false,operatorReference,expectedSnapshot}={}){
 assert.ok(operatorReference&&expectedSnapshot);
 if(!test)assert.deepEqual(t,approvedProductionTarget);
 const snapshot=protectedSnapshot(t);
 return `begin isolation level serializable;
set local lock_timeout='3s';set local statement_timeout='60s';
do $undo$ declare current_snapshot jsonb;
begin
 if current_user in('anon','authenticated') then raise exception 'Privileged operator required';end if;
 perform pg_advisory_xact_lock(hashtextextended('existing-supporter:${t.project}',0));
 perform 1 from book_projects where id='${t.project}' for update;
 perform 1 from family_subject_bindings where person_id='${t.person}' for update;
 if exists(select 1 from family_production_consents where project_id='${t.project}') or exists(select 1 from family_uploads where project_id='${t.project}') or exists(select 1 from family_private.invites where person_id='${t.person}') then raise exception 'Already used: preserve binding and forward fix';end if;
 select snapshot into current_snapshot from (${snapshot}) s;
 if current_snapshot<>${lit(JSON.stringify(expectedSnapshot))}::jsonb then raise exception 'Protected state changed: rollback forbidden';end if;
 if not exists(select 1 from family_subject_bindings where person_id='${t.person}' and subject_user_id='${t.mother}' and initiated_by='${t.daughter}' and consent_version='existing-self-link-v1') then raise exception 'Binding mismatch';end if;
 delete from family_subject_bindings where person_id='${t.person}' and subject_user_id='${t.mother}' and consent_version='existing-self-link-v1';
 insert into activity_logs(subject_user_id,book_project_id,entity_type,entity_id,action,source,metadata)
 values('${t.mother}','${t.project}','person','${t.person}','existing_supporter_adoption_rolled_back','operator',jsonb_build_object('operator_reference',${lit(operatorReference)},'db_session_user',session_user,'protected_hashes',current_snapshot,'reason','before first use only'));
end $undo$;commit;`;
}
