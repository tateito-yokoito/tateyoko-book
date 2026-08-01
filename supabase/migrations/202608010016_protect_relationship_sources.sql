begin;

create or replace function public.keep_story_recipient_source()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.source is distinct from old.source then
    new.source := old.source;
    new.status := old.status;
  end if;
  return new;
end;
$$;

commit;
