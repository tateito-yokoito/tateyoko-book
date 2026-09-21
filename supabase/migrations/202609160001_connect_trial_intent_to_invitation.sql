begin;
-- Project a subject's explicit decision into the existing inviter workflow.
-- No email is sent. The outbox in record_trial_continuation_intent owns delivery.
create function public.sync_trial_intent_to_invitation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 update public.family_story_invitations
 set status=case when new.decision='continue' then 'trial_completed' else 'trial_started' end,
     trial_completed_at=coalesce(trial_completed_at,new.decided_at)
 where id=new.invitation_id and recipient_project_id=new.book_project_id
   and offer_type='trial_gift' and status in ('trial_started','trial_completed')
   and continuation_decision is null;
 return new;
end; $$;
revoke all on function public.sync_trial_intent_to_invitation() from public,anon,authenticated;
create trigger trial_intent_invitation_projection
after insert or update on public.family_trial_intents
for each row execute function public.sync_trial_intent_to_invitation();
commit;
