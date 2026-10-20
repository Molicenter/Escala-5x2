-- ============================================================
-- Escala 5x2 · Molicenter — SQL 01
-- Tabelas e funções do app web (GitHub Pages).
-- Usa o MESMO login do Quadro de Lotação (ql_web_login / ql_web_sessoes)
-- e lê os colaboradores de TODOS os departamentos direto do quadro do Senior
-- (ql_web_quadro_senior), que já é atualizado pela tela "Atualizar banco (Excel)" do QL
-- (o mesmo Banco QL.xlsx — a coluna "Descrição (Escala)" é o horário atual de cada pessoa).
--
-- Pode rodar mais de uma vez sem problema (create if not exists / create or replace).
-- ============================================================

-- 1) Planos de escala: 1 linha por loja + setor
--    setor = 'D:<DEPARTAMENTO>' (departamento inteiro) ou 'F:<DEPARTAMENTO>|<FUNÇÃO>' (só uma função)
create table if not exists escala_planos (
  loja          integer     not null,
  setor         text        not null,
  dados         jsonb       not null,
  atualizado_em timestamptz not null default now(),
  usuario       text,
  primary key (loja, setor)
);

-- 2) Histórico: guarda a versão anterior a cada gravação (para desfazer se precisar)
create table if not exists escala_planos_historico (
  id            bigserial primary key,
  loja          integer     not null,
  setor         text        not null,
  dados         jsonb       not null,
  salvo_em      timestamptz not null,
  usuario       text,
  substituido_em timestamptz not null default now(),
  substituido_por text
);
create index if not exists escala_planos_historico_idx on escala_planos_historico (loja, setor, substituido_em desc);

-- As tabelas só são acessadas pelas funções abaixo (security definer).
alter table escala_planos enable row level security;
alter table escala_planos_historico enable row level security;
revoke all on escala_planos, escala_planos_historico from anon, authenticated;

-- ------------------------------------------------------------
-- escala_web_dados: colaboradores da loja (todos os departamentos) + planos salvos
-- ------------------------------------------------------------
create or replace function escala_web_dados(p_token uuid, p_loja integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare s ql_web_sessoes; v_lojas int[]; v_permitidas int[];
begin
  s := _ql_web_sessao(p_token);
  v_lojas := _ql_web_lojas(s, coalesce(p_loja, 0)::text);
  if s.loja_fixa is not null then v_permitidas := array[s.loja_fixa];
  else v_permitidas := array[1,2,3,4,5,6,7,8]; end if;
  if not (v_lojas[1] = any(v_permitidas)) then raise exception 'SEM_PERMISSAO'; end if;

  return json_build_object(
    'loja', v_lojas[1],
    'lojas', v_permitidas,
    'hoje', _ql_web_hoje(),
    'pessoas', (select coalesce(json_agg(json_build_object(
                  'n', nome, 'd', dept, 'f', funcao, 's', situacao, 'e', escala, 'ad', admissao) order by dept, funcao, nome), '[]'::json)
                from ql_web_quadro_senior
               where loja = v_lojas[1]
                 and coalesce(dept, '') <> '' and dept !~* '^inativo'
                 and coalesce(funcao, '') <> ''
                 and coalesce(situacao, '') !~* 'demit'),
    'planos', (select coalesce(json_agg(json_build_object(
                  'setor', setor, 'dados', dados, 'atualizado_em', atualizado_em, 'usuario', usuario)), '[]'::json)
               from escala_planos where loja = v_lojas[1])
  );
end $$;

-- ------------------------------------------------------------
-- escala_web_salvar: grava o plano de um setor (com checagem de conflito)
--   p_versao = atualizado_em que o app tinha quando abriu; se alguém salvou
--   depois disso, devolve CONFLITO (o app pergunta se quer sobrescrever → p_forcar).
-- ------------------------------------------------------------
create or replace function escala_web_salvar(p_token uuid, p_loja integer, p_setor text, p_dados jsonb,
                                             p_versao timestamptz default null, p_forcar boolean default false)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare s ql_web_sessoes; v_lojas int[]; v_atual escala_planos; v_agora timestamptz := now();
begin
  s := _ql_web_sessao(p_token);
  v_lojas := _ql_web_lojas(s, coalesce(p_loja, 0)::text);
  if s.loja_fixa is null and not (v_lojas[1] between 1 and 8) then raise exception 'SEM_PERMISSAO'; end if;
  if p_setor is null or p_setor !~ '^(D|F):.+' or length(p_setor) > 150 then raise exception 'SETOR_INVALIDO'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'DADOS_INVALIDOS'; end if;
  if length(p_dados::text) > 900000 then raise exception 'DADOS_GRANDES'; end if;

  select * into v_atual from escala_planos where loja = v_lojas[1] and setor = p_setor for update;
  if found then
    if not p_forcar and (p_versao is null or v_atual.atualizado_em > p_versao + interval '1 second') then
      raise exception 'CONFLITO:% em %', coalesce(v_atual.usuario, '?'),
        to_char(v_atual.atualizado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI');
    end if;
    insert into escala_planos_historico (loja, setor, dados, salvo_em, usuario, substituido_por)
    values (v_atual.loja, v_atual.setor, v_atual.dados, v_atual.atualizado_em, v_atual.usuario, s.email);
    update escala_planos set dados = p_dados, atualizado_em = v_agora, usuario = s.email
     where loja = v_lojas[1] and setor = p_setor;
  else
    insert into escala_planos (loja, setor, dados, atualizado_em, usuario)
    values (v_lojas[1], p_setor, p_dados, v_agora, s.email);
  end if;

  -- histórico enxuto: fica só com as 30 últimas versões de cada loja/setor
  delete from escala_planos_historico h
   where h.loja = v_lojas[1] and h.setor = p_setor
     and h.id not in (select id from escala_planos_historico
                       where loja = v_lojas[1] and setor = p_setor
                       order by substituido_em desc limit 30);

  return json_build_object('atualizado_em', v_agora, 'usuario', s.email);
end $$;

grant execute on function escala_web_dados(uuid, integer) to anon, authenticated;
grant execute on function escala_web_salvar(uuid, integer, text, jsonb, timestamptz, boolean) to anon, authenticated;
