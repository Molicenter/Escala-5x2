// ============================================================
// Escala 5x2 · Molicenter — Painel da mudança
// Uma página para a reunião: quantas pessoas temos hoje, quantas cada jornada
// pede, onde está a necessidade, como é o horário de hoje e como está o
// andamento das escalas. Usa os dados do escala_web_orcado (orcado.js) e o
// mesmo seletor do topo (loja, Lojas TT ou Lojas c/ CD).
// ============================================================
const PN = {
  custo: +(lerLocalOrc("escala_pn_custo") || 0) || null,   // custo médio mensal por funcionário (R$), digitado pelo usuário
};

const fmtInt = (n) => Math.round(+n || 0).toLocaleString("pt-BR");
const fmtPct = (x) => `${Math.round(x * 100)}%`;
const fmtReais = (v) => (+v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const somaPor = (rows, lojas, f) => rows.filter((r) => lojas.includes(r.l)).reduce((s, r) => s + f(r), 0);

// horário do Senior → grupo do dia (abertura / intermediário / fechamento)
function grupoHorario(e) {
  const t = String(e || "");
  if (/ART\.?\s*62/i.test(t)) return { g: "art62" };
  if (/CURSO/i.test(t)) return { g: "curso" };
  const x = M.lerEscalaSenior(t);
  if (!x) return { g: "sem" };
  const ent = M.hm(x.entrada), sai = M.hm(x.saida);
  return { g: ent <= 8 * 60 + 30 ? "abre" : sai >= 20 * 60 + 30 ? "fecha" : "meio", ent, sai, jornada: x.jornadaMin, intervalo: x.almocoMin };
}
const GRUPOS_H = [["abre", "Abertura", "entra até 8h30"], ["meio", "Intermediário", "entre um e outro"], ["fecha", "Fechamento", "sai 20h30 ou depois"], ["outros", "Sem horário fixo", "ART 62, aprendiz/curso ou sem horário"]];

function perfilHorarios(lojas) {
  const rows = (ORC.dados?.horarios || []).filter((r) => lojas.includes(r.l));
  const porLoja = new Map();
  let jornSoma = 0, jornN = 0;
  const fechaMap = new Map();
  for (const r of rows) {
    const h = grupoHorario(r.e);
    const g = ["art62", "curso", "sem"].includes(h.g) ? "outros" : h.g;
    const x = porLoja.get(r.l) || { abre: 0, meio: 0, fecha: 0, outros: 0, total: 0 };
    x[g] += r.n; x.total += r.n; porLoja.set(r.l, x);
    if (h.jornada) { jornSoma += h.jornada * r.n; jornN += r.n; }
    if (g === "fecha") { const k = r.e.trim(); const y = fechaMap.get(k) || { e: k, n: 0, h }; y.n += r.n; fechaMap.set(k, y); }
  }
  const tot = { abre: 0, meio: 0, fecha: 0, outros: 0, total: 0 };
  for (const x of porLoja.values()) for (const k in tot) tot[k] += x[k];
  const fechaTop = [...fechaMap.values()].sort((a, b) => b.n - a.n)[0] || null;
  return { porLoja, tot, jornadaMedia: jornN ? jornSoma / jornN : 0, fechaTop };
}

function htmlPainel() {
  if (ORC.erro) return `<section class="cartao"><p class="erro">${esc(ORC.erro)}</p><p><button class="btn btn-borda" data-acao="orc-recarregar">Tentar de novo</button></p></section>`;
  if (!ORC.dados) { carregarOrcado(); return `<section class="cartao"><p class="texto-fraco">Carregando o painel…</p></section>`; }
  const disp = ORC.dados.lojas || [];
  if (!disp.length) return `<section class="cartao"><p class="texto-fraco">Nenhuma loja liberada para este login.</p></section>`;
  const validos = opcoesEscopoOrc().map(([v]) => String(v));
  if (ORC.escopo == null || !validos.includes(String(ORC.escopo))) ORC.escopo = validos.includes("TL") ? "TL" : (disp.includes(est.loja) ? est.loja : disp[0]);

  const E = ORC.escopo, H = ORC.cenario;
  const lojas = lojasDoEscopo(E);
  const cen = Object.fromEntries([44, 42, 40].map((h) => [h, calcEscopo(E, h)]));
  const c44 = cen[44];
  const realHoje = c44.r;                                  // Ativos + Férias (conta no total)
  const orcado = c44.q;                                    // só lojas com orçado
  const vagasHoje = c44.q - c44.rOrc;                      // orçado - real nas lojas com orçado
  const sit = ORC.dados.situacao || [];
  const nSit = (s) => somaPor(sit, lojas, (r) => (r.s === s ? r.n : 0));
  const ferias = nSit("ferias"), afast = nSit("afastado");
  const mov = ORC.dados.movimento || [];
  const adm90 = somaPor(mov, lojas, (r) => r.adm90), dem90 = somaPor(mov, lojas, (r) => r.dem90);
  const perfil = perfilHorarios(lojas);
  const nomeEsc = ehTotalOrc(E) ? TOTAIS_ORC[E].longo : nomeLoja(E);
  const rotBase = ORC.base === "real" ? "quadro real de hoje" : "QL Orçado";
  const senior = ORC.dados.senior_em ? new Date(ORC.dados.senior_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às") : null;
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });

  // ---------- cabeçalho ----------
  let h = `<section class="pn-capa">
    <div><span class="pn-sobre">Painel da mudança · Jornada 5x2</span><h2>${esc(nomeEsc)}</h2>
      <p>${hoje}${senior ? ` · quadro do Senior de ${senior}` : ""} · cálculo a partir do ${esc(rotBase)}</p></div>
    <div class="pn-ctrl nao-imprime">
      <div class="seg">${[["orcado", "QL Orçado"], ["real", "Real hoje"]].map(([v, r]) => `<button type="button" data-acao="orc-base" data-v="${v}" class="${ORC.base === v ? "ativo" : ""}">${r}</button>`).join("")}</div>
      <label class="orc-chk"><input type="checkbox" data-acao-change="orc-gestao"${ORC.gestaoFixa ? " checked" : ""}> Gestão fica igual</label>
      <button class="btn btn-peq btn-vidro" data-acao="imprimir">Imprimir / PDF</button>
    </div></section>`;

  // ---------- números principais ----------
  const kpi = (rot, val, det, cls = "") => `<div class="pn-kpi ${cls}"><span>${rot}</span><b class="num">${val}</b><small>${det}</small></div>`;
  const cenKpi = (hh) => {
    const x = cen[hh], add = x.precisa - x.base, vsHoje = x.precisa - realHoje;
    return `<button type="button" class="pn-kpi pn-cen${hh === H ? " ativo" : ""}" data-acao="orc-cenario" data-h="${hh}">
      <span>${hh}h no 5x2 <em>${M.fmtDur(M.CENARIOS[hh].jornadaMin)}/dia</em></span><b class="num">${fmtInt(x.precisa)}</b>
      <small>${add > 0 ? `<i class="mais">+${add}</i> sobre o ${ORC.base === "real" ? "real" : "orçado"}` : `<i class="zero">sem contratar</i>`}${ORC.base !== "real" ? ` · <i class="${vsHoje > 0 ? "mais" : "zero"}">${vsHoje > 0 ? "+" : ""}${vsHoje}</i> sobre o quadro de hoje` : ""}</small></button>`;
  };
  h += `<section class="pn-kpis">
    ${kpi("Quadro hoje", fmtInt(realHoje), `Ativos + Férias, sem aprendiz${ferias ? ` · ${ferias} de férias` : ""}`)}
    ${kpi("QL Orçado", c44.semOrc.length === c44.lojas.length ? "—" : fmtInt(orcado), c44.semOrc.length ? `sem orçado: ${c44.semOrc.map(nomeLoja).join(", ")}` : "estrutura aprovada")}
    ${kpi("Vagas em aberto hoje", vagasHoje > 0 ? fmtInt(vagasHoje) : "0", vagasHoje > 0 ? "orçado − quadro real" : vagasHoje < 0 ? `${-vagasHoje} acima do orçado` : "quadro completo", vagasHoje > 0 ? "alerta" : "")}
    ${cenKpi(44)}${cenKpi(42)}${cenKpi(40)}
  </section>`;

  // ---------- o que vamos encarar ----------
  const x = cen[H];
  const addH = x.precisa - x.base, vsHojeH = x.precisa - realHoje;
  const deps = x.depts.map((d) => ({ d: d.d, add: d.precisa - d.base })).filter((d) => d.add > 0).sort((a, b) => b.add - a.add);
  const totAdd = deps.reduce((s, d) => s + d.add, 0);
  const top = deps.slice(0, 3);
  const pontos = [];
  if (ORC.base !== "real" && vagasHoje > 0) pontos.push(`<b>Já estamos ${vagasHoje} pessoa(s) abaixo do orçado.</b> Mudando para ${H}h, além das ${addH} contratações da jornada, essas vagas continuam abertas: são <b>${vsHojeH} pessoas a mais que o quadro de hoje</b>.`);
  else pontos.push(`Mudando para <b>${H}h</b>, para manter as mesmas horas de trabalho de hoje a ${ehTotalOrc(E) ? "rede" : "loja"} precisa de <b>${addH > 0 ? `+${addH} pessoa(s)` : "nenhuma contratação"}</b>.`);
  if (H === 44) pontos.push(`Em 44h o 5x2 <b>não pede contratação</b>, mas cada pessoa trabalha 1 dia a menos e 1h28 a mais por dia: em cada dia da semana a loja tem <b>~17% menos gente no posto</b>. O que precisa ser conferido é a cobertura de cada horário (aba de cada setor).`);
  if (top.length && totAdd) pontos.push(`As contratações se concentram em <b>${top.map((d) => `${esc(titulo(d.d))} (+${d.add})`).join(", ")}</b> — ${fmtPct(top.reduce((s, d) => s + d.add, 0) / totAdd)} do total.`);
  if (perfil.jornadaMedia) pontos.push(`Hoje a jornada média é de <b>${M.fmtDur(Math.round(perfil.jornadaMedia))} por dia</b> em 6 dias. No 5x2 passa para <b>${M.fmtDur(M.CENARIOS[H].jornadaMin)} por dia</b> em 5 dias: entradas mais cedo ou saídas mais tarde em todos os turnos.`);
  if (perfil.fechaTop) {
    const f = perfil.fechaTop, novaEnt = f.h.sai - M.CENARIOS[H].jornadaMin - f.h.intervalo;
    pontos.push(`Fechamento mais comum hoje: <span class="mono">${esc(f.e)}</span> (${f.n} pessoas). No ${H}h, com o mesmo intervalo e a mesma saída, a entrada vai para <b>${M.fmtHM(novaEnt)}</b> (hoje ${M.fmtHM(f.h.ent)}).`);
  }
  if (afast || ferias) pontos.push(`<b>${ferias} de férias e ${afast} afastado(s)</b> hoje. Afastados não contam no quadro real; férias contam, mas na escala ficam como ausência (X) — a cobertura precisa prever essa folga.`);
  if (adm90) {
    const ritmo = adm90 / 3;
    const precisa = Math.max(vsHojeH, addH);
    pontos.push(`Nos últimos 90 dias entraram <b>${adm90}</b> e saíram <b>${dem90}</b> pessoas (≈ ${Math.round(ritmo)} admissões/mês).${precisa > 0 ? ` No mesmo ritmo, contratar ${precisa} levaria <b>~${Math.max(1, Math.round(precisa / ritmo * 10) / 10).toLocaleString("pt-BR")} mês(es)</b> — sem contar a reposição de quem sai.` : ""}`);
  }
  const custoHoje = PN.custo && ORC.base !== "real" && vsHojeH > 0 ? vsHojeH * PN.custo : 0;

  h += `<div class="pn-duas">
    <section class="cartao pn-pontos"><h3 class="pn-tit">O que vamos encarar <small>no cenário de ${H}h</small></h3><ol>${pontos.map((p) => `<li>${p}</li>`).join("")}</ol></section>
    <section class="cartao pn-custo"><h3 class="pn-tit">Custo estimado <small>da contratação</small></h3>
      <label class="campo nao-imprime"><span>Custo médio mensal por funcionário (salário + encargos + benefícios)</span>
        <input type="number" min="0" step="50" class="ent" placeholder="ex.: 3500" value="${PN.custo || ""}" data-acao-change="pn-custo"></label>
      ${PN.custo ? `<div class="pn-custo-linhas">${[42, 40].map((hh) => { const a = cen[hh].precisa - cen[hh].base; return `<div class="${hh === H ? "sel" : ""}"><span>${hh}h · +${a} pessoa(s)</span><b>${fmtReais(a * PN.custo)}<small>/mês</small></b><em>${fmtReais(a * PN.custo * 13.33)}/ano</em></div>`; }).join("")}
        ${custoHoje ? `<p class="nota">No ${H}h, contando as vagas que já estão abertas hoje (+${vsHojeH} sobre o quadro de hoje): <b>${fmtReais(custoHoje)}/mês</b>.</p>` : ""}
        <p class="nota">Valor por funcionário informado aqui (${fmtReais(PN.custo)}), fica só neste navegador. Ano = 13,33 meses (13º e 1/3 de férias).</p></div>`
        : `<p class="texto-fraco">Digite o custo médio por funcionário para ver o custo mensal e anual de cada cenário.</p>`}
    </section></div>`;

  // ---------- loja a loja ----------
  if (ehTotalOrc(E)) h += `<section class="cartao">${htmlOrcadoPorLoja(lojas)}</section>`;

  // ---------- por departamento ----------
  const dep42 = cen[42].depts, dep40 = cen[40].depts;
  const maxAdd = Math.max(1, ...dep40.map((d) => d.precisa - d.base));
  const linhasDep = dep42.map((d, i) => {
    const d40 = dep40.find((y) => normalizar(y.d) === normalizar(d.d)) || d;
    const a42 = d.precisa - d.base, a40 = d40.precisa - d40.base;
    const [bg] = CORES_DEPT_ORC[normalizar(d.d)] || ["#0B3D63"];
    return `<tr><td class="loja"><i class="pn-cor" style="background:${bg}"></i>${esc(titulo(d.d))}</td><td class="num">${d.q || "—"}</td><td class="num">${d.r}</td><td class="num hoje">${d.base}</td>
      <td class="num cen${H === 42 ? " sel" : ""}"><b>${d.precisa}</b>${a42 > 0 ? `<em>+${a42}</em>` : "<i>=</i>"}</td>
      <td class="num cen${H === 40 ? " sel" : ""}"><b>${d40.precisa}</b>${a40 > 0 ? `<em>+${a40}</em>` : "<i>=</i>"}</td>
      <td class="pn-barra"><span style="width:${(a40 / maxAdd) * 100}%"></span><span class="b42" style="width:${(a42 / maxAdd) * 100}%"></span></td></tr>`;
  }).join("");
  h += `<section class="cartao"><div class="orc-porloja">
    <div class="orc-porloja-cab"><h3>Por departamento: onde está a necessidade</h3><small>${esc(nomeEsc)} · a partir do ${esc(rotBase)}</small></div>
    <div class="rolagem-conf"><table class="orc-reuniao"><thead><tr><th class="loja">Departamento</th><th>Orçado</th><th>Real hoje</th><th class="hoje">Hoje</th><th class="cen">42h</th><th class="cen">40h</th><th class="loja">Contratações <small><i class="pn-leg b42"></i>42h <i class="pn-leg"></i>40h</small></th></tr></thead>
    <tbody>${linhasDep}<tr class="linha-total"><td class="loja"><b>Total</b></td><td class="num">${c44.semOrc.length === c44.lojas.length ? "—" : cen[42].q}</td><td class="num">${cen[42].r}</td><td class="num hoje">${cen[42].base}</td>
      <td class="num cen${H === 42 ? " sel" : ""}"><b>${cen[42].precisa}</b><em>+${cen[42].precisa - cen[42].base}</em></td><td class="num cen${H === 40 ? " sel" : ""}"><b>${cen[40].precisa}</b><em>+${cen[40].precisa - cen[40].base}</em></td><td></td></tr></tbody></table></div></div></section>`;

  // ---------- horário de hoje + situação do quadro ----------
  const lojasH = [...perfil.porLoja.keys()].sort((a, b) => a - b);
  const pct = (n, t) => (t ? (n / t) * 100 : 0);
  const barraH = (x) => `<div class="pn-empilhada">${GRUPOS_H.map(([k]) => `<span class="g-${k}" style="width:${pct(x[k], x.total)}%" title="${x[k]}"></span>`).join("")}</div>`;
  const linhasH = (ehTotalOrc(E) ? lojasH : []).map((l) => { const x = perfil.porLoja.get(l); return `<tr><td class="loja">${esc(nomeLoja(l))}</td>${GRUPOS_H.map(([k]) => `<td class="num">${x[k]}</td>`).join("")}<td class="num hoje">${x.total}</td><td class="pn-barra-h">${barraH(x)}</td></tr>`; }).join("");
  const t = perfil.tot;
  h += `<div class="pn-duas">
    <section class="cartao"><div class="orc-porloja"><div class="orc-porloja-cab"><h3>Como as pessoas trabalham hoje</h3><small>horário do Senior · Ativos + Férias</small></div>
      <div class="rolagem-conf"><table class="orc-reuniao pn-tab-h"><thead><tr><th class="loja">${ehTotalOrc(E) ? "Loja" : ""}</th>${GRUPOS_H.map(([, r, s]) => `<th>${r}<small>${s}</small></th>`).join("")}<th class="hoje">Total</th><th class="loja"></th></tr></thead>
      <tbody>${linhasH}<tr class="linha-total"><td class="loja"><b>${esc(ehTotalOrc(E) ? TOTAIS_ORC[E].nome : nomeLoja(E))}</b></td>${GRUPOS_H.map(([k]) => `<td class="num">${t[k]}<small class="pn-pct">${Math.round(pct(t[k], t.total))}%</small></td>`).join("")}<td class="num hoje">${t.total}</td><td class="pn-barra-h">${barraH(t)}</td></tr></tbody></table></div>
      <div class="pn-legenda">${GRUPOS_H.map(([k, r]) => `<span><i class="g-${k}"></i>${r}</span>`).join("")}</div></div></section>
    ${htmlSituacao(lojas, E)}
  </div>`;

  h += htmlAndamento(lojas, E);
  h += `<p class="pn-rodape">Conta: pessoas que mudam de jornada × 44 ÷ nova jornada, arredondada para cima por loja. Gestão (gerente, subgerente, encarregado, supervisor, sócio) ${ORC.gestaoFixa ? "e aprendiz ficam iguais" : "muda junto; aprendiz fica igual"}. Hoje = 6x1 · 44h. Fonte: QL Orçado e quadro do Senior (Banco QL.xlsx importado no QL).</p>`;
  return `<div class="painel-mudanca">${h}</div>`;
}

function htmlSituacao(lojas, E) {
  const sit = ORC.dados.situacao || [], mov = ORC.dados.movimento || [];
  const linhaDe = (ls) => {
    const n = (s) => somaPor(sit, ls, (r) => (r.s === s ? r.n : 0));
    return { at: n("ativo"), fe: n("ferias"), af: n("afastado"), adm: somaPor(mov, ls, (r) => r.adm90), dem: somaPor(mov, ls, (r) => r.dem90) };
  };
  const tr = (rot, x, cls = "") => `<tr class="${cls}"><td class="loja">${rot}</td><td class="num">${x.at}</td><td class="num">${x.fe}</td><td class="num${x.af ? " ruim" : ""}">${x.af}</td><td class="num">${x.adm}</td><td class="num">${x.dem}</td><td class="num hoje">${x.adm - x.dem > 0 ? "+" : ""}${x.adm - x.dem}</td></tr>`;
  const linhas = ehTotalOrc(E) ? lojas.map((l) => tr(esc(nomeLoja(l)), linhaDe([l]))).join("") : "";
  return `<section class="cartao"><div class="orc-porloja"><div class="orc-porloja-cab"><h3>Situação do quadro</h3><small>hoje · movimento dos últimos 90 dias no arquivo do Senior</small></div>
    <div class="rolagem-conf"><table class="orc-reuniao"><thead><tr><th class="loja">${ehTotalOrc(E) ? "Loja" : ""}</th><th>Ativos</th><th>Férias</th><th>Afastados</th><th>Admitidos<small>90 dias</small></th><th>Desligados<small>90 dias</small></th><th class="hoje">Saldo</th></tr></thead>
    <tbody>${linhas}${tr(`<b>${esc(ehTotalOrc(E) ? TOTAIS_ORC[E].nome : nomeLoja(E))}</b>`, linhaDe(lojas), "linha-total")}</tbody></table></div></div></section>`;
}

function htmlAndamento(lojas, E) {
  const planos = (ORC.dados.planos || []).filter((p) => lojas.includes(p.l));
  const depsLoja = new Map();
  for (const r of ORC.dados.horarios || []) if (lojas.includes(r.l)) { if (!depsLoja.has(r.l)) depsLoja.set(r.l, new Set()); depsLoja.get(r.l).add(normalizar(r.d)); }
  const linhas = lojas.map((l) => {
    const total = depsLoja.get(l)?.size || 0;
    const ps = planos.filter((p) => p.l === l);
    const feitos = new Set(ps.map((p) => normalizar(lerChave(p.setor)?.dept)));
    const ult = ps.sort((a, b) => String(b.em).localeCompare(String(a.em)))[0];
    const p = total ? feitos.size / total : 0;
    return `<tr><td class="loja">${esc(nomeLoja(l))}</td><td class="num">${feitos.size} de ${total}</td><td class="pn-prog"><span style="width:${p * 100}%"></span></td>
      <td class="pn-setores">${[...feitos].map((d) => `<span class="chip">${esc(titulo(d))}</span>`).join("") || '<span class="texto-fraco">nenhuma escala salva ainda</span>'}</td>
      <td class="texto-fraco">${ult ? `${new Date(ult.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "")} · ${esc(ult.u)}` : "—"}</td></tr>`;
  }).join("");
  const tot = lojas.reduce((s, l) => s + (depsLoja.get(l)?.size || 0), 0);
  const feitos = lojas.reduce((s, l) => s + new Set(planos.filter((p) => p.l === l).map((p) => normalizar(lerChave(p.setor)?.dept))).size, 0);
  return `<section class="cartao"><div class="orc-porloja"><div class="orc-porloja-cab"><h3>Andamento das escalas 5x2</h3><small>${feitos} de ${tot} departamentos com escala salva${tot ? ` (${fmtPct(feitos / tot)})` : ""}</small></div>
    <div class="rolagem-conf"><table class="orc-reuniao pn-tab-and"><thead><tr><th class="loja">Loja</th><th>Departamentos</th><th class="loja">Progresso</th><th class="loja">Com escala salva</th><th class="loja">Última gravação</th></tr></thead><tbody>${linhas}</tbody></table></div></div></section>`;
}
