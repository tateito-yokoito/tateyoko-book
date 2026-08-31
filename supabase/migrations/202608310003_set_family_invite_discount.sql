begin;

insert into public.commerce_settings(setting_key, integer_value, updated_at)
values ('family_invite_discount_percent', 30, now())
on conflict (setting_key) do update
set integer_value = excluded.integer_value,
    updated_at = now();

commit;
