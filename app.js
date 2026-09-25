-- =====================================================
-- ADMINISTRACIÓN PRIVADA DE RETROSPECTIVAS
-- Ejecutar completo en Supabase SQL Editor
-- =====================================================

alter table public.retros
  add column if not exists publicada boolean not null default true;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from anon;
revoke all on table public.admin_users from authenticated;

-- -----------------------------------------------------
-- Helper: verifica si el usuario autenticado es admin
-- -----------------------------------------------------
create or replace function public.is_retro_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users a
    where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_retro_admin() to authenticated;

-- -----------------------------------------------------
-- Historial público: solo retros publicadas
-- -----------------------------------------------------
create or replace function public.get_retro_history()
returns json
language sql
security definer
set search_path = ''
as $$
  select coalesce(json_agg(row_to_json(x) order by x.fecha desc nulls last, x.created_at desc), '[]'::json)
  from (
    select
      r.id,
      r.codigo,
      r.nombre,
      r.equipos,
      r.fecha,
      r.iniciada,
      r.iniciada_en,
      r.finalizada_en,
      r.created_at
    from public.retros r
    where r.publicada = true
  ) x;
$$;

grant execute on function public.get_retro_history() to anon, authenticated;

-- -----------------------------------------------------
-- Historial administrativo: todas las retros
-- -----------------------------------------------------
create or replace function public.get_admin_retro_history()
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_retro_admin() then
    raise exception 'No autorizado';
  end if;

  return (
    select coalesce(json_agg(row_to_json(x) order by x.fecha desc nulls last, x.created_at desc), '[]'::json)
    from (
      select
        r.id,
        r.codigo,
        r.nombre,
        r.equipos,
        r.fecha,
        r.iniciada,
        r.iniciada_en,
        r.finalizada_en,
        r.publicada,
        r.created_at
      from public.retros r
    ) x
  );
end;
$$;

grant execute on function public.get_admin_retro_history() to authenticated;

-- -----------------------------------------------------
-- Publicar / archivar una retro
-- -----------------------------------------------------
create or replace function public.set_retro_publicada(
  p_retro_id uuid,
  p_publicada boolean
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_retro_admin() then
    raise exception 'No autorizado';
  end if;

  update public.retros
  set publicada = coalesce(p_publicada, false)
  where id = p_retro_id;

  if not found then
    raise exception 'Retrospectiva no encontrada';
  end if;

  return json_build_object(
    'success', true,
    'id', p_retro_id,
    'publicada', p_publicada
  );
end;
$$;

grant execute on function public.set_retro_publicada(uuid, boolean) to authenticated;

create index if not exists idx_retros_publicada_fecha
  on public.retros(publicada, fecha desc);
-- -----------------------------------------------------
-- Eliminar definitivamente una retrospectiva
-- -----------------------------------------------------
-- La eliminación se realiza mediante una función protegida
-- para asegurar que solo un administrador pueda hacerlo.
-- Se eliminan primero todos los datos asociados y luego la retro.
create or replace function public.delete_retro(
  p_retro_id uuid
)
returns json
language plpgsql
security definer
set search_path = ''
 as $$
begin
  if not public.is_retro_admin() then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1
    from public.retros
    where id = p_retro_id
  ) then
    raise exception 'Retrospectiva no encontrada';
  end if;

  -- Dependencias de la retrospectiva.
  delete from public.voto_participantes where retro_id = p_retro_id;
  delete from public.votos where retro_id = p_retro_id;
  delete from public.cards where retro_id = p_retro_id;
  delete from public.retro_topics where retro_id = p_retro_id;
  delete from public.preguntas_guia where retro_id = p_retro_id;
  delete from public.acciones where retro_id = p_retro_id;
  delete from public.participantes where retro_id = p_retro_id;
  delete from public.retro_feedback where retro_id = p_retro_id;

  delete from public.retros where id = p_retro_id;

  return json_build_object(
    'success', true,
    'retro_id', p_retro_id
  );
end;
$$;

grant execute on function public.delete_retro(uuid) to authenticated;


-- =====================================================
-- IMPORTANTE: después de crear el usuario administrador
-- en Supabase Authentication > Users, ejecutar:
--
-- insert into public.admin_users (user_id)
-- values ('UUID_DEL_USUARIO_ADMIN');
--
-- No se agrega ningún usuario administrador automáticamente.
-- =====================================================
