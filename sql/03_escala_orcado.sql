-- ============================================================
-- Escala 5x2 · Molicenter — SQL 03: QL Orçado dentro da escala
-- Lê (só leitura) o orçado do QL (ql_orcado / ql_parametros_loja) e o
-- quadro real do Senior (ql_web_quadro_senior: Ativos + Férias, igual ao QL),
-- para a tela "QL Orçado x 5x2" calcular quantas pessoas faltam em 44h / 42h / 40h.
-- Usa o login próprio da escala: Analista e DP veem as Lojas 01 a 08 e a Loja 30 (CD); login de loja vê só a sua.
-- O CD não tem orçado: a tela usa o real dele (Ativos + Férias) como base.
-- Rodar DEPOIS do 02. Pode rodar mais de uma vez. Não altera nenhuma tabela.
-- ============================================================
create or replace function escala_web_orcado(p_token uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s escala_web_sessoes; v_lojas int[];
begin
  s := _escala_web_sessao(p_token);
  if s.loja_fixa is not null then v_lojas := array[s.loja_fixa];
  else v_lojas := array[1,2,3,4,5,6,7,8,30]; end if;

  return json_build_object(
    'lojas', to_json(v_lojas),
    'orcado', (select coalesce(json_agg(json_build_object(
                 'l', loja, 'd', departamento, 'f', funcao, 'q', quantidade, 'c', conta_no_total,
                 'od', ordem_dept, 'of', ordem_funcao) order by loja, ordem_dept, ordem_funcao), '[]'::json)
               from ql_orcado where loja = any(v_lojas)),
    'parametros', (select coalesce(json_agg(json_build_object(
                 'l', loja, 'venda', venda, 'media_6_meses', media_6_meses, 'venda_por_funcionario', venda_por_funcionario,
                 'proposta_quant', proposta_quant, 'abertura_seg_sab', abertura_seg_sab, 'abertura_domingo', abertura_domingo)), '[]'::json)
               from ql_parametros_loja where loja = any(v_lojas)),
    -- Real = Ativos + Férias do quadro do Senior (mesma regra do QL)
    'real', (select coalesce(json_agg(json_build_object('l', loja, 'd', dept, 'f', funcao, 'n', n)), '[]'::json)
               from (select loja, dept, funcao, count(*) n
                       from ql_web_quadro_senior
                      where loja = any(v_lojas)
                        and coalesce(dept, '') <> '' and dept !~* '^inativo'
                        and (upper(coalesce(situacao, '')) like '%ATIVO%' or situacao ~* 'f[ée]rias')
                      group by 1, 2, 3) x),
    -- Painel da mudança: situação do quadro, horários de hoje, movimento recente e andamento das escalas
    'situacao', (select coalesce(json_agg(json_build_object('l', loja, 's', grupo, 'n', n)), '[]'::json)
               from (select loja,
                            case when situacao ~* 'f[ée]rias' then 'ferias' when situacao ~* 'afast' then 'afastado'
                                 when situacao ~* 'demit' then 'demitido' when upper(situacao) like '%ATIVO%' then 'ativo' else 'outro' end grupo,
                            count(*) n
                       from ql_web_quadro_senior
                      where loja = any(v_lojas) and coalesce(dept, '') <> '' and dept !~* '^inativo'
                      group by 1, 2) x),
    'horarios', (select coalesce(json_agg(json_build_object('l', loja, 'd', dept, 'f', funcao, 'e', escala, 'n', n)), '[]'::json)
               from (select loja, dept, funcao, escala, count(*) n
                       from ql_web_quadro_senior
                      where loja = any(v_lojas) and coalesce(dept, '') <> '' and dept !~* '^inativo'
                        and (upper(coalesce(situacao, '')) like '%ATIVO%' or situacao ~* 'f[ée]rias')
                      group by 1, 2, 3, 4) x),
    'movimento', (select coalesce(json_agg(json_build_object('l', loja, 'adm90', adm90, 'dem90', dem90)), '[]'::json)
               from (select loja,
                            count(*) filter (where admissao >= current_date - 90 and situacao !~* 'demit') adm90,
                            count(*) filter (where situacao ~* 'demit' and data_afastamento >= current_date - 90) dem90
                       from ql_web_quadro_senior
                      where loja = any(v_lojas) and coalesce(dept, '') <> '' and dept !~* '^inativo'
                      group by 1) x),
    'planos', (select coalesce(json_agg(json_build_object('l', loja, 'setor', setor, 'em', atualizado_em, 'u', usuario,
                  'np', coalesce(jsonb_array_length(dados->'pessoas'), 0), 'cen', dados->>'cenario')), '[]'::json)
               from escala_planos where loja = any(v_lojas)),
    'senior_em', (select max(em) from ql_web_importacoes)
  );
end $$;

grant execute on function escala_web_orcado(uuid) to anon, authenticated;
