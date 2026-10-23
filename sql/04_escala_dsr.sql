-- ============================================================
-- Escala 5x2 · DSR1 / DSR2 do Banco QL.xlsx (out/2026)
-- As duas colunas novas da aba Banco ("DSR1", "DSR2" = os dois principais dias de folga
-- de cada pessoa) passam a ser guardadas no quadro do Senior que o QL já importa
-- (ql_web_quadro_senior) e chegam na escala como folga fixa.
-- É só acréscimo: colunas opcionais. Um QL que ainda não manda DSR continua funcionando
-- (os campos ficam vazios). "-" e "0" do Excel viram vazio.
-- ============================================================

alter table ql_web_quadro_senior add column if not exists dsr1 text;
alter table ql_web_quadro_senior add column if not exists dsr2 text;

create or replace function _ql_web_dsr(v text) returns text
language sql immutable set search_path to 'public' as $$
  select case when trim(coalesce(v, '')) in ('', '-', '0') then null else initcap(trim(v)) end
$$;

-- importação do QL: igual à anterior + DSR1/DSR2 (chaves d1/d2 no JSON)
CREATE OR REPLACE FUNCTION public.ql_web_importar(p_token uuid, p_linhas json, p_arquivo text, p_gravar boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s ql_web_sessoes; v_total int; v_resumo jsonb; v_ledger int := 0;
begin
  s := _ql_web_sessao(p_token);
  if s.perfil not in ('analista', 'rh') or s.loja_fixa is not null then raise exception 'SEM_PERMISSAO'; end if;
  if json_typeof(p_linhas) <> 'array' or json_array_length(p_linhas) = 0 then raise exception 'ARQUIVO_VAZIO'; end if;

  drop table if exists _novo;
  create temp table _novo on commit drop as
  select (row_number() over ())::int as ordem,
         coalesce(nullif(x->>'l', '')::int, 0) as loja,
         nullif(x->>'d', '') as dept, nullif(x->>'f', '') as funcao, nullif(x->>'s', '') as situacao,
         nullif(x->>'n', '') as nome, nullif(x->>'e', '') as escala,
         _ql_web_data(x->>'da') as data_afastamento, _ql_web_data(x->>'ad') as admissao,
         _ql_web_dsr(x->>'d1') as dsr1, _ql_web_dsr(x->>'d2') as dsr2
    from json_array_elements(p_linhas) x;
  select count(*) into v_total from _novo;

  v_resumo := jsonb_build_object(
    'linhas', v_total,
    'lojas', (select count(distinct loja) from _novo where loja > 0),
    'atual', (select count(*) from ql_web_quadro_senior),
    'novos', (select count(*) from _novo n where n.loja > 0 and not exists
                (select 1 from ql_web_quadro_senior a where a.loja = n.loja and a.nome = n.nome)),
    'sairam', (select count(*) from ql_web_quadro_senior a where a.loja > 0 and not exists
                (select 1 from _novo n where n.loja = a.loja and n.nome = a.nome)),
    'mudaram', (select count(*) from _novo n join ql_web_quadro_senior a on a.loja = n.loja and a.nome = n.nome
                 where coalesce(a.situacao, '') <> coalesce(n.situacao, '')),
    'lancamentos', (select count(*) from ql_banco),
    'por_situacao', (select coalesce(jsonb_object_agg(k, c), '{}') from
                      (select coalesce(situacao, '(vazio)') k, count(*) c from _novo group by 1) y),
    'exemplos_mudaram', (select coalesce(jsonb_agg(z), '[]') from (
                 select n.loja, n.nome, a.situacao de, n.situacao para
                   from _novo n join ql_web_quadro_senior a on a.loja = n.loja and a.nome = n.nome
                  where coalesce(a.situacao, '') <> coalesce(n.situacao, '')
                  order by n.loja, n.nome limit 30) z),
    'com_dsr', (select count(*) from _novo where dsr1 is not null or dsr2 is not null)
  );

  if p_gravar then
    delete from ql_web_quadro_senior where true;   -- "where true": o Supabase bloqueia DELETE sem WHERE vindo do app
    insert into ql_web_quadro_senior (ordem, loja, dept, funcao, situacao, nome, escala, data_afastamento, admissao, dsr1, dsr2)
    select ordem, loja, dept, funcao, situacao, nome, escala, data_afastamento, admissao, dsr1, dsr2 from _novo;

    -- ledger de admissões (mesma regra do capturar_admissoes_no_ledger): só quem ainda não está lá
    with cand as (
      select distinct on (_ql_web_norm_nome(nome), admissao, loja)
             loja, trim(nome) nome, _ql_web_norm_nome(nome) nn, admissao, dept, funcao, situacao
        from _novo where loja > 0 and admissao is not null and _ql_web_norm_nome(nome) <> ''
    ), ins as (
      insert into ql_admissoes_registradas ("Loja", "Nome", nome_norm, "Data Admissão", data_admissao_date, "Dept", "Funcao", "Situacao")
      select c.loja, c.nome, c.nn, to_char(c.admissao, 'DD/MM/YYYY'), c.admissao, coalesce(c.dept, 'nan'), coalesce(c.funcao, 'nan'), coalesce(c.situacao, 'nan')
        from cand c
       where not exists (select 1 from ql_admissoes_registradas r
                          where r.nome_norm = c.nn and r.data_admissao_date = c.admissao and r."Loja" = c.loja)
      returning 1
    ) select count(*) into v_ledger from ins;

    v_resumo := v_resumo || jsonb_build_object('ledger_novos', v_ledger);
    insert into ql_web_importacoes (email, arquivo, linhas, resumo) values (s.email, left(p_arquivo, 200), v_total, v_resumo);
  end if;
  return v_resumo::json;
end $function$;

-- dados da escala: igual à anterior + d1/d2 (DSR1/DSR2) de cada pessoa
CREATE OR REPLACE FUNCTION public.escala_web_dados(p_token uuid, p_loja integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s escala_web_sessoes; v_loja int;
begin
  s := _escala_web_sessao(p_token);
  v_loja := _escala_web_loja(s, p_loja);
  return json_build_object(
    'loja', v_loja,
    'lojas', case when s.loja_fixa is not null then json_build_array(s.loja_fixa) else '[1,2,3,4,5,6,7,8,30]'::json end,
    'hoje', (now() at time zone 'America/Sao_Paulo')::date,
    'pessoas', (select coalesce(json_agg(json_build_object(
                  'n', nome, 'd', dept, 'f', funcao, 's', situacao, 'e', escala, 'ad', admissao,
                  'd1', dsr1, 'd2', dsr2) order by dept, funcao, nome), '[]'::json)
                from ql_web_quadro_senior
               where loja = v_loja
                 and coalesce(dept, '') <> '' and dept !~* '^inativo'
                 and coalesce(funcao, '') <> ''
                 and coalesce(situacao, '') !~* 'demit'),
    'planos', (select coalesce(json_agg(json_build_object(
                  'setor', setor, 'dados', dados, 'atualizado_em', atualizado_em, 'usuario', usuario)), '[]'::json)
               from escala_planos where loja = v_loja)
  );
end $function$;
