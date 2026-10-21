// ============================================================
// Escala 5x2 · Molicenter — QL Orçado x 5x2
// O organograma do QL Orçado (mesmos números do QL) e a conta de quantas
// pessoas a loja precisa para manter as MESMAS HORAS de trabalho de hoje
// (6x1, 44h por semana) quando a jornada passa para 44h / 42h / 40h.
//
//   pessoas necessárias = pessoas de hoje × 44 ÷ nova jornada
//
// Gestão (gerente, subgerente, encarregado) e aprendiz ficam iguais por padrão
// (sem controle de jornada / jornada própria). O arredondamento é por
// departamento de cada loja: a partir de meia pessoa conta uma contratação;
// o que sobra abaixo disso aparece como "horas a cobrir" por semana.
// Usa: est, sessao, rpc, M, esc, titulo, normalizar, nomeLoja, p2 (app.js).
// ============================================================
const HORAS_HOJE = 44;
// de-para do nome do departamento no quadro do Senior → orçado (o mesmo do QL)
const DE_PARA_DEPT_ORC = {
  "FRENTE DE CAIXA": "FRENTE CAIXA", "ENTREGA": ["FRENTE CAIXA", "ENTREGADOR"], "HORTIFRUTI": "HORTFRUTI",
  "LIMPEZA": ["ADMINISTRATIVO", "LIMPEZA"], "PREVENCAO": ["ADMINISTRATIVO", "PREVENCAO"],
  "CONTROLADORIA": ["ADMINISTRATIVO", "CONTROLADORIA"],
};
const CORES_DEPT_ORC = {
  "GERENCIA": ["#0B3D63", "#FFFFFF"], "FRENTE CAIXA": ["#14507F", "#FFFFFF"], "LOJA": ["#2E86C1", "#FFFFFF"], "ACOUGUE": ["#C0392B", "#FFFFFF"],
  "HORTFRUTI": ["#1E5631", "#FFFFFF"], "FRIOS": ["#34495E", "#FFFFFF"], "PADARIA": ["#E59866", "#22303C"], "CONFEITARIA": ["#E59866", "#22303C"],
  "ROTISSERIA": ["#E59866", "#22303C"], "DEPOSITO": ["#5D6D7E", "#FFFFFF"], "ADMINISTRATIVO": ["#566573", "#FFFFFF"],
};

const lerLocalOrc = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravarLocalOrc = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const ORC = {
  dados: null, erro: null, carregando: false,
  escopo: null,                                  // número da loja, "TL" (Lojas TT: 01 a 08) ou "TLCD" (Lojas c/ CD: 01 a 08 + 30)
  base: lerLocalOrc("escala_orc_base") || "orcado", // "orcado" ou "real"
  gestaoFixa: lerLocalOrc("escala_orc_gestao") !== "0",
  cenario: +lerLocalOrc("escala_orc_cenario") || 42,
};

// função do quadro x função do orçado: "PADEIRO(A)" = "Padeiro", "CONFEITEIRO(A)" = "Confeiteira"
function chaveFuncao(f) {
  return normalizar(String(f ?? "").replace(/\([^)]*\)/g, " ")).replace(/[^A-Z0-9 ]/g, "").replace(/EIRA\b/g, "EIRO").replace(/\s+/g, " ").trim();
}
// chave "DEPT|FUNÇÃO" do orçado para uma linha do quadro do Senior
function chaveOrcDoQuadro(dept, funcao) {
  const d = normalizar(dept);
  const v = DE_PARA_DEPT_ORC[d] ?? d;
  if (Array.isArray(v)) return normalizar(v[0]) + "|" + chaveFuncao(v[1]);
  return normalizar(v) + "|" + chaveFuncao(funcao);
}
const chaveOrc = (o) => normalizar(o.d) + "|" + chaveFuncao(o.f);
const ehAprendiz = (f) => /APRENDIZ/.test(normalizar(f));
const ehGestao = (f) => /^(GERENTE|SUBGERENTE|ENCARREGAD|SUPERVISOR)/.test(normalizar(f));
// totalizadores do seletor de loja
const TOTAIS_ORC = {
  TL: { nome: "Lojas TT", longo: "Lojas TT (01 a 08)", lojas: [1, 2, 3, 4, 5, 6, 7, 8] },
  TLCD: { nome: "Lojas c/ CD", longo: "Lojas c/ CD (01 a 08 + 30)", lojas: [1, 2, 3, 4, 5, 6, 7, 8, 30] },
};
const ehTotalOrc = (e) => e === "TL" || e === "TLCD";
const lerEscopoOrc = (v) => (ehTotalOrc(v) ? v : +v);
const temOrcado = (l) => (ORC.dados?.orcado || []).some((o) => o.l === l);
function lojasDoEscopo(e) {
  const disp = ORC.dados?.lojas || [];
  const temAlgo = (l) => temOrcado(l) || (ORC.dados?.real || []).some((r) => r.l === l);
  return ehTotalOrc(e) ? TOTAIS_ORC[e].lojas.filter((l) => disp.includes(l) && temAlgo(l)) : [+e];
}
// opções do seletor (topo) na visão do orçado: totalizadores + lojas
function opcoesEscopoOrc() {
  const disp = ORC.dados?.lojas || [];
  const tot = Object.entries(TOTAIS_ORC).filter(([, t]) => t.lojas.filter((l) => disp.includes(l)).length > 1
    && !(t.lojas.includes(30) && !disp.includes(30)) && t.lojas.some(temOrcado)).map(([k, t]) => [k, t.nome]);
  return [...tot, ...disp.map((l) => [l, nomeLoja(l)])];
}
const nomeEscopoOrc = (e) => (ehTotalOrc(e) ? TOTAIS_ORC[e].nome : nomeLoja(e));
const fmt1 = (x) => (Math.round(x * 10) / 10).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtMoedaOrc = (v) => (v == null || v === "" || isNaN(+v) ? "-" : (+v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const fmtIntOrc = (v) => (v == null || v === "" || isNaN(+v) ? "-" : Math.round(+v).toLocaleString("pt-BR"));
const sinal = (n) => (n > 0 ? "+" + n : String(n));

async function carregarOrcado(forcar) {
  if (ORC.carregando || (ORC.dados && !forcar)) return;
  ORC.carregando = true; ORC.erro = null;
  try {
    ORC.dados = await rpc("escala_web_orcado", { p_token: sessao.token });
  } catch (e) {
    ORC.erro = /Could not find the function|escala_web_orcado/.test(String(e.message)) || e.message === MENSAGENS["Could not find the function"]
      ? "O banco ainda não tem a função do QL Orçado na escala (falta rodar o sql/03_escala_orcado.sql)." : e.message;
  } finally {
    ORC.carregando = false;
    if (est.dados) render();
  }
}

// real (Ativos + Férias do Senior) por loja → Map("DEPT|FUNÇÃO" → n)
function realPorLoja(l) {
  const m = new Map();
  for (const r of ORC.dados?.real || []) {
    if (r.l !== l) continue;
    const k = chaveOrcDoQuadro(r.d, r.f);
    m.set(k, (m.get(k) || 0) + Number(r.n || 0));
  }
  return m;
}

// conta de uma loja num cenário: departamentos com as funções, já arredondados
function calcLoja(l, horas) {
  const real = realPorLoja(l);
  const semOrc = !temOrcado(l);
  const itens = semOrc ? itensDoReal(l) : (ORC.dados?.orcado || []).filter((o) => o.l === l)
    .sort((a, b) => (a.od ?? 0) - (b.od ?? 0) || (a.of ?? 0) - (b.of ?? 0));
  const usados = new Set();
  const depts = new Map();
  for (const o of itens) {
    const k = chaveOrc(o);
    usados.add(k);
    const fixa = ehAprendiz(o.f) || (ORC.gestaoFixa && (ehGestao(o.f) || normalizar(o.d) === "SOCIO"));
    const q = Number(o.q || 0), r = real.get(k) || 0;
    const base = ORC.base === "real" || semOrc ? r : q;
    const exato = fixa ? base : (base * HORAS_HOJE) / horas;
    if (!depts.has(o.d)) depts.set(o.d, { d: o.d, od: o.od ?? 0, funcs: [] });
    depts.get(o.d).funcs.push({ f: o.f, of: o.of ?? 0, q, r, base, exato, fixa, conta: o.c !== false });
  }
  const lista = [...depts.values()].map((dp) => fecharDept(dp, horas));
  // gente do quadro em função que não existe no orçado (ex.: nome diferente no Senior)
  let foraOrc = 0;
  for (const [k, n] of real) if (!usados.has(k)) foraOrc += n;
  return { depts: lista, foraOrc, semOrc };
}
// loja sem orçado (CD): monta as "funções" a partir do quadro real, na ordem dos departamentos das lojas
function itensDoReal(l) {
  const ordem = new Map();
  for (const o of ORC.dados?.orcado || []) if (!ordem.has(normalizar(o.d))) ordem.set(normalizar(o.d), o.od ?? 0);
  const m = new Map();
  for (const r of ORC.dados?.real || []) {
    if (r.l !== l) continue;
    const k = chaveOrcDoQuadro(r.d, r.f);
    if (m.has(k)) continue;
    const v = DE_PARA_DEPT_ORC[normalizar(r.d)];
    const d = Array.isArray(v) ? v[0] : v || r.d;
    m.set(k, { l, d, f: Array.isArray(v) ? titulo(v[1]) : titulo(r.f), q: 0, c: !ehAprendiz(r.f), od: ordem.get(normalizar(d)) ?? 50, of: 0 });
  }
  return [...m.values()].sort((a, b) => a.od - b.od || a.d.localeCompare(b.d) || a.f.localeCompare(b.f));
}
function fecharDept(dp, horas) {
  const conta = dp.funcs.filter((f) => f.conta);
  const fixos = conta.filter((f) => f.fixa).reduce((s, f) => s + f.base, 0);
  const varExato = conta.filter((f) => !f.fixa).reduce((s, f) => s + f.exato, 0);
  const varBase = conta.filter((f) => !f.fixa).reduce((s, f) => s + f.base, 0);
  const varPrecisa = Math.max(varBase, Math.round(varExato + 1e-9));
  const sobra = Math.max(0, varExato - varPrecisa);
  return {
    ...dp,
    q: dp.funcs.reduce((s, f) => s + (f.conta ? f.q : 0), 0),
    r: dp.funcs.reduce((s, f) => s + (f.conta ? f.r : 0), 0),
    base: fixos + varBase, exato: fixos + varExato, precisa: fixos + varPrecisa,
    horasCobrir: Math.round(sobra * horas),
  };
}

// junta várias lojas (Total Lojas): soma departamento a departamento
function calcEscopo(escopo, horas) {
  const lojas = lojasDoEscopo(escopo);
  const m = new Map();
  let foraOrc = 0, rOrc = 0;
  const semOrc = [];
  for (const l of lojas) {
    const c = calcLoja(l, horas);
    foraOrc += c.foraOrc;
    if (c.semOrc) semOrc.push(l); else rOrc += c.depts.reduce((s, x) => s + x.r, 0);
    for (const dp of c.depts) {
      const kd = normalizar(dp.d);
      const x = m.get(kd) || { d: dp.d, od: dp.od, funcs: new Map(), q: 0, r: 0, base: 0, exato: 0, precisa: 0, horasCobrir: 0 };
      for (const k of ["q", "r", "base", "exato", "precisa", "horasCobrir"]) x[k] += dp[k];
      x.od = Math.min(x.od, dp.od);
      for (const f of dp.funcs) {
        const kf = chaveFuncao(f.f);
        const y = x.funcs.get(kf) || { f: f.f, of: f.of, q: 0, r: 0, base: 0, exato: 0, fixa: f.fixa, conta: f.conta };
        y.q += f.q; y.r += f.r; y.base += f.base; y.exato += f.exato; y.of = Math.min(y.of, f.of);
        x.funcs.set(kf, y);
      }
      m.set(kd, x);
    }
  }
  const depts = [...m.values()].map((x) => ({ ...x, funcs: [...x.funcs.values()].sort((a, b) => a.of - b.of) })).sort((a, b) => a.od - b.od);
  const tot = (k) => depts.reduce((s, x) => s + x[k], 0);
  return { lojas, depts, foraOrc, semOrc, rOrc, q: tot("q"), r: tot("r"), base: tot("base"), exato: tot("exato"), precisa: tot("precisa"), horasCobrir: tot("horasCobrir") };
}

function paramsEscopo(escopo) {
  const ps = (ORC.dados?.parametros || []);
  if (!ehTotalOrc(escopo)) return ps.find((p) => p.l === +escopo) || {};
  const soma = (k) => (ps.length ? ps.reduce((s, p) => s + Number(p[k] || 0), 0) : null);
  return { venda: soma("venda"), media_6_meses: soma("media_6_meses"), proposta_quant: soma("proposta_quant"),
    venda_por_funcionario: ps.length ? ps.reduce((s, p) => s + Number(p.venda_por_funcionario || 0), 0) / ps.length : null,
    abertura_seg_sab: ps[0]?.abertura_seg_sab || "-", abertura_domingo: ps[0]?.abertura_domingo || "-" };
}

// ------------------------------------------------------------
// TELA: QL Orçado x 5x2
// ------------------------------------------------------------
function htmlOrcado() {
  if (ORC.erro) return `<section class="cartao"><p class="erro">${esc(ORC.erro)}</p><p><button class="btn btn-borda" data-acao="orc-recarregar">Tentar de novo</button></p></section>`;
  if (!ORC.dados) { carregarOrcado(); return `<section class="cartao"><p class="texto-fraco">Carregando o QL Orçado…</p></section>`; }
  const lojas = ORC.dados.lojas || [];
  if (!lojas.length) return `<section class="cartao vazio-orc"><h2>QL Orçado</h2><p class="sub">Nenhuma loja liberada para este login.</p></section>`;
  const validos = opcoesEscopoOrc().map(([v]) => String(v));
  if (ORC.escopo == null || !validos.includes(String(ORC.escopo))) ORC.escopo = lojas.includes(est.loja) ? est.loja : lojas[0];

  const H = ORC.cenario;
  const cen = Object.fromEntries([44, 42, 40].map((h) => [h, calcEscopo(ORC.escopo, h)]));
  const c = cen[H];
  const P = paramsEscopo(ORC.escopo);
  const nomeEsc = ehTotalOrc(ORC.escopo) ? TOTAIS_ORC[ORC.escopo].longo : nomeLoja(ORC.escopo);
  const rotBase = ORC.base === "real" ? "Real hoje" : "Orçado";

  const ctrl = `<div class="orc-ctrl nao-imprime">
    <div class="campo"><span>Calcular a partir de</span><div class="seg">${[["orcado", "QL Orçado"], ["real", "Real hoje (Ativos + Férias)"]].map(([v, r]) => `<button type="button" data-acao="orc-base" data-v="${v}" class="${ORC.base === v ? "ativo" : ""}">${r}</button>`).join("")}</div></div>
    <label class="orc-chk"><input type="checkbox" data-acao-change="orc-gestao"${ORC.gestaoFixa ? " checked" : ""}> Gerente, subgerente e encarregados ficam iguais <small>(cargo de gestão, sem controle de jornada)</small></label>
  </div>`;

  const cards = [44, 42, 40].map((h) => {
    const x = cen[h], add = x.precisa - x.base;
    return `<button type="button" class="orc-cen${h === H ? " ativo" : ""}" data-acao="orc-cenario" data-h="${h}">
      <span class="t">${h}h por semana <small>${M.fmtDur(M.CENARIOS[h].jornadaMin)} por dia no 5x2</small></span>
      <b class="num">${x.precisa}</b>
      <span class="add ${add > 0 ? "mais" : "zero"}">${add > 0 ? `contratar +${add}` : "mesmo quadro"}</span>
      <small>conta exata ${fmt1(x.exato)}${x.horasCobrir ? ` · ${x.horasCobrir}h/sem a cobrir` : ""}</small></button>`;
  }).join("");

  const kpis = [["Venda", fmtMoedaOrc(P.venda)], ["Média 6 Meses", fmtMoedaOrc(P.media_6_meses)], ["Venda R$ / Funcionário", fmtMoedaOrc(P.venda_por_funcionario)],
    ["Proposta Quant", fmtIntOrc(P.proposta_quant)], ["Seg a Sáb", P.abertura_seg_sab || "-"], ["Domingos", P.abertura_domingo || "-"]];

  const colunas = c.depts.map((dp) => {
    const [bg, fg] = CORES_DEPT_ORC[normalizar(dp.d)] || ["#0B3D63", "#FFFFFF"];
    const add = dp.precisa - dp.base;
    const funcs = dp.funcs.map((f) => {
      const extra = f.exato - f.base;
      const dica = f.fixa ? (ehAprendiz(f.f) ? "aprendiz: jornada própria, não muda" : "gestão: não muda") : extra > 0.05 ? `+${fmt1(extra)}` : "";
      return `<div class="org-func${f.conta ? "" : " nao-conta"}" title="${esc(`${titulo(f.f)} · Orçado ${f.q} · Real ${f.r}${f.fixa ? "" : ` · no ${H}h: ${fmt1(f.exato)}`}`)}">
        <div style="background:${bg};color:${fg}">${esc(f.f)}${f.conta ? "" : " *"}</div>
        <b class="num${f.base === 0 ? " zero" : ""}">${f.base}</b>
        <span class="orc-linha"><span title="Orçado">O ${f.q}</span><span title="Real (Ativos + Férias)" class="${f.r < f.q ? "abaixo" : f.r > f.q ? "acima" : ""}">R ${f.r}</span>${dica ? `<span class="${f.fixa ? "fixa" : "mais"}">${f.fixa ? "fixo" : esc(dica)}</span>` : ""}</span></div>`;
    }).join("");
    return `<div class="org-col"><div class="org-dept" style="background:${bg};color:${fg}">${esc(dp.d)}</div>${funcs}
      <div class="org-func org-tot"><div>Total · ${esc(rotBase.toLowerCase())}</div><b class="num">${dp.base}</b>
        <span class="orc-prec">no ${H}h: <b>${dp.precisa}</b>${add > 0 ? ` <em>+${add}</em>` : ""}${dp.horasCobrir ? `<small>${dp.horasCobrir}h/sem a cobrir</small>` : ""}</span></div></div>`;
  }).join("");

  const add = c.precisa - c.base;
  const dif = c.rOrc - c.q;
  const porLoja = ehTotalOrc(ORC.escopo) ? htmlOrcadoPorLoja(c.lojas) : "";
  const avisoCD = c.semOrc.length ? `<div class="orc-aviso">${c.semOrc.map(nomeLoja).join(", ")} não tem QL Orçado: ${c.semOrc.length > 1 ? "entram" : "entra"} pelo <b>real de hoje</b> (Ativos + Férias do Senior) e fica${c.semOrc.length > 1 ? "m" : ""} fora do "Real x Orçado".</div>` : "";

  return `<section class="cartao org">
    <div class="org-titulo">QL Orçado x 5x2 — ${esc(nomeEsc)}</div>
    ${ctrl}${avisoCD}
    <div class="org-kpis">${kpis.map(([a, b]) => `<div class="org-kpi"><span>${a}</span><b class="num">${esc(b)}</b></div>`).join("")}</div>
    <div class="orc-cens">${cards}</div>
    <p class="orc-explica">Hoje (6x1) todo mundo faz <b>44h</b>. Para a loja continuar com as mesmas horas de trabalho: <b>pessoas × 44 ÷ nova jornada</b>.
      Em 44h o 5x2 só reorganiza as folgas — não precisa contratar, mas cada dia tem menos gente e mais horas por pessoa (a aba <b>Cobertura</b> de cada setor mostra se o horário fecha).
      O arredondamento é por departamento de cada loja: a partir de meia pessoa conta uma contratação; o que fica abaixo disso aparece como horas por semana a cobrir (banco de horas, coringa ou rodízio).</p>
    <div class="org-depts">${colunas}</div>
    <div class="org-rodape">
      <div class="org-big"><span>Total (Orçado)</span><b class="num">${c.q}</b></div>
      <div class="org-big"><span>Real (Ativos + Férias)</span><b class="num">${c.r}</b></div>
      <div class="org-big ${dif >= 0 ? "bom" : "ruim"}"><span>Real x Orçado</span><b class="num">${sinal(dif)}</b></div>
      <div class="org-big destaque"><span>Precisa no ${H}h (a partir do ${esc(rotBase.toLowerCase())})</span><b class="num">${c.precisa} <small>${add > 0 ? `+${add}` : "="}</small></b></div>
    </div>
    <p class="nota">* Não entra no total (ex.: Aprendiz), como na planilha do QL. Em cada função: <b>O</b> = orçado · <b>R</b> = real hoje · <b>+0,5</b> = o que a função precisaria a mais no ${H}h.${c.foraOrc ? ` ${c.foraOrc} pessoa(s) do quadro estão em função sem par no orçado e não entram no Real desta tela.` : ""}</p>
  </section>${porLoja}`;
}

function htmlOrcadoPorLoja(lojas) {
  const linha = (rot, r, cls) => {
    const b = r[44].base;
    return `<tr class="${cls || ""}"><td>${rot}</td><td class="num">${r[44].semOrc.length === r[44].lojas.length ? "—" : r[44].q}</td><td class="num">${r[44].r}</td><td class="num b">${b}</td>
      ${[44, 42, 40].map((h) => { const a = r[h].precisa - b; return `<td class="num${h === ORC.cenario ? " sel" : ""}">${r[h].precisa}${a > 0 ? ` <em>+${a}</em>` : ""}</td>`; }).join("")}</tr>`;
  };
  const calc3 = (e) => Object.fromEntries([44, 42, 40].map((h) => [h, calcEscopo(e, h)]));
  const linhas = lojas.map((l) => linha(`<button type="button" class="link" data-acao="orc-loja" data-l="${l}">${esc(nomeLoja(l))}</button>${temOrcado(l) ? "" : ' <small class="texto-fraco">sem orçado · usa o real</small>'}`, calc3(l))).join("")
    + linha(`<b>${esc(TOTAIS_ORC[ORC.escopo].nome)}</b>`, calc3(ORC.escopo), "linha-total");
  return `<section class="cartao"><div class="cartao-cab"><div><h2>Por loja</h2><p class="sub">Quanto cada loja precisa em cada jornada, a partir do ${ORC.base === "real" ? "real de hoje" : "QL Orçado"}. Clique na loja para abrir o organograma dela.</p></div></div>
    <div class="rolagem-conf"><table class="conf orc-tab"><thead><tr><th>Loja</th><th>Orçado</th><th>Real</th><th>Base</th><th>44h</th><th>42h</th><th>40h</th></tr></thead><tbody>${linhas}</tbody></table></div></section>`;
}

// ------------------------------------------------------------
// Faixa do orçado dentro da escala de um setor (o "norte" do setor)
// ------------------------------------------------------------
function htmlFaixaOrcado(p) {
  if (!ORC.dados || !(ORC.dados.orcado || []).some((o) => o.l === est.loja)) return "";
  const c = lerChave(est.setor);
  if (!c) return "";
  const H = p.cenario;
  const calc = calcLoja(est.loja, H);
  const alvo = chaveOrcDoQuadro(c.dept, c.funcao || "");
  const [dAlvo, fAlvo] = alvo.split("|");
  const v = DE_PARA_DEPT_ORC[normalizar(c.dept)];
  const inteiroDept = !c.funcao && !Array.isArray(v);
  let q = 0, r = 0, base = 0, exato = 0, achou = false;
  for (const dp of calc.depts) {
    if (normalizar(dp.d) !== dAlvo) continue;
    for (const f of dp.funcs) {
      if (!inteiroDept && chaveFuncao(f.f) !== fAlvo) continue;
      if (!f.conta) continue;
      achou = true; q += f.q; r += f.r; base += f.base; exato += f.exato;
    }
  }
  if (!achou) return "";
  const precisa = Math.max(base, Math.round(exato + 1e-9));
  const naEscala = ativos(p).length;
  const falta = precisa - naEscala;
  return `<div class="faixa-orc nao-imprime">
    <span class="rot">QL Orçado</span>
    <span>Orçado <b>${q}</b></span><span>Real <b>${r}</b></span>
    <span>No ${H}h, para as mesmas horas: <b>${precisa}</b> <small>(${fmt1(exato)} a partir do ${ORC.base === "real" ? "real" : "orçado"})</small></span>
    <span class="${falta > 0 ? "ruim" : "bom"}">Na escala: <b>${naEscala}</b>${falta > 0 ? ` · faltam ${falta}` : ""}</span>
    <button type="button" class="link" data-acao="modo" data-v="orcado">ver QL Orçado x 5x2 →</button>
  </div>`;
}
