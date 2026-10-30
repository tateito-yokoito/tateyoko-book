begin;

-- Freeze only reviewed, consented contributions with the owner's work. A
-- later review change cannot silently alter a confirmed paper/Web edition.
create function public.attach_story_contributions_to_work() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.confirmed_at is null and new.confirmed_at is not null then
    new.snapshot := jsonb_set(new.snapshot, '{contributions}', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', answer.id,
        'request_id', request.id,
        'question_key', answer.question_key,
        'source_question_id', answer.source_question_id,
        'theme_code', request.theme_code,
        'responder_name', answer.responder_name,
        'relationship', request.relationship_label,
        'recipient_name', request.recipient_name,
        'question', answer.prompt_snapshot,
        'body', answer.current_text,
        'audio_records', answer.audio_records,
        'photo_paths', answer.photo_paths
      ) order by request.created_at, answer.created_at)
      from public.theme_memory_answer_records answer
      join public.theme_memory_requests request on request.id = answer.request_id
      where request.book_project_id = new.book_project_id
        and answer.publication_status = 'included'
        and answer.consent_at is not null
    ), '[]'::jsonb), true);
  end if;
  return new;
end;
$$;

create trigger attach_story_contributions_to_work
  before update on public.book_work_manifests
  for each row execute function public.attach_story_contributions_to_work();
revoke all on function public.attach_story_contributions_to_work() from public, anon, authenticated;

commit;
