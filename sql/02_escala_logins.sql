-- ============================================================
-- Escala 5x2 · Molicenter — SQL 02: logins próprios da escala
-- (deixa de usar os usuários do QL; o QL continua igual)
--
-- Usuários: Analista, Departamento Pessoal, Loja 01 a Loja 08 e Loja 30 (CD).
--   Analista e Departamento Pessoal → veem e editam as 8 lojas + Loja 30
--   Loja 01..08 e Loja 30            → só a própria loja
-- As SENHAS ficam no arquivo separado 02b (não suba ele no GitHub).
-- Rodar DEPOIS do 01. Pode rodar mais de uma vez.
-- ============================================================
create extension if not exists pgcrypto with schema extensions;

create table if not exists escala_web_usuarios (
  usuario    text primary key,
  perfil     text not null check (perfil in ('analista', 'dp', 'loja')),
  loja_fixa  integer,
  senha_hash text,
  ordem      integer not null default 99,
  ativo      boolean not null default true
);
create table if not exists escala_web_sessoes (
  token     uuid primary key default gen_random_uuid(),
  usuario   text not null,
  perfil    text not null,
  loja_fixa integer,
  criado_em timestamptz not null default now(),
  visto_em  timestamptz not null default now(),
  expira_em timestamptz not null
);
create table if not exists escala_web_tentativas (
  id      bigserial primary key,
  usuario text not null,
  ok      boolean not null,
  em      timestamptz not null default now()
);
alter table escala_web_usuarios enable row level security;
alter table escala_web_sessoes enable row level security;
alter table escala_web_tentativas enable row level security;
revoke all on escala_web_usuarios, escala_web_sessoes, escala_web_tentativas from anon, authenticated;

-- os 10 usuários (as senhas vêm no 02b)
insert into escala_web_usuarios (usuario, perfil, loja_fixa, ordem) values
  ('Analista', 'analista', null, 1),
  ('Departamento Pessoal', 'dp', null, 2),
  ('Loja 01', 'loja', 1, 11), ('Loja 02', 'loja', 2, 12), ('Loja 03', 'loja', 3, 13), ('Loja 04', 'loja', 4, 14),
  ('Loja 05', 'loja', 5, 15), ('Loja 06', 'loja', 6, 16), ('Loja 07', 'loja', 7, 17), ('Loja 08', 'loja', 8, 18),
  ('Loja 30', 'loja', 30, 19)
on conflict (usuario) do update set perfil = excluded.perfil, loja_fixa = excluded.loja_fixa, ordem = excluded.ordem, ativo = true;
-- qualquer outro usuário que exista na tabela fica desativado
update escala_web_usuarios set ativo = false
 where usuario not in ('Analista', 'Departamento Pessoal', 'Loja 01', 'Loja 02', 'Loja 03', 'Loja 04', 'Loja 05', 'Loja 06', 'Loja 07', 'Loja 08', 'Loja 30');

-- ------------------------------------------------------------
create or replace function escala_web_lista_usuarios()
returns json language sql security definer set search_path to 'public' as $$
  select coalesce(json_agg(usuario order by ordem, usuario), '[]'::json) from escala_web_usuarios where ativo
$$;

create or replace function escala_web_login(p_usuario text, p_senha text)
returns json language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare u escala_web_usuarios; v_token uuid;
begin
  if (select count(*) from escala_web_tentativas
       where usuario = coalesce(p_usuario, '') and not ok and em > now() - interval '10 minutes') >= 8 then
    raise exception 'MUITAS_TENTATIVAS';
  end if;
  select * into u from escala_web_usuarios where usuario = coalesce(p_usuario, '') and ativo;
  if not found then raise exception 'USUARIO_INVALIDO'; end if;
  if u.senha_hash is null then raise exception 'SENHA_NAO_CONFIGURADA'; end if;
  if u.senha_hash <> crypt(coalesce(p_senha, ''), u.senha_hash) then
    insert into escala_web_tentativas (usuario, ok) values (u.usuario, false);
    raise exception 'SENHA_INCORRETA';
  end if;
  insert into escala_web_tentativas (usuario, ok) values (u.usuario, true);
  delete from escala_web_sessoes where expira_em < now();
  delete from escala_web_tentativas where em < now() - interval '30 days';
  insert into escala_web_sessoes (usuario, perfil, loja_fixa, expira_em)
  values (u.usuario, u.perfil, u.loja_fixa, now() + interval '18 hours')
  returning token into v_token;
  return json_build_object('token', v_token, 'email', u.usuario, 'perfil', u.perfil, 'loja_fixa', u.loja_fixa);
end $$;

create or replace function escala_web_sair(p_token uuid)
returns void language sql security definer set search_path to 'public' as $$
  delete from escala_web_sessoes where token = p_token
$$;

create or replace function _escala_web_sessao(p_token uuid)
returns escala_web_sessoes language plpgsql security definer set search_path to 'public' as $$
declare s escala_web_sessoes;
begin
  update escala_web_sessoes set visto_em = now()
   where token = p_token and expira_em > now()
  returning * into s;
  if not found then raise exception 'SESSAO_INVALIDA'; end if;
  return s;
end $$;

-- loja que a sessão pode abrir (login de loja = sempre a própria)
create or replace function _escala_web_loja(s escala_web_sessoes, p_loja integer)
returns integer language plpgsql stable as $$
begin
  if s.loja_fixa is not null then return s.loja_fixa; end if;
  if p_loja between 1 and 8 or p_loja = 30 then return p_loja; end if;
  raise exception 'ESCOPO_INVALIDO';
end $$;

-- ------------------------------------------------------------
-- as duas funções da escala passam a usar a sessão própria
-- ------------------------------------------------------------
create or replace function escala_web_dados(p_token uuid, p_loja integer)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s escala_web_sessoes; v_loja int;
begin
  s := _escala_web_sessao(p_token);
  v_loja := _escala_web_loja(s, p_loja);
  return json_build_object(
    'loja', v_loja,
    'lojas', case when s.loja_fixa is not null then json_build_array(s.loja_fixa) else '[1,2,3,4,5,6,7,8,30]'::json end,
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'pessoas', (select coalesce(json_agg(json_build_object(
                  'n', nome, 'd', dept, 'f', funcao, 's', situacao, 'e', escala, 'ad', admissao) order by dept, funcao, nome), '[]'::json)
                from ql_web_quadro_senior
               where loja = v_loja
                 and coalesce(dept, '') <> '' and dept !~* '^inativo'
                 and coalesce(funcao, '') <> ''
                 and coalesce(situacao, '') !~* 'demit'),
    'planos', (select coalesce(json_agg(json_build_object(
                  'setor', setor, 'dados', dados, 'atualizado_em', atualizado_em, 'usuario', usuario)), '[]'::json)
               from escala_planos where loja = v_loja)
  );
end $$;

create or replace function escala_web_salvar(p_token uuid, p_loja integer, p_setor text, p_dados jsonb,
                                             p_versao timestamptz default null, p_forcar boolean default false)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s escala_web_sessoes; v_loja int; v_atual escala_planos; v_agora timestamptz := now();
begin
  s := _escala_web_sessao(p_token);
  v_loja := _escala_web_loja(s, p_loja);
  if p_setor is null or p_setor !~ '^(D|F):.+' or length(p_setor) > 150 then raise exception 'SETOR_INVALIDO'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'DADOS_INVALIDOS'; end if;
  if length(p_dados::text) > 900000 then raise exception 'DADOS_GRANDES'; end if;

  select * into v_atual from escala_planos where loja = v_loja and setor = p_setor for update;
  if found then
    if not p_forcar and (p_versao is null or v_atual.atualizado_em > p_versao + interval '1 second') then
      raise exception 'CONFLITO:% em %', coalesce(v_atual.usuario, '?'),
        to_char(v_atual.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
    end if;
    insert into escala_planos_historico (loja, setor, dados, salvo_em, usuario, substituido_por)
    values (v_atual.loja, v_atual.setor, v_atual.dados, v_atual.atualizado_em, v_atual.usuario, s.usuario);
    update escala_planos set dados = p_dados, atualizado_em = v_agora, usuario = s.usuario
     where loja = v_loja and setor = p_setor;
  else
    insert into escala_planos (loja, setor, dados, atualizado_em, usuario)
    values (v_loja, p_setor, p_dados, v_agora, s.usuario);
  end if;

  delete from escala_planos_historico h
   where h.loja = v_loja and h.setor = p_setor
     and h.id not in (select id from escala_planos_historico
                       where loja = v_loja and setor = p_setor
                       order by substituido_em desc limit 30);

  return json_build_object('atualizado_em', v_agora, 'usuario', s.usuario);
end $$;

grant execute on function escala_web_lista_usuarios() to anon, authenticated;
grant execute on function escala_web_login(text, text) to anon, authenticated;
grant execute on function escala_web_sair(uuid) to anon, authenticated;
grant execute on function escala_web_dados(uuid, integer) to anon, authenticated;
grant execute on function escala_web_salvar(uuid, integer, text, jsonb, timestamptz, boolean) to anon, authenticated;
revoke execute on function _escala_web_sessao(uuid) from anon, authenticated, public;
revoke execute on function _escala_web_loja(escala_web_sessoes, integer) from anon, authenticated, public;
