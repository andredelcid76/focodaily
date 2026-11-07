-- is_company_colleague devolve NULL (não false) para quem está fora do domínio; sem COALESCE
-- a checagem de delegação virava NULL e o gatilho deixava passar.
CREATE OR REPLACE FUNCTION private.delegation_allowed(_actor uuid, _target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(_actor IS NOT NULL AND _target IS NOT NULL AND (
    _target = _actor
    OR COALESCE(public.is_company_colleague(_actor, _target), false)
    OR EXISTS (SELECT 1 FROM private.project_ids_for(_actor) a(id) WHERE public.is_project_member(a.id, _target))
  ), false)
$$;
