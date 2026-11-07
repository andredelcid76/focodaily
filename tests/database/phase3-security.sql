-- Fase 3 (S10, S11, S15, S16): roda sobre um banco já populado, dentro de uma transação
-- que é sempre desfeita. Cada linha do resultado precisa sair com ok = true.
begin;
create temp table phase3_results(name text, ok boolean, detail text) on commit drop;
grant insert, select on phase3_results to authenticated, anon;

do $$
declare
  _me uuid; _colleague uuid; _outsider uuid; _t1 uuid; _t2 uuid; _proj uuid; _err text; _v text;
begin
  -- Dados: dois colegas do domínio da empresa, alguém sem nada em comum, duas tarefas minhas
  -- e um projeto onde sou gestor (manager) mas não dono.
  select p.user_id into _me from public.profiles p
   join public.project_members pm on pm.user_id = p.user_id and pm.role = 'manager'
   join public.projects pr on pr.id = pm.project_id and pr.user_id <> p.user_id
   where public.company_domain_of(p.user_id) is not null limit 1;
  select pm.project_id into _proj from public.project_members pm join public.projects pr on pr.id = pm.project_id
   where pm.user_id = _me and pm.role = 'manager' and pr.user_id <> _me limit 1;
  select user_id into _colleague from public.profiles where user_id <> _me and public.is_company_colleague(_me, user_id) limit 1;
  select user_id into _outsider from public.profiles p where user_id <> _me
    and not coalesce(public.is_company_colleague(_me, p.user_id), false)
    and not exists (select 1 from private.project_ids_for(_me) a(id) where public.is_project_member(a.id, p.user_id)) limit 1;
  select id into _t1 from public.tasks where user_id = _me and project_id is null and recurrence = 'none' order by created_at limit 1;
  select id into _t2 from public.tasks where user_id = _me and project_id is null and recurrence = 'none' and id <> _t1 order by created_at limit 1;
  if _me is null or _colleague is null or _outsider is null or _t1 is null or _t2 is null or _proj is null then
    raise exception 'fixture data missing (me %, colleague %, outsider %, tasks % %, project %)', _me, _colleague, _outsider, _t1, _t2, _proj;
  end if;
  delete from public.task_dependencies where (predecessor_id, successor_id) in ((_t1, _t2), (_t2, _t1));

  -- S16: cabeçalho x-foco-actor-id só vale para service_role.
  perform set_config('request.headers', json_build_object('x-foco-actor-id', _outsider)::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', _me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into phase3_results values ('S16 authenticated ignores actor header', public.current_actor_id() = _me, public.current_actor_id()::text);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  insert into phase3_results values ('S16 anon ignores actor header', public.current_actor_id() is null, coalesce(public.current_actor_id()::text, 'null'));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  insert into phase3_results values ('S16 service_role uses actor header', public.current_actor_id() = _outsider, public.current_actor_id()::text);
  perform set_config('request.headers', '{}', true);

  -- S15: dependência exige acesso às duas tarefas.
  perform set_config('request.jwt.claims', json_build_object('sub', _outsider, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.task_dependencies (user_id, predecessor_id, successor_id) values (_outsider, _t1, _t2);
    insert into phase3_results values ('S15 outsider cannot link tasks it cannot see', false, 'inserted');
  exception when others then
    insert into phase3_results values ('S15 outsider cannot link tasks it cannot see', sqlstate = '42501', sqlerrm);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', _me, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.task_dependencies (user_id, predecessor_id, successor_id) values (_me, _t1, _t2);
    insert into phase3_results values ('S15 owner links two visible tasks', true, 'ok');
  exception when others then
    insert into phase3_results values ('S15 owner links two visible tasks', false, sqlerrm);
  end;

  -- S10: delegar só para o domínio da empresa ou projeto em comum.
  begin
    update public.tasks set assignee_id = _outsider where id = _t1;
    insert into phase3_results values ('S10 cannot delegate to outsider', false, 'updated');
  exception when others then
    insert into phase3_results values ('S10 cannot delegate to outsider', sqlstate = '42501', sqlerrm);
  end;
  begin
    update public.tasks set assignee_id = _colleague where id = _t2;
    insert into phase3_results values ('S10 can delegate to colleague', true, 'ok');
  exception when others then
    insert into phase3_results values ('S10 can delegate to colleague', false, sqlerrm);
  end;
  select count(*)::text into _v from public.delegable_user_ids() d(id) where d.id = _outsider;
  insert into phase3_results values ('S10 outsider not listed', _v = '0', _v);

  -- S11: gestor não se promove a admin; pode se rebaixar.
  begin
    update public.project_members set role = 'admin' where project_id = _proj and user_id = _me;
    insert into phase3_results values ('S11 manager cannot self-promote', false, 'updated');
  exception when others then
    insert into phase3_results values ('S11 manager cannot self-promote', sqlstate = '42501', sqlerrm);
  end;
  begin
    update public.project_members set role = 'member' where project_id = _proj and user_id = _me;
    insert into phase3_results values ('S11 manager may lower own role', true, 'ok');
  exception when others then
    insert into phase3_results values ('S11 manager may lower own role', false, sqlerrm);
  end;
  execute 'reset role';
end $$;

select name, ok, detail from phase3_results order by name;
rollback;
