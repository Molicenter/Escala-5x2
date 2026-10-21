-- ============================================================
-- Escala 5x2 · Molicenter — SQL 03: QL Orçado dentro da escala
-- Lê (só leitura) o orçado do QL (ql_orcado / ql_parametros_loja) e o
-- quadro real do Senior (ql_web_quadro_senior: Ativos + Férias, igual ao QL),
-- para a tela "QL Orçado x 5x2" calcular quantas pessoas faltam em 44h / 42h / 40h.
-- Usa o login próprio da escala: Analista e DP veem as Lojas 01 a 08; login de loja vê só a sua.
-- Rodar DEPOIS do 02. Pode rodar mais de uma vez. Não altera nenhuma tabela.
-- ============================================================
create or replace function escala_web_orcado(p_token uuid)
returns json language plpgsql security definer set search_path to 'public' as $$
declare s escala_web_sessoes; v_lojas int[];
begin
  s := _escala_web_sessao(p_token);
  if s.loja_fixa is not null then v_lojas := array[s.loja_fixa];
  else v_lojas := array[1,2,3,4,5,6,7,8]; end if;

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
                      group by 1, 2, 3) x)
  );
end $$;

grant execute on function escala_web_orcado(uuid) to anon, authenticated;
