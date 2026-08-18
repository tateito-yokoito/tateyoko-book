-- Limit the seven-day inactivity alert to projects that are actually in the
-- free-trial state. Legacy and paid projects can still surface operational
-- errors (invite delivery, introduction generation, or pending checkout), but
-- are not treated as abandoned trials.

create or replace function public.get_admin_dashboard(
  input_search text default null,
  input_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
  normalized_search text := lower(btrim(coalesce(input_search, '')));
  safe_limit integer := least(greatest(coalesce(input_limit, 200), 1), 500);
begin
  if auth.uid() is null or not public.is_tateyoko_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  with
  answer_stats as (
    select
      a.book_project_id,
      count(*)::integer as answer_count,
      max(a.created_at) as last_answer_at
    from public.answers a
    where a.book_project_id is not null
    group by a.book_project_id
  ),
  question_stats as (
    select
      uq.book_project_id,
      count(*) filter (where coalesce(uq.is_active, true))::integer as question_count,
      count(*) filter (
        where coalesce(uq.is_active, true)
          and (uq.status = 'answered' or uq.answered_at is not null)
      )::integer as answered_question_count
    from public.user_questions uq
    where uq.book_project_id is not null
    group by uq.book_project_id
  ),
  supporter_stats as (
    select ps.book_project_id,
      count(*) filter (where ps.status = 'active')::integer as active_supporter_count
    from public.project_supporters ps
    group by ps.book_project_id
  ),
  invite_stats as (
    select sri.book_project_id,
      count(*) filter (where sri.status = 'pending')::integer as pending_invite_count,
      count(*) filter (
        where sri.status = 'pending'
          and (sri.email_delivery_status = 'failed' or sri.email_error is not null)
      )::integer as invite_error_count
    from public.story_relationship_invites sri
    group by sri.book_project_id
  ),
  share_stats as (
    select pref.book_project_id,
      count(*) filter (where recipient.status = 'active')::integer as active_share_count
    from public.story_sharing_preferences pref
    left join public.story_share_recipients recipient
      on recipient.sharing_preference_id = pref.id
    group by pref.book_project_id
  ),
  introduction_stats as (
    select pi.book_project_id,
      bool_or(pi.generation_status = 'error') as introduction_error
    from public.project_introductions pi
    group by pi.book_project_id
  ),
  project_base as (
    select
      bp.id,
      bp.title,
      bp.status,
      bp.project_type,
      bp.owner_user_id,
      bp.subject_person_id,
      bp.access_status,
      bp.product_code,
      bp.purchased_at,
      bp.stripe_checkout_session_id,
      bp.stripe_customer_id,
      bp.stripe_payment_intent_id,
      bp.onboarding_status,
      bp.onboarding_started_at,
      bp.onboarding_completed_at,
      bp.created_at,
      nullif(to_jsonb(bp) ->> 'updated_at', '')::timestamptz as updated_at,
      au.email as owner_email,
      coalesce(
        nullif(to_jsonb(profile) ->> 'display_name', ''),
        nullif(to_jsonb(profile) ->> 'name', ''),
        nullif(to_jsonb(profile) ->> 'preferred_name', ''),
        au.email,
        '名称未登録'
      ) as owner_name,
      coalesce(
        nullif(to_jsonb(subject) ->> 'preferred_name', ''),
        nullif(to_jsonb(subject) ->> 'display_name', ''),
        bp.title,
        '名称未登録'
      ) as subject_name,
      coalesce(ans.answer_count, 0) as answer_count,
      ans.last_answer_at,
      coalesce(qs.question_count, 0) as question_count,
      coalesce(qs.answered_question_count, 0) as answered_question_count,
      coalesce(ss.active_supporter_count, 0) as active_supporter_count,
      coalesce(ivs.pending_invite_count, 0) as pending_invite_count,
      coalesce(ivs.invite_error_count, 0) as invite_error_count,
      coalesce(shs.active_share_count, 0) as active_share_count,
      coalesce(ins.introduction_error, false) as introduction_error,
      greatest(
        bp.created_at,
        coalesce(nullif(to_jsonb(bp) ->> 'updated_at', '')::timestamptz, bp.created_at),
        coalesce(ans.last_answer_at, bp.created_at)
      ) as last_activity_at
    from public.book_projects bp
    left join auth.users au on au.id = bp.owner_user_id
    left join public.profiles profile on profile.id = bp.owner_user_id
    left join public.persons subject on subject.id = bp.subject_person_id
    left join answer_stats ans on ans.book_project_id = bp.id
    left join question_stats qs on qs.book_project_id = bp.id
    left join supporter_stats ss on ss.book_project_id = bp.id
    left join invite_stats ivs on ivs.book_project_id = bp.id
    left join share_stats shs on shs.book_project_id = bp.id
    left join introduction_stats ins on ins.book_project_id = bp.id
  ),
  projects as (
    select
      pb.*,
      case
        when pb.invite_error_count > 0 then '招待メールの送信エラー'
        when pb.introduction_error then '人生の輪郭の生成エラー'
        when pb.access_status = 'checkout_pending'
          and pb.last_activity_at < now() - interval '30 minutes' then '決済確認が長時間未完了'
        when pb.access_status = 'trial'
          and pb.onboarding_status in ('not_started', 'in_progress')
          and pb.created_at < now() - interval '7 days'
          and coalesce(pb.last_answer_at, pb.created_at) < now() - interval '7 days' then '無料体験が7日以上停止'
        else null
      end as attention_reason,
      case
        when pb.invite_error_count > 0 or pb.introduction_error then 'error'
        when pb.access_status = 'checkout_pending'
          and pb.last_activity_at < now() - interval '30 minutes' then 'warning'
        when pb.access_status = 'trial'
          and pb.onboarding_status in ('not_started', 'in_progress')
          and pb.created_at < now() - interval '7 days'
          and coalesce(pb.last_answer_at, pb.created_at) < now() - interval '7 days' then 'info'
        else 'ok'
      end as health_status
    from project_base pb
  ),
  filtered_projects as (
    select *
    from projects p
    where normalized_search = ''
       or lower(concat_ws(' ', p.title, p.owner_name, p.owner_email, p.subject_name, p.id::text))
          like '%' || normalized_search || '%'
    order by p.last_activity_at desc
    limit safe_limit
  ),
  account_rows as (
    select
      u.id,
      u.email,
      coalesce(
        nullif(to_jsonb(profile) ->> 'display_name', ''),
        nullif(to_jsonb(profile) ->> 'name', ''),
        nullif(to_jsonb(profile) ->> 'preferred_name', ''),
        u.email,
        '名称未登録'
      ) as display_name,
      u.created_at,
      u.last_sign_in_at,
      count(distinct owned.id)::integer as owned_project_count,
      count(distinct supported.id) filter (where supported.status = 'active')::integer as supporting_project_count
    from auth.users u
    left join public.profiles profile on profile.id = u.id
    left join public.book_projects owned on owned.owner_user_id = u.id
    left join public.project_supporters supported on supported.supporter_user_id = u.id
    where normalized_search = ''
       or lower(concat_ws(' ', u.email,
          to_jsonb(profile) ->> 'display_name',
          to_jsonb(profile) ->> 'name',
          to_jsonb(profile) ->> 'preferred_name',
          u.id::text)) like '%' || normalized_search || '%'
    group by u.id, u.email, profile.id
    order by greatest(coalesce(u.last_sign_in_at, u.created_at), u.created_at) desc
    limit safe_limit
  )
  select jsonb_build_object(
    'generated_at', now(),
    'metrics', jsonb_build_object(
      'project_count', (select count(*) from projects),
      'account_count', (select count(*) from auth.users),
      'paid_project_count', (select count(*) from projects where access_status in ('paid', 'gifted', 'legacy')),
      'trial_project_count', (select count(*) from projects where access_status = 'trial'),
      'attention_count', (select count(*) from projects where attention_reason is not null)
    ),
    'projects', coalesce((
      select jsonb_agg(to_jsonb(fp) order by fp.last_activity_at desc)
      from filtered_projects fp
    ), '[]'::jsonb),
    'attention', coalesce((
      select jsonb_agg(to_jsonb(p) order by
        case p.health_status when 'error' then 1 when 'warning' then 2 else 3 end,
        p.last_activity_at desc)
      from filtered_projects p
      where p.attention_reason is not null
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(ar) order by greatest(coalesce(ar.last_sign_in_at, ar.created_at), ar.created_at) desc)
      from account_rows ar
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p) order by coalesce(p.purchased_at, p.created_at) desc)
      from filtered_projects p
      where p.access_status in ('checkout_pending', 'paid', 'gifted', 'refunded')
         or p.stripe_checkout_session_id is not null
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_admin_dashboard(text, integer) from public;
grant execute on function public.get_admin_dashboard(text, integer) to authenticated;

comment on function public.get_admin_dashboard(text, integer) is
  '運営管理ダッシュボード。7日停止の要対応判定は無料体験中の物語だけを対象とする。';
