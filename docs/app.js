// ============================================================
// Escala 5x2 · Molicenter — app web
// Logins próprios da escala · colaboradores de todos os setores vindos do quadro do Senior (QL)
// Aba "QL Orçado x 5x2" (orcado.js): organograma do orçado e quantas pessoas cada jornada pede.
// Plano por loja + setor gravado no Supabase pelas funções escala_web_*.
// ============================================================
const CFG = window.CONFIG;
const M = window.Motor;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const p2 = (n) => String(n).padStart(2, "0");
const num1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(".", ",");
const titulo = (s) => String(s ?? "").toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const semAcento = (s) => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
const normalizar = (s) => semAcento(String(s ?? "").trim().toUpperCase()).split(/\s+/).filter(Boolean).join(" ");
const nomeLoja = (n) => (+n === 30 ? "Loja 30 · CD" : `Loja ${p2(n)}`);
const clonar = (o) => JSON.parse(JSON.stringify(o));

// Setores = departamentos do quadro do Senior (Banco QL). Chave de cada plano:
//   "D:<DEPT>"            → o departamento inteiro (todas as funções juntas)
//   "F:<DEPT>|<FUNÇÃO>"   → só uma função (ex.: operadoras de caixa, balconistas do açougue)
const chaveSetor = (dept, funcao) => (funcao ? `F:${dept}|${funcao}` : `D:${dept}`);
function lerChave(k) {
  const m = String(k || "").match(/^(D|F):([^|]+)(?:\|(.+))?$/);
  return m ? { dept: m[2], funcao: m[1] === "F" ? m[3] : null } : null;
}
function infoSetor(k) {
  const c = lerChave(k) || { dept: "?", funcao: null };
  return {
    ...c, chave: k,
    rotulo: c.funcao ? `${titulo(c.dept)} · ${titulo(c.funcao)}` : `${titulo(c.dept)} · todas as funções`,
    curto: c.funcao ? titulo(c.funcao) : titulo(c.dept),
    filtro: (x) => x.d === c.dept && (!c.funcao || x.f === c.funcao),
  };
}
// quem não entra na escala 5x2 por padrão (dá pra marcar "na escala" se quiser)
function motivoSemEscala(x) {
  if (/ART\.?\s*62/i.test(x.e || "")) return "ART 62 CLT";
  if (/APRENDIZ/i.test(x.f || "") || /CURSO/i.test(x.e || "")) return "Aprendiz / curso";
  return null;
}
// DSR1 / DSR2 do Banco QL.xlsx (os 2 principais dias de folga da pessoa) → regra da escala
// · DSR1 = Domingo  → não trabalha domingo; o outro DSR (se for dia de semana) vira a folga fixa
// · DSR1 = dia de semana → folga fixa nesse dia; domingo em rodízio
// · os dois em dia de semana → 1ª folga fixa + 2ª folga preferida
const DIA_DSR = { DOMINGO: 0, SEGUNDA: 1, TERCA: 2, QUARTA: 3, QUINTA: 4, SEXTA: 5, SABADO: 6 };
function diaDSR(v) {
  const k = String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/-?FEIRA/, "").trim();
  return k in DIA_DSR ? DIA_DSR[k] : null;
}
// · DSR num "dia sem folga" (terça/sábado) com outro dia de semana no outro DSR → usa só o outro
//   (ex.: Ter + Qui → folga fixa na quinta). Se o único dia de semana do DSR for terça/sábado, fica.
function regraDSR(x, bloqueados = []) {
  const a = diaDSR(x.d1), b = diaDSR(x.d2);
  if (a == null && b == null) return null;
  let sem = [a, b].filter((d) => d != null && d !== 0);
  const livres = sem.filter((d) => !bloqueados.includes(d));
  if (livres.length && livres.length < sem.length) sem = livres;
  return { domingo: a === 0 ? "nunca" : "rodizio", folgaFixa: sem[0] ?? null, folgaFixa2: sem[1] ?? null };
}
const textoDSR = (pe) => (pe.dsr && pe.dsr.length ? "DSR " + pe.dsr.map((d) => M.DOW[d].slice(0, 3)).join("+") : "");
// horário de funcionamento por loja (out/2026). dom: null = não abre no domingo
const FUNC_V = 2;
function funcionamentoPadrao(loja) {
  const l = +loja;
  if (l === 30) return { segsab: ["08:00", "18:00"], sab: ["08:00", "12:00"], dom: null };   // CD: seg a sex 8–18, sáb 8–12
  if (l === 8) return { segsab: ["08:00", "22:00"], sab: ["08:00", "22:00"], dom: ["08:00", "20:00"] };
  return { segsab: ["08:00", "21:00"], sab: ["08:00", "21:00"], dom: ["08:00", "20:00"] };   // Lojas 01 a 07
}
const PESOS_CD = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1 };   // CD: sábado é meio período, folga cai lá primeiro
const lojaAtual = () => est.dados?.loja ?? est.loja;
const MIN_GERAL = 0.3, MIN_DOM = 0.25;
const PESOS_PADRAO = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 5 };
const OPC_JORNADA = [240, 360, 380, 440, 480, 504, 528];
const OPC_ALMOCO = [0, 15, 60, 75, 90, 120];
const VERSAO_PLANO = 1;
const JORN_V = 2;   // jornada por cenário: 44h = hoje (6x1, Excel) · 42h/40h = 5x2 com a hora a mais no dia
// fechamento da loja (seg a sex) em minutos, para não deixar o turno maior passar da hora de fechar
const fechaLoja = (p) => M.hm(((p && p.funcionamento) || funcionamentoPadrao(lojaAtual())).segsab?.[1] || "21:00");
const baseTurno = (t) => ({ ...(t.hoje || { entrada: t.entrada, almoco: t.almoco, jornadaMin: 440 }), almocoMin: t.almocoMin });

function toast(msg, tipo = "") {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast " + tipo; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), tipo === "erro" ? 6500 : 3200);
}
function carregando(sim) { $("#carregando").hidden = !sim; }
function lerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLocal(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

// ---------- sessão (logins próprios da escala: Analista, Departamento Pessoal e Loja 01 a 08) ----------
const CHAVE_SESSAO = "escala_web_sessao";
const ROTULO_PERFIL = { analista: "Analista · todas as lojas e CD", dp: "Departamento Pessoal · todas as lojas e CD", loja: "Login da loja" };
let sessao = (() => { try { return JSON.parse(lerLocal(CHAVE_SESSAO)) || null; } catch { return null; } })();

const MENSAGENS = {
  SENHA_INCORRETA: "Usuário ou senha incorretos. Tente de novo.",
  SENHA_NAO_CONFIGURADA: "A senha deste usuário ainda não foi cadastrada (falta rodar o SQL das senhas).",
  USUARIO_INVALIDO: "Escolha um usuário da lista.",
  MUITAS_TENTATIVAS: "Muitas tentativas erradas. Espere 10 minutos e tente de novo.",
  SESSAO_INVALIDA: "Sua sessão expirou. Entre de novo.",
  SEM_PERMISSAO: "Seu login não tem acesso a esta loja.",
  ESCOPO_INVALIDO: "Escolha a loja.",
  SETOR_INVALIDO: "Setor inválido.",
  DADOS_GRANDES: "A escala ficou grande demais para gravar. Diminua o número de semanas.",
  "Could not find the function": "O banco ainda não tem as funções da escala (falta rodar os SQL 01 e 02 da escala).",
};
function traduzir(msg) {
  const m = String(msg);
  for (const k in MENSAGENS) if (m.includes(k)) return MENSAGENS[k];
  return m;
}
async function rpc(fn, args = {}) {
  if (window.__MOCK_RPC) return window.__MOCK_RPC(fn, args);
  let resp;
  try {
    resp = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: CFG.SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error("Sem conexão com a internet. Tente de novo.");
  }
  const texto = await resp.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  if (!resp.ok) {
    const msg = (corpo && (corpo.message || corpo.hint)) || `Erro ${resp.status}`;
    if (String(msg).includes("SESSAO_INVALIDA")) { sair(true); throw new Error(MENSAGENS.SESSAO_INVALIDA); }
    const e = new Error(String(msg).startsWith("CONFLITO:") ? String(msg) : traduzir(msg));
    throw e;
  }
  return corpo;
}

// ============================================================
// LOGIN
// ============================================================
async function telaLogin() {
  $("#app").hidden = true;
  $("#tela-login").hidden = false;
  $("#versao-login").textContent = "versão " + CFG.VERSAO;
  const sel = $("#login-usuario");
  sel.innerHTML = '<option value="">Carregando…</option>';
  try {
    const lista = await rpc("escala_web_lista_usuarios");
    const ultimo = lerLocal("escala_web_ultimo_usuario");
    sel.innerHTML = '<option value="">Selecione o usuário…</option>' +
      lista.map((u) => `<option${u === ultimo ? " selected" : ""}>${esc(u)}</option>`).join("");
  } catch (e) {
    sel.innerHTML = '<option value="">—</option>';
    erroLogin(e.message);
  }
  (sel.value ? $("#login-senha") : sel).focus();
}
function erroLogin(msg) { const el = $("#login-erro"); el.textContent = msg; el.hidden = !msg; }

$("#form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const email = $("#login-usuario").value;
  const senha = $("#login-senha").value;
  if (!email) return erroLogin("Escolha um usuário da lista.");
  erroLogin("");
  const btn = $("#btn-entrar");
  btn.disabled = true; btn.textContent = "Entrando…";
  try {
    sessao = await rpc("escala_web_login", { p_usuario: email, p_senha: senha });
    gravarLocal(CHAVE_SESSAO, JSON.stringify(sessao));
    gravarLocal("escala_web_ultimo_usuario", email);
    $("#login-senha").value = "";
    iniciarApp();
  } catch (e) {
    erroLogin(e.message);
  } finally {
    btn.disabled = false; btn.textContent = "Entrar";
  }
});

function sair(silencioso) {
  if (!silencioso && algumSujo() && !confirm("Há alterações não salvas. Sair mesmo assim? (elas ficam guardadas neste navegador)")) return;
  const tok = sessao?.token;
  sessao = null; est.dados = null; ORC.dados = null; ORC.erro = null; ORC.escopo = null;
  gravarLocal(CHAVE_SESSAO, null);
  if (tok && !silencioso) rpc("escala_web_sair", { p_token: tok }).catch(() => {});
  telaLogin();
}

// ============================================================
// ESTADO
// ============================================================
const est = {
  loja: +lerLocal("escala_web_loja") || 1,
  setor: lerLocal("escala_web_setor") || "",
  hoje: null,
  estrutura: [],          // [{ dept, n, funcoes: [{ f, n }] }]
  ultimoPorDept: (() => { try { return JSON.parse(lerLocal("escala_web_ultimo_dept")) || {}; } catch { return {}; } })(),
  dados: null,            // resposta do escala_web_dados
  planos: {},             // setor → { p (plano), versao, usuario, sujo }
  semanaMapa: 0,
  aba: lerLocal("escala_web_aba") || "escala",
  modo: ["orcado", "painel", "total"].includes(lerLocal("escala_web_modo")) ? lerLocal("escala_web_modo") : "escala",   // "escala" (setor), "painel" (Painel da mudança) ou "orcado" (QL Orçado x 5x2)
  verSemana: "todas",
  mostrarMinimo: false,
  mostrarTodosAlertas: false,
  aberto: null,           // "sync" (aviso amarelo) ou "atencao" (o que precisa de atenção) aberto
  silencioso: false,      // não mostrar avisos ao abrir vários setores de uma vez (visão Total)
  sync: {},               // setor → { novos:[], saiu:[] }
};
const algumSujo = () => Object.values(est.planos).some((x) => x.sujo);
const plano = () => est.planos[est.setor]?.p;
const ativos = (p) => p.pessoas.filter((x) => !x.fora && x.ativo !== false);

function iniciarApp() {
  $("#tela-login").hidden = true;
  $("#app").hidden = false;
  if (sessao.loja_fixa != null) est.loja = sessao.loja_fixa;
  carregarLoja(est.loja);
}

async function carregarLoja(loja) {
  carregando(true);
  try {
    const d = await rpc("escala_web_dados", { p_token: sessao.token, p_loja: loja });
    est.dados = d; est.loja = d.loja; est.planos = {}; est.semanaMapa = 0;
    gravarLocal("escala_web_loja", String(d.loja));
    const hoje = M.lerISO(d.hoje) || M.lerISO(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
    est.hoje = hoje;
    est.estrutura = montarEstrutura(d.pessoas);
    const chaves = new Set(est.estrutura.flatMap((x) => [chaveSetor(x.dept), ...x.funcoes.map((f) => chaveSetor(x.dept, f.f))]));
    if (!chaves.has(est.setor)) {
      const padrao = chaveSetor("FRENTE DE CAIXA", "OPERADOR CAIXA");
      est.setor = chaves.has(padrao) ? padrao : est.estrutura[0] ? chaveSetor(est.estrutura[0].dept) : "";
    }
    if (!est.setor) throw new Error("Nenhum colaborador desta loja no quadro do QL. Atualize o banco (Excel) no QL primeiro.");
    garantirPlano(est.setor);
    render();
    carregarOrcado();
  } catch (e) {
    toast(e.message, "erro");
    $("#topo").innerHTML = "";
    $("#conteudo").innerHTML = `<div class="cartao"><p class="erro">${esc(e.message)}</p><p><button class="btn" data-acao="recarregar">Tentar de novo</button> <button class="btn btn-borda" data-acao="sair">Sair</button></p></div>`;
  } finally {
    carregando(false);
  }
}

function montarEstrutura(pessoas) {
  const m = new Map();
  for (const x of pessoas) {
    if (!m.has(x.d)) m.set(x.d, new Map());
    const fs = m.get(x.d); fs.set(x.f, (fs.get(x.f) || 0) + 1);
  }
  return [...m.entries()].map(([dept, fs]) => ({
    dept, n: [...fs.values()].reduce((s, v) => s + v, 0),
    funcoes: [...fs.entries()].map(([f, n]) => ({ f, n })).sort((a, b) => b.n - a.n || a.f.localeCompare(b.f)),
  })).sort((a, b) => (a.dept === "FRENTE DE CAIXA" ? -1 : b.dept === "FRENTE DE CAIXA" ? 1 : a.dept.localeCompare(b.dept)));
}

// cria (ou abre o salvo) o plano de um setor só quando ele é aberto
function garantirPlano(k) {
  if (est.planos[k]) return est.planos[k];
  const d = est.dados, S = infoSetor(k);
  const doQL = d.pessoas.filter(S.filtro);
  const salvo = d.planos.find((x) => x.setor === k);
  let p, versao = null, usuario = null, sujo = false;
  if (salvo) { p = normalizarPlano(clonar(salvo.dados), k); versao = salvo.atualizado_em; usuario = salvo.usuario; }
  else p = novoPlano(k, doQL, est.hoje);
  // rascunho deste navegador (só vale se ninguém salvou por cima depois)
  const rasc = lerRascunho(d.loja, k);
  if (rasc && (rasc.base || null) === (versao || null)) {
    p = normalizarPlano(rasc.p, k); sujo = true;
    if (!est.silencioso) toast("Recuperei alterações que não tinham sido salvas.", "ok");
  } else if (rasc) gravarRascunho(d.loja, k, null);
  const migrou = !!p._migrou; delete p._migrou;
  est.sync[k] = sincronizar(p, doQL);
  if (migrou && !est.sync[k].dsrMudou && p.pessoas.length) M.redistribuir(p, ativos(p));
  if ((est.sync[k].dsrMudou || migrou) && salvo) {
    sujo = true; gravarRascunho(d.loja, k, { base: versao, p });
    const o = [migrou ? "regras novas da escala (jornada por cenário: 44h como hoje, 42h/40h com mais horas por dia)" : "", est.sync[k].dsrMudou ? `folgas fixas do DSR em ${est.sync[k].dsrMudou} pessoa(s)` : ""].filter(Boolean).join(" e ");
    if (!est.silencioso) toast(`Escala refeita: ${o}. Confira e clique em Salvar.`, "ok");
  }
  est.planos[k] = { p, versao, usuario, sujo };
  return est.planos[k];
}
function abrirSetor(k) {
  est.setor = k; est.semanaMapa = 0; est.aberto = null;
  gravarLocal("escala_web_setor", k);
  const c = lerChave(k);
  if (c) { est.ultimoPorDept[c.dept] = k; gravarLocal("escala_web_ultimo_dept", JSON.stringify(est.ultimoPorDept)); }
  carregando(true);
  setTimeout(() => { try { garantirPlano(k); render(); } finally { carregando(false); } }, 10);
}

// ---------- rascunho local ----------
const chaveRasc = (loja, setor) => `escala_web_rasc_${loja}_${encodeURIComponent(setor)}`;
function lerRascunho(loja, setor) { try { return JSON.parse(lerLocal(chaveRasc(loja, setor))); } catch { return null; } }
function gravarRascunho(loja, setor, obj) { gravarLocal(chaveRasc(loja, setor), obj ? JSON.stringify(obj) : null); }

// ============================================================
// PLANO: criação, normalização e sincronização com o QL
// ============================================================
function idPessoaQL(nome) { return "q:" + normalizar(nome); }

// turnos a partir do horário de hoje (coluna "Descrição (Escala)" do Banco QL). Cada turno guarda o
// horário de hoje em t.hoje; entrada/almoço/jornada são os do cenário (44h = hoje; 42h/40h = 5x2)
function inferirTurnos(doQL, cenario, fecha) {
  const contagem = new Map();
  for (const x of doQL) {
    const e = M.lerEscalaSenior(x.e);
    if (!e) continue;
    const almocoMin = Math.min(120, Math.max(60, e.almocoMin));
    const k = `${e.entrada}|${e.almoco}|${almocoMin}`;
    const c = contagem.get(k) || { n: 0, j: new Map() };
    c.n++; c.j.set(e.jornadaMin, (c.j.get(e.jornadaMin) || 0) + 1);
    contagem.set(k, c);
  }
  let top = [...contagem.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([k, c]) => {
    const [entrada, almoco, am] = k.split("|");
    const j = [...c.j.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { entrada, almoco, almocoMin: +am, jornadaMin: j >= 120 && j <= 600 ? j : 440 };
  });
  top.sort((a, b) => M.hm(a.entrada) - M.hm(b.entrada));
  if (!top.length) top = [["07:30", "11:30"], ["10:00", "14:00"], ["12:45", "17:00"]].map(([entrada, almoco]) => ({ entrada, almoco, almocoMin: 60, jornadaMin: 440 }));
  return top.map((b, i) => {
    const hoje = { entrada: b.entrada, almoco: b.almoco, jornadaMin: b.jornadaMin };
    return { id: "t" + (i + 1), nome: "", almocoMin: b.almocoMin, hoje, ...M.ajustarCenario(b, cenario, fecha) };
  }).filter((t, i, arr) => arr.findIndex((u) => Math.abs(M.hm(u.entrada) - M.hm(t.entrada)) <= 20 && Math.abs(M.saidaTurno(u) - M.saidaTurno(t)) <= 20) === i)
    .map((t, i, arr) => ({ ...t, id: "t" + (i + 1), nome: arr.length === 1 ? "Turno único" : i === 0 ? "Abertura" : i === arr.length - 1 ? "Fechamento" : arr.length === 3 ? "Intermediário" : `Intermediário ${i}` }));
}

// horário da pessoa no cenário (linha cinza embaixo do nome): no 44h é o do Excel; no 42h/40h
// a jornada do dia aumenta (mesma entrada e almoço, sai mais tarde)
function horarioNoCenario(p, pe) {
  const s = pe.senior || "";
  if (!s || +p.cenario === 44) return { txt: s, tit: s ? `Hoje (Excel): ${s}` : "" };
  const e = M.lerEscalaSenior(s);
  if (!e) return { txt: s, tit: s };
  const n = M.ajustarCenario(e, p.cenario, fechaLoja(p));
  const ent = M.hm(n.entrada), alm = M.hm(n.almoco), volta = alm + e.almocoMin, sai = ent + n.jornadaMin + e.almocoMin;
  const txt = `5x2 ${M.fmtHM(ent)}-${M.fmtHM(alm)} ${M.fmtHM(volta)}-${M.fmtHM(sai)} · ${M.fmtDur(n.jornadaMin)}/dia${n.jornadaMin > 480 ? " ⚠" : ""}`;
  return { txt, tit: `${p.cenario}h no 5x2: ${txt}${n.jornadaMin > 480 ? " (acima de 8h por dia)" : ""} · hoje (Excel): ${s} · ${M.fmtDur(e.jornadaMin)}/dia` };
}

function turnoParaEscala(p, escalaTxt) {
  const e = M.lerEscalaSenior(escalaTxt);
  if (!e || !p.turnos.length) return p.turnos[0]?.id || null;
  const exato = p.turnos.find((t) => t.entrada === e.entrada && t.almoco === e.almoco);
  if (exato) return exato.id;
  let melhor = p.turnos[0], dist = Infinity;
  for (const t of p.turnos) { const dd = Math.abs(M.hm(t.entrada) - M.hm(e.entrada)); if (dd < dist) { dist = dd; melhor = t; } }
  return melhor.id;
}

function novoPlano(setor, doQL, hoje) {
  const cenario = 42;
  const inicio = M.iso(M.domingoDe(hoje, true));
  const naEscala = doQL.filter((x) => !motivoSemEscala(x));
  const n = naEscala.filter((x) => !/FERIAS|FÉRIAS|AFAST/i.test(x.s || "")).length || naEscala.length;
  const func = funcionamentoPadrao(lojaAtual());
  const p = {
    v: VERSAO_PLANO, setor, cenario, inicio, semanas: 8, semV: 2, diasSemFolga: +lojaAtual() === 30 ? [] : [2, 6],
    funcionamento: func, funcV: FUNC_V, jornV: JORN_V,
    domingo: { entrada: "08:00", saida: "20:00", minimo: +lojaAtual() === 30 ? 0 : Math.max(1, Math.round(n * MIN_DOM)) },
    domingosSeguidosMax: 2,
    minimos: { geral: Math.max(1, Math.floor(n * MIN_GERAL)), faixas: [] },
    pesos: +lojaAtual() === 30 ? { ...PESOS_CD } : { ...PESOS_PADRAO },
    turnos: inferirTurnos(naEscala, cenario, M.hm(func.segsab[1])),
    pessoas: [], grade: {}, travas: {},
  };
  return p;
}

function normalizarPlano(p, setor) {
  p.v ||= VERSAO_PLANO; p.setor = setor;
  p.cenario = M.CENARIOS[p.cenario] ? p.cenario : 42;
  // padrão passou de 4 para 8 semanas (~60 dias): planos que estavam no padrão antigo vão para 8
  // terça e sábado (melhores dias de venda) sem folga por padrão — vale também para os planos salvos
  if (!Array.isArray(p.diasSemFolga)) { p.diasSemFolga = +lojaAtual() === 30 ? [] : [2, 6]; p._migrou = true; }
  if (!p.semV) { if (!p.semanas || +p.semanas === 4) { p.semanas = 8; p._migrou = true; } p.semV = 2; }
  p.semanas = Math.min(8, Math.max(1, +p.semanas || 8));
  // planos de antes do horário por loja: passam para o horário oficial da loja (e o motor redistribui)
  if ((p.funcV || 1) < FUNC_V) {
    const pesosEram = JSON.stringify(p.pesos || PESOS_PADRAO) === JSON.stringify(PESOS_PADRAO);
    p.funcionamento = funcionamentoPadrao(lojaAtual()); p.funcV = FUNC_V;
    if (+lojaAtual() === 30) { if (pesosEram) p.pesos = { ...PESOS_CD }; if (p.domingo) p.domingo.minimo = 0; }
    p._migrou = true;
  }
  p.funcionamento ||= funcionamentoPadrao(lojaAtual());
  if (p.funcionamento.sab === undefined) p.funcionamento.sab = [...p.funcionamento.segsab];
  p.domingo ||= { entrada: "08:00", saida: "12:00", minimo: 2 };
  p.domingosSeguidosMax ||= 2;
  p.minimos ||= { geral: 2, faixas: [] }; p.minimos.faixas ||= [];
  p.pesos ||= { ...PESOS_PADRAO };
  p.turnos ||= []; p.pessoas ||= []; p.grade ||= {}; p.travas ||= {};
  if (!p.turnos.length) p.turnos = inferirTurnos([], p.cenario, fechaLoja(p));
  // planos de antes da jornada por cenário: cada turno ganha o horário de hoje (o do Excel de quem
  // está nele) e, se estava no padrão antigo (8h48/8h24/8h), passa para a jornada nova do cenário
  if ((p.jornV || 1) < JORN_V) {
    const fecha = fechaLoja(p);
    for (const t of p.turnos) {
      if (!t.hoje) {
        const cont = new Map();
        for (const pe of p.pessoas) {
          if (pe.turno !== t.id || pe.fora) continue;
          const e = M.lerEscalaSenior(pe.senior);
          if (e) { const k = `${e.entrada}|${e.almoco}|${e.jornadaMin}`; cont.set(k, (cont.get(k) || 0) + 1); }
        }
        const top = [...cont.entries()].sort((a, b) => b[1] - a[1])[0];
        if (top) { const [en, al, j] = top[0].split("|"); t.hoje = { entrada: en, almoco: al, jornadaMin: +j >= 120 && +j <= 600 ? +j : 440 }; }
        else t.hoje = { entrada: t.entrada, almoco: t.almoco, jornadaMin: 440 };
      }
      if (t.jornadaMin === M.CENARIOS[p.cenario].jornadaMin) Object.assign(t, M.ajustarCenario(baseTurno(t), p.cenario, fecha));
    }
    p.jornV = JORN_V; p._migrou = true;
  }
  if (!p.inicio) p.inicio = M.iso(M.domingoDe(new Date(), true));
  return p;
}

// junta o plano com o quadro atual do QL: entra quem é novo, sai quem não está mais no Senior
function sincronizar(p, doQL) {
  const novos = [], saiu = [];
  let dsrMudou = 0;
  const noQL = new Map(doQL.map((x) => [idPessoaQL(x.n), x]));
  const vazio = p.pessoas.length === 0;
  for (const [id, x] of noQL) {
    let pe = p.pessoas.find((y) => y.id === id);
    if (!pe) {
      pe = { id, nome: titulo(x.n), origem: "ql", turno: turnoParaEscala(p, x.e), domingo: "rodizio", folgaFixa: null, ativo: !motivoSemEscala(x) };
      p.pessoas.push(pe);
      if (!vazio) novos.push(pe.nome);
    }
    pe.sit = x.s || ""; pe.senior = x.e || ""; pe.funcao = x.f || ""; pe.fora = false;
    // DSR do Excel: vira a regra de domingo + folga fixa, até alguém mudar à mão nesta escala
    const r = regraDSR(x, p.diasSemFolga || []);
    pe.dsr = [diaDSR(x.d1), diaDSR(x.d2)].filter((d) => d != null);
    if (!pe.dsr.length) delete pe.dsr;
    if (r) pe.dsrRegra = r; else delete pe.dsrRegra;
    if (pe.dsrAuto === undefined && (pe.folgaFixa != null || (pe.domingo && pe.domingo !== "rodizio"))) pe.dsrAuto = false;   // já tinha ajuste manual
    if (r && pe.dsrAuto !== false) {
      if (pe.domingo !== r.domingo || (pe.folgaFixa ?? null) !== r.folgaFixa || (pe.folgaFixa2 ?? null) !== r.folgaFixa2) {
        pe.domingo = r.domingo; pe.folgaFixa = r.folgaFixa; pe.folgaFixa2 = r.folgaFixa2;
        if (!vazio) dsrMudou++;
      }
      pe.dsrAuto = true;
    }
    const mot = motivoSemEscala(x); if (mot) pe.semEscala = mot; else delete pe.semEscala;
    if (/FERIAS|FÉRIAS/i.test(pe.sit)) pe.ferias = true; else delete pe.ferias;
  }
  for (const pe of p.pessoas) {
    if (pe.origem === "ql" && !noQL.has(pe.id)) { if (!pe.fora) saiu.push(pe.nome); pe.fora = true; }
  }
  // ordem: QL por turno e nome, extras no fim
  const ordT = (pe) => p.turnos.findIndex((t) => t.id === pe.turno);
  p.pessoas.sort((a, b) => (a.origem === "extra") - (b.origem === "extra") || ordT(a) - ordT(b) || a.nome.localeCompare(b.nome));
  if (vazio || dsrMudou) M.redistribuir(p, ativos(p));   // ajustes à mão (bolinha rosa) continuam travados
  return { novos, saiu, dsrMudou };
}

// ============================================================
// ALTERAÇÕES
// ============================================================
function alterou(opts = {}) {
  const reg = est.planos[est.setor];
  reg.sujo = true;
  gravarRascunho(est.loja, est.setor, { base: reg.versao, p: reg.p });
  if (opts.render !== false) render();
}

function setCaminho(obj, caminho, v) {
  const ks = caminho.split(".");
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) o = o[isNaN(ks[i]) ? ks[i] : +ks[i]];
  o[ks[ks.length - 1]] = v;
}

// troca 44h / 42h / 40h: os turnos que estão no padrão do cenário passam para o novo (ajustados à mão
// ficam) e as folgas são refeitas (1 por semana no 44h, 2 no 5x2). Ajustes da escala à mão ficam travados.
function trocarCenario(h) {
  const p = plano();
  if (+p.cenario === +h) return;
  const fecha = fechaLoja(p);
  let manuais = 0;
  p.turnos.forEach((t) => {
    if (!t.hoje) t.hoje = { entrada: t.entrada, almoco: t.almoco, jornadaMin: 440 };
    const velho = M.ajustarCenario(baseTurno(t), p.cenario, fecha);
    if (t.entrada === velho.entrada && t.almoco === velho.almoco && t.jornadaMin === velho.jornadaMin) Object.assign(t, M.ajustarCenario(baseTurno(t), h, fecha));
    else manuais++;
  });
  p.cenario = h;
  M.redistribuir(p, ativos(p));
  alterou();
  const j = M.jornadaCenario(h, 440);
  toast(+h === 44 ? "44h: como hoje (6x1, jornada do Excel, 1 folga por semana). Escala refeita."
    : `${h}h no 5x2: ${M.fmtDur(j)} por dia, 2 folgas por semana. Escala refeita${manuais ? ` (${manuais} turno(s) ajustado(s) à mão ficaram como estavam)` : ""}.`, "ok");
}

function clicarCelula(pid, isoData) {
  const p = plano();
  const d = M.datasDoPlano(p).find((x) => x.iso === isoData);
  if (!d) return;
  const atual = M.valor(p, pid, d);
  const ciclo = d.dow === 0 ? { D: "F", F: "X", X: "D" } : { T: "F", F: "X", X: "T" };
  (p.grade[pid] ||= {})[isoData] = ciclo[atual];
  (p.travas[pid] ||= {})[isoData] = true;
  alterou();
}

function trocarModo(m) {
  est.modo = ["orcado", "painel", "total"].includes(m) ? m : "escala";
  est.aberto = null;
  gravarLocal("escala_web_modo", est.modo);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function redistribuirAgora() {
  const p = plano();
  M.redistribuir(p, ativos(p));
  alterou();
  toast("Folgas redistribuídas. Os ajustes feitos à mão (bolinha rosa) foram mantidos.", "ok");
}
function escalonarAgora() {
  const p = plano();
  carregando(true);
  setTimeout(() => {
    try {
      const r = M.escalonarAlmocos(p, ativos(p));
      alterou();
      toast(r.depois < r.antes ? "Almoços escalonados: o buraco de cobertura diminuiu." : "Os almoços já estavam no melhor encaixe possível com esses turnos.", r.depois < r.antes ? "ok" : "");
    } finally { carregando(false); }
  }, 20);
}
function destravar() {
  const p = plano();
  if (!confirm("Tirar todos os ajustes manuais (as ausências X continuam)? Depois clique em Redistribuir.")) return;
  for (const pid in p.travas) for (const k in p.travas[pid]) if (p.grade[pid]?.[k] !== "X") delete p.travas[pid][k];
  M.redistribuir(p, ativos(p));
  alterou();
}

function addTurno() {
  const p = plano();
  const ult = p.turnos[p.turnos.length - 1];
  const id = "t" + Date.now().toString(36);
  const b = ult?.hoje || ult;
  const hoje = { entrada: b ? M.fmtHM(M.hm(b.entrada) + 60) : "09:00", almoco: b ? M.fmtHM(M.hm(b.almoco) + 60) : "13:00", jornadaMin: ult?.hoje?.jornadaMin || 440 };
  p.turnos.push({ id, nome: "Novo turno", almocoMin: 60, hoje, ...M.ajustarCenario({ ...hoje, almocoMin: 60 }, p.cenario, fechaLoja(p)) });
  alterou();
}
function removerTurno(id) {
  const p = plano();
  if (p.turnos.length <= 1) return toast("Precisa ter pelo menos um turno.", "erro");
  const t = p.turnos.find((x) => x.id === id);
  const usando = p.pessoas.filter((x) => x.turno === id).length;
  if (!confirm(`Remover o turno "${t.nome}"?` + (usando ? ` ${usando} pessoa(s) passam para o turno "${p.turnos.find((x) => x.id !== id).nome}".` : ""))) return;
  p.turnos = p.turnos.filter((x) => x.id !== id);
  p.pessoas.forEach((x) => { if (x.turno === id) x.turno = p.turnos[0].id; });
  alterou();
}
function addFaixa() {
  const p = plano();
  p.minimos.faixas.push({ dias: "segsab", de: "11:00", ate: "14:00", min: Math.max(1, (+p.minimos.geral || 1) + 1) });
  alterou();
}
function addExtra() {
  const p = plano();
  const nome = prompt("Nome da pessoa extra (ex.: Coringa, Vaga em aberto, nome do novo contratado):", `${infoSetor(est.setor).curto} extra`);
  if (!nome) return;
  p.pessoas.push({ id: "x:" + Date.now().toString(36), nome: nome.trim(), origem: "extra", turno: p.turnos[0].id, domingo: "rodizio", folgaFixa: null, ativo: true });
  alterou();
}
function usarDSR(id) {
  const p = plano();
  const pe = p.pessoas.find((x) => x.id === id);
  if (!pe?.dsrRegra) return;
  Object.assign(pe, { domingo: pe.dsrRegra.domingo, folgaFixa: pe.dsrRegra.folgaFixa, folgaFixa2: pe.dsrRegra.folgaFixa2, dsrAuto: true });
  M.redistribuir(p, ativos(p));
  alterou();
  toast(`${pe.nome}: domingo e folgas voltaram para o DSR.`, "ok");
}
function removerExtra(id) {
  const p = plano();
  const pe = p.pessoas.find((x) => x.id === id);
  if (!pe || !confirm(`Tirar "${pe.nome}" da escala?`)) return;
  p.pessoas = p.pessoas.filter((x) => x.id !== id);
  delete p.grade[id]; delete p.travas[id];
  alterou();
}

// ============================================================
// SALVAR
// ============================================================
function paraGravar(p) {
  const c = clonar(p);
  c.pessoas = c.pessoas.map(({ sit, ferias, semEscala, ...x }) => x);
  return c;
}
async function salvar() {
  const sujos = Object.keys(est.planos).filter((s) => est.planos[s].sujo);
  if (!sujos.length) return;
  const btn = $("#btn-salvar"); if (btn) { btn.disabled = true; btn.textContent = "Salvando…"; }
  try {
    for (const setor of sujos) {
      const reg = est.planos[setor];
      let r;
      try {
        r = await rpc("escala_web_salvar", { p_token: sessao.token, p_loja: est.loja, p_setor: setor, p_dados: paraGravar(reg.p), p_versao: reg.versao, p_forcar: false });
      } catch (e) {
        const m = String(e.message);
        if (!m.startsWith("CONFLITO:")) throw e;
        const quem = m.replace("CONFLITO:", "").trim();
        if (!confirm(`${infoSetor(setor).rotulo}: outra pessoa salvou esta escala depois que você abriu (${quem}).\n\nOK = gravar a sua versão por cima (a outra fica no histórico)\nCancelar = não gravar este setor agora`)) continue;
        r = await rpc("escala_web_salvar", { p_token: sessao.token, p_loja: est.loja, p_setor: setor, p_dados: paraGravar(reg.p), p_versao: reg.versao, p_forcar: true });
      }
      reg.versao = r.atualizado_em; reg.usuario = r.usuario; reg.sujo = false;
      gravarRascunho(est.loja, setor, null);
      const i = est.dados.planos.findIndex((x) => x.setor === setor);
      const novo = { setor, dados: paraGravar(reg.p), atualizado_em: r.atualizado_em, usuario: r.usuario };
      if (i >= 0) est.dados.planos[i] = novo; else est.dados.planos.push(novo);
    }
    toast(algumSujo() ? "Parte das escalas foi salva." : "Escala salva.", algumSujo() ? "" : "ok");
  } catch (e) {
    toast(e.message, "erro");
  } finally {
    render();
  }
}

// ============================================================
// EXPORTAR
// ============================================================
function exportarCSV() {
  const p = plano();
  const an = M.analisar(p, ativos(p));
  const linhas = [];
  const cab = ["Nome", "Turno", "Entrada", "Saída"];
  an.dias.forEach((d) => cab.push(`${M.DOW[d.dow]} ${M.dataCurta(d.d)}`));
  for (let w = 0; w < p.semanas; w++) cab.push(`Horas sem ${w + 1}`);
  linhas.push(cab);
  for (const pe of ativos(p)) {
    const t = M.turnoDe(p, pe);
    const l = [pe.nome, t?.nome || "", t?.entrada || "", t ? M.fmtHM(M.saidaTurno(t)) : ""];
    an.dias.forEach((d) => l.push(M.valor(p, pe.id, d)));
    an.horas[pe.id].forEach((h) => l.push(M.fmtDur(h.min)));
    linhas.push(l);
  }
  const tot = ["Trabalhando", "", "", ""];
  an.porDia.forEach((x) => tot.push(x.trab));
  linhas.push(tot);
  const csv = "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `escala_5x2_${nomeLoja(est.loja).replace(" ", "")}_${infoSetor(est.setor).curto.replace(/[^\p{L}\p{N}]+/gu, "-")}_${p.inicio}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ============================================================
// TELA
// ============================================================
function opcoes(lista, atual) {
  return lista.map(([v, r]) => `<option value="${esc(v)}"${String(v) === String(atual) ? " selected" : ""}>${esc(r)}</option>`).join("");
}
const fmtHoraPilula = (h) => h.replace(":", "h");

const VISOES = [
  ["escala", "Escala", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg>'],
  ["cobertura", "Cobertura", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'],
  ["regras", "Turnos e mínimos", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'],
  ["pessoas", "Pessoas", '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/></svg>'],
];

function render() {
  if (!est.dados || !plano()) return;
  // guarda a rolagem lateral das tabelas
  const rol = {};
  $$("[data-rolagem]").forEach((el) => (rol[el.dataset.rolagem] = el.scrollLeft));

  const p = plano();
  if (est.modo !== "escala") {
    $("#topo").innerHTML = htmlTopo(p);
    $("#conteudo").innerHTML = htmlAbas() + (est.modo === "painel" ? htmlPainel() : est.modo === "total" ? htmlTotal() : htmlOrcado());
    htmlBarra();
    return;
  }
  const pessoas = ativos(p);
  const an = M.analisar(p, pessoas);
  if (est.semanaMapa >= p.semanas) est.semanaMapa = 0;
  if (est.verSemana !== "todas" && +est.verSemana >= p.semanas) est.verSemana = "todas";
  const visao = VISOES.some((v) => v[0] === est.aba) ? est.aba : "escala";
  const corpo = visao === "escala" ? htmlEscala(p, pessoas, an)
    : visao === "cobertura" ? htmlMapa(p, an)
    : visao === "regras" ? `<div class="duas">${htmlTurnos(p)}${htmlMinimos(p)}</div>`
    : htmlPessoas(p);
  $("#topo").innerHTML = htmlTopo(p);
  $("#conteudo").innerHTML = [
    htmlAbas(p, an), htmlAberto(p, an), htmlFaixaOrcado(p),
    `<div class="painel painel-so">${htmlKpis(p, pessoas, an)}</div>`,
    htmlRoteiro(p, an),
    `<nav class="visoes nao-imprime">${VISOES.map(([id, r, ic]) => `<button type="button" data-acao="visao" data-v="${id}" class="${id === visao ? "ativo" : ""}">${ic}<span>${r}</span>${id === "cobertura" && an.faixasAbaixo ? `<em>${an.problemas.length}</em>` : ""}</button>`).join("")}</nav>`,
    corpo,
  ].join("");
  htmlBarra();
  $$("[data-rolagem]").forEach((el) => { if (rol[el.dataset.rolagem] != null) el.scrollLeft = rol[el.dataset.rolagem]; });
}

function htmlTopo(p) {
  const lojas = est.dados.lojas || [];
  const modoOrc = (est.modo === "orcado" || est.modo === "painel") && ORC.dados;
  const optsOrc = modoOrc ? opcoesEscopoOrc() : [];
  const seletor = modoOrc
    ? (optsOrc.length > 1 ? `<select class="sel-loja" data-acao-change="orc-escopo" aria-label="Loja ou total">${opcoes(optsOrc, ORC.escopo)}</select>` : `<span class="loja-fixa">${esc(nomeEscopoOrc(ORC.escopo ?? est.loja))}</span>`)
    : sessao.loja_fixa != null || lojas.length <= 1
    ? `<span class="loja-fixa">${nomeLoja(est.loja)}</span>`
    : `<select class="sel-loja" data-acao-change="loja" aria-label="Loja">${opcoes(lojas.map((l) => [l, nomeLoja(l)]), est.loja)}</select>`;
  const orc = est.modo === "orcado" || est.modo === "painel";
  const cenAtual = orc ? ORC.cenario : p.cenario;
  const j = M.CENARIOS[cenAtual];
  const jEsc = +cenAtual === 44 ? "do Excel (6x1)" : `${M.fmtDur(M.jornadaCenario(cenAtual, 440))}/dia`;
  const titEsc = { 44: "44h · como hoje: 6x1, jornada do Excel, 1 folga por semana", 42: `42h · 5x2: ${M.fmtDur(M.jornadaCenario(42, 440))} por dia, 2 folgas`, 40: `40h · 5x2: ${M.fmtDur(M.jornadaCenario(40, 440))} por dia, 2 folgas` };
  const fh = (h) => (h ? `${fmtHoraPilula(h[0])}–${fmtHoraPilula(h[1])}` : "fechado");
  const fu = p.funcionamento || {};
  const sabIgual = !fu.sab || (fu.sab[0] === fu.segsab[0] && fu.sab[1] === fu.segsab[1]);
  const pilHor = sabIgual
    ? `<span class="pilula">Seg–sáb <b>${fh(fu.segsab)}</b></span>`
    : `<span class="pilula">Seg–sex <b>${fh(fu.segsab)}</b></span><span class="pilula">Sáb <b>${fh(fu.sab)}</b></span>`;
  return `<div class="topo-in">
    <div class="topo-linha">
      <div class="topo-titulo"><img src="logo.png" alt=""><h1>Escala 5x2 <span class="ponto">·</span> ${seletor}</h1></div>
      <div class="pilulas">${orc ? `<span class="pilula">QL Orçado <b>x 5x2</b></span><span class="pilula">Hoje <b>6x1 · 44h</b></span><span class="pilula">Jornada <b>${M.fmtDur(j.jornadaMin)}</b></span>` : `
        <span class="pilula">Folgas <b>${M.folgasSemana(cenAtual)}/sem</b></span>
        <span class="pilula">Jornada <b>${jEsc}</b></span>
        ${pilHor}
        <span class="pilula">Dom <b>${fh(fu.dom)}</b></span>`}
      </div>
      <div class="topo-conta">
        <div class="cenarios">${[44, 42, 40].map((h) => `<button type="button" data-acao="cenario" data-h="${h}" class="${cenAtual === h ? "ativo" : ""}" title="${orc ? M.CENARIOS[h].rotulo + " · conta do QL Orçado" : titEsc[h]}">${h}h</button>`).join("")}</div>
        <div class="quem"><strong>${esc(sessao.email)}</strong>${esc(ROTULO_PERFIL[sessao.perfil] || "")}</div>
        <button class="btn btn-peq btn-vidro" data-acao="imprimir" title="Imprimir ou salvar em PDF">PDF</button>
        <button class="btn btn-peq btn-vidro" data-acao="tema" title="Tema claro/escuro">◐</button>
        <button class="btn btn-peq btn-vidro" data-acao="sair">Sair</button>
      </div>
    </div>
  </div>`;
}

function marcasSetor(k) {
  const reg = est.planos[k];
  const salvo = est.dados.planos.some((x) => x.setor === k);
  let s = "";
  if (reg) {
    const an = M.analisar(reg.p, ativos(reg.p));
    s += `<span class="bolinha${an.problemas.length || an.avisos.length ? " ruim" : ""}"></span>`;
  }
  if (reg?.sujo) s += `<span class="qtd" title="não salvo">•</span>`;
  else if (salvo) s += `<span class="salvo" title="escala salva">✓</span>`;
  return s;
}
function htmlAbas(p, an) {
  const cur = lerChave(est.setor);
  const salvosDept = (dept) => est.dados.planos.some((x) => lerChave(x.setor)?.dept === dept);
  const sujoDept = (dept) => Object.keys(est.planos).some((k) => est.planos[k].sujo && lerChave(k)?.dept === dept);
  const m = est.modo;
  const icPainel = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>`;
  const icOrc = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/></svg>`;
  const icTot = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
  const visoesGerais = `<div class="seg-modos">
      <button type="button" data-acao="modo" data-v="painel" class="${m === "painel" ? "ativo" : ""}" title="Resumo para a reunião: quadro, contratações por jornada, horários e andamento">${icPainel}Painel da mudança</button>
      <button type="button" data-acao="modo" data-v="orcado" class="${m === "orcado" ? "ativo" : ""}" title="Organograma do QL Orçado e quantas pessoas cada jornada pede">${icOrc}QL Orçado x 5x2</button>
    </div>`;
  const total = est.estrutura.reduce((s2, x) => s2 + x.n, 0);
  const depts = `<div class="depts">
      <button type="button" data-acao="modo" data-v="total" class="dep dep-total${m === "total" ? " ativo" : ""}" title="Todos os departamentos juntos: quantos trabalham em cada dia">${icTot}Total <span class="qtd">${total}</span></button>
      ${est.estrutura.map((dp) => `<button type="button" data-acao="dept" data-dept="${esc(dp.dept)}" class="dep${m === "escala" && dp.dept === cur?.dept ? " ativo" : ""}">${esc(titulo(dp.dept))} <span class="qtd">${dp.n}</span>${sujoDept(dp.dept) ? "<span class='qtd'>•</span>" : salvosDept(dp.dept) ? "<span class='salvo'>✓</span>" : ""}</button>`).join("")}
    </div>`;
  const nav = `<div class="navegacao nao-imprime"><div class="nav-linha"><span class="nav-rot">Visões</span>${visoesGerais}</div><div class="nav-linha"><span class="nav-rot">Departamentos</span>${depts}</div></div>`;
  if (m !== "escala") return nav;
  const dp = est.estrutura.find((x) => x.dept === cur.dept);
  const chips = dp ? [[chaveSetor(dp.dept), "Todas as funções", dp.n], ...dp.funcoes.map((f) => [chaveSetor(dp.dept, f.f), titulo(f.f), f.n])] : [];
  const linhaF = chips.map(([k, r, n]) => `<button type="button" data-acao="setor" data-setor="${esc(k)}" class="chip-setor${k === est.setor ? " ativo" : ""}">${esc(r)} <span class="qtd">${n}</span>${marcasSetor(k)}</button>`).join("");
  // botões de aviso: ! amarelo = mudanças no quadro do Senior · ! vermelho = o que precisa de atenção
  const nSync = partesSync(p).length, nAt = an ? itensAtencao(p, an).length : 0;
  const bts = `<div class="avisos-bts">
      ${nSync ? `<button type="button" class="bt-aviso amarelo${est.aberto === "sync" ? " ativo" : ""}" data-acao="abrir-aviso" data-v="sync" title="Mudanças no quadro do Senior">!</button>` : ""}
      ${nAt ? `<button type="button" class="bt-aviso vermelho${est.aberto === "atencao" ? " ativo" : ""}" data-acao="abrir-aviso" data-v="atencao" title="O que precisa de atenção">!<em>${nAt}</em></button>` : `<span class="bt-aviso ok" title="Nada precisa de atenção">✓</span>`}
    </div>`;
  return `${nav}<div class="funcoes nao-imprime"><span class="texto-fraco">Montar a escala de:</span>${linhaF}${bts}</div>
    <h2 class="titulo-impressao">${esc(nomeLoja(est.loja))} · ${esc(infoSetor(est.setor).rotulo)}</h2>`;
}

// ============================================================
// VISÃO TOTAL: todos os departamentos juntos (quantos trabalham em cada dia)
// Cada departamento usa a escala salva dele: o departamento inteiro, ou as funções salvas
// separadas. Departamento sem escala salva entra com a sugestão automática (marcado "sugestão").
// ============================================================
function setoresDoDept(dept) {
  const salvos = est.dados.planos.map((x) => x.setor).filter((k) => lerChave(k)?.dept === dept);
  const abertos = Object.keys(est.planos).filter((k) => est.planos[k].sujo && lerChave(k)?.dept === dept);
  const todos = [...new Set([...salvos, ...abertos])];
  if (todos.includes(chaveSetor(dept))) return [chaveSetor(dept)];
  return todos.length ? todos : [chaveSetor(dept)];
}
function htmlTotal() {
  const base = plano();
  const dias = M.datasDoPlano(base);
  const semanasVis = est.verSemana === "todas" ? [...Array(base.semanas).keys()] : [+est.verSemana];
  const vis = dias.filter((d) => semanasVis.includes(d.semana));
  const linhas = [];
  est.silencioso = true;
  try {
    for (const dp of est.estrutura) {
      const ks = setoresDoDept(dp.dept);
      const porData = {};
      let pessoas = 0, avisos = 0, faltas = 0, salvo = true, sujo = false;
      for (const k of ks) {
        const reg = garantirPlano(k);
        const pes = ativos(reg.p);
        const an = M.analisar(reg.p, pes);
        pessoas += pes.length; avisos += an.avisos.length; faltas += an.faixasAbaixo;
        for (const x of an.porDia) porData[x.iso] = (porData[x.iso] || 0) + x.trab;
        if (!est.dados.planos.some((y) => y.setor === k)) salvo = false;
        if (reg.sujo) sujo = true;
      }
      const parcial = ks.length && !ks.includes(chaveSetor(dp.dept)) ? ks.map((k) => titulo(lerChave(k).funcao)).join(", ") : "";
      linhas.push({ dp, ks, porData, pessoas, avisos, faltas, salvo, sujo, parcial });
    }
  } finally { est.silencioso = false; }
  const tot = {};
  for (const l of linhas) for (const d of vis) tot[d.iso] = (tot[d.iso] || 0) + (l.porData[d.iso] ?? 0);
  const totPes = linhas.reduce((s2, l) => s2 + l.pessoas, 0);

  let cabSem = `<tr class="cab-sem"><th class="col-nome" rowspan="2">Departamento</th>`;
  for (const w of semanasVis) cabSem += `<th colspan="7" class="ini-sem">Semana ${w + 1} · ${M.dataCurta(dias[w * 7].d)}–${M.dataCurta(dias[w * 7 + 6].d)}</th>`;
  cabSem += `<th class="col-h" rowspan="2">Situação</th></tr>`;
  const hojeISO = est.hoje ? M.iso(est.hoje) : "";
  const cabDia = `<tr class="cab-dia">${vis.map((d) => `<th class="${d.dow === 0 ? "dom ini-sem" : ""}${d.iso === hojeISO ? " hoje" : ""}">${d.d.getUTCDate()}<small>${M.DOW[d.dow].slice(0, 3)}</small></th>`).join("")}</tr>`;
  const celDia = (d, v) => `<td class="${d.dow === 0 ? "ini-sem dom" : ""}">${v ?? "—"}</td>`;
  const total = `<tr class="total topo"><td class="col-nome"><b>Trabalhando no dia</b><small>${totPes} pessoas na escala</small></td>${vis.map((d) => celDia(d, tot[d.iso])).join("")}<td class="col-h"></td></tr>`;
  const corpo = linhas.map((l) => {
    const sit = l.sujo ? `<span class="chip">não salva</span>` : l.salvo ? `<span class="chip ok">salva</span>` : `<span class="chip sug">sugestão</span>`;
    const alerta = l.avisos || l.faltas ? `<span class="chip ruim" title="${l.avisos} aviso(s) de regra · ${l.faltas} faixa(s) de 15 min abaixo do mínimo">${l.avisos + (l.faltas ? 1 : 0)} !</span>` : "";
    return `<tr class="linha-dept" data-acao="dept" data-dept="${esc(l.dp.dept)}" title="Abrir ${esc(titulo(l.dp.dept))}"><td class="col-nome"><b>${esc(titulo(l.dp.dept))}</b><small>${l.pessoas} na escala${l.parcial ? ` · só ${esc(l.parcial)}` : ""}</small></td>${vis.map((d) => celDia(d, l.porData[d.iso])).join("")}<td class="col-h sit">${sit}${alerta}</td></tr>`;
  }).join("");
  return `<section class="cartao cartao-escala">
    <div class="cartao-cab"><div><h2>Total da loja · todos os departamentos</h2><p class="sub">Quantas pessoas trabalham em cada dia, somando a escala de cada departamento (a salva; sem escala salva entra a sugestão automática). Clique num departamento para abrir a escala dele.</p></div>
      <div class="ferramentas nao-imprime"><label class="campo"><span>Mostrar</span><select class="ent" data-acao-change="ver-semana">${opcoes([["todas", "Todas as semanas"], ...[...Array(base.semanas).keys()].map((w) => [w, `Semana ${w + 1}`])], est.verSemana)}</select></label></div></div>
    <div class="rolagem" data-rolagem="total"><table class="escala total-loja${vis.length > 35 ? " compacta" : ""}"><thead>${cabSem}${cabDia}</thead><tbody>${total}${corpo}</tbody></table></div>
  </section>`;
}

// conteúdo do botão aberto (fica embaixo da linha das funções)
function htmlAberto(p, an) {
  if (est.aberto === "sync") {
    const partes = partesSync(p);
    if (!partes.length) return "";
    return `<div class="aviso-topo nao-imprime"><button type="button" class="fechar" data-acao="abrir-aviso" data-v="" title="Fechar">✕</button>${partes.join("")}</div>`;
  }
  if (est.aberto === "atencao") return htmlAlertas(p, an);
  // "ninguém na escala" continua sempre visível: sem isso a tela fica vazia sem explicação
  if (!ativos(p).length) return `<div class="aviso-topo nao-imprime">${partesSync(p).filter((x) => x.includes("Ninguém na escala")).join("")}</div>`;
  return "";
}

function partesSync(p) {
  const s = est.sync[est.setor];
  const fora = p.pessoas.filter((x) => x.fora);
  const partes = [];
  if (s?.novos?.length) partes.push(`<span><b>Entraram do QL:</b> ${esc(s.novos.join(", "))} — clique em Redistribuir para encaixar.</span>`);
  if (fora.length) partes.push(`<span><b>Não estão mais no quadro do Senior (fora da escala):</b> ${esc(fora.map((x) => x.nome).join(", "))}</span>`);
  if (!ativos(p).length) partes.push(`<span>Ninguém na escala em <b>${esc(infoSetor(est.setor).rotulo)}</b>${p.pessoas.length ? " (quem está aqui é ART 62 / aprendiz ou foi tirado da escala)" : ""}. Veja a aba Pessoas ou adicione uma pessoa extra.</span>`);
  return partes;
}

function htmlKpis(p, pessoas, an) {
  const n = pessoas.length;
  const doms = an.porDia.filter((x) => x.dow === 0), semana = an.porDia.filter((x) => x.dow !== 0);
  const mediaDom = doms.length ? doms.reduce((s, x) => s + x.trab, 0) / doms.length : 0;
  const mediaDia = semana.length ? semana.reduce((s, x) => s + x.trab, 0) / semana.length : 0;
  const hoje6x1 = n ? (n * 6 - mediaDom) / 6 : 0;
  const diasSem = an.porDia.reduce((s, x) => s + x.trab, 0) / p.semanas;
  const horas = pessoas.flatMap((pe) => an.horas[pe.id].map((h) => h.min));
  const mediaH = horas.length ? horas.reduce((s, x) => s + x, 0) / horas.length : 0;
  // quantas pessoas a mais resolveriam o pior buraco (maior falta num mesmo horário)
  const piorFalta = Math.max(0, ...an.porDia.map((x) => Math.max(0, ...x.min.map((m, k) => m - x.cov[k]))));
  return `<section class="kpis">
    <div class="kpi"><div class="rot">Pessoas</div><div class="val">${n}</div><div class="det">${num1(mediaDom)} no domingo (média)</div></div>
    <div class="kpi"><div class="rot">Por dia, seg a sáb</div><div class="val">${num1(mediaDia)}</div><div class="det">no 6x1 seria ~${num1(hoje6x1)} (${num1(mediaDia - hoje6x1)})</div></div>
    <div class="kpi"><div class="rot">Dias trabalhados/sem</div><div class="val">${Math.round(diasSem)}<small>de ${n * 6}</small></div><div class="det${n * 6 - diasSem > 0 ? " ruim" : ""}">perde ${Math.round(n * 6 - diasSem)} dia(s)/semana</div></div>
    <div class="kpi"><div class="rot">Horas médias</div><div class="val">${M.fmtDur(Math.round(mediaH))}</div><div class="det">limite ${p.cenario}h por semana</div></div>
    <div class="kpi${an.faixasAbaixo ? " kpi-ruim" : " kpi-bom"}"><div class="rot">Cobertura</div><div class="val">${an.faixasAbaixo ? `${an.faixasAbaixo}<small>faixas</small>` : "OK"}</div><div class="det">${an.faixasAbaixo ? `abaixo do mínimo · pior buraco: falta ${piorFalta}` : "nenhum horário abaixo do mínimo"}</div></div>
  </section>`;
}

function itensAtencao(p, an) {
  const itens = [];
  const acima8 = +p.cenario !== 44 ? p.turnos.filter((t) => t.jornadaMin > 480) : [];
  if (acima8.length) itens.push(`<div class="alerta aviso"><span class="selo">CLT</span><span>Jornada acima de 8h por dia no ${p.cenario}h (${[...new Set(acima8.map((t) => M.fmtDur(t.jornadaMin)))].join(", ")}): precisa de acordo de compensação de horas — confirmar com o DP.</span></div>`);
  for (const pr of an.problemas) {
    const ex = pr.faixas.slice(0, 2).join(", ") + (pr.faixas.length > 2 ? "…" : "");
    itens.push(`<button type="button" class="alerta" data-acao="ir-problema" data-w="${pr.primeiraSemana}"><span class="selo">${M.DOW[pr.dow]}</span><span>falta gente em <b>${pr.semanas}/${pr.total}</b> sem. · ${esc(ex)}${pr.pior > 1 ? ` · falta até ${pr.pior}` : ""}</span></button>`);
  }
  const porPessoa = new Map();
  for (const a of an.avisos) { if (!porPessoa.has(a.pid)) porPessoa.set(a.pid, { nome: a.nome, txt: [] }); porPessoa.get(a.pid).txt.push(a.txt); }
  for (const [, v] of porPessoa) itens.push(`<button type="button" class="alerta aviso" data-acao="visao" data-v="escala"><span class="selo">Regra</span><span><b>${esc(v.nome)}:</b> ${esc(v.txt.join(" · "))}</span></button>`);
  return itens;
}
function htmlAlertas(p, an) {
  const itens = itensAtencao(p, an);
  if (!itens.length) itens.push(`<div class="alerta ok"><span class="selo">OK</span><span>Tudo certo: cobertura acima do mínimo e todo mundo dentro das regras (${M.folgasSemana(p.cenario)} folga(s) por semana, ${p.cenario}h, até 6 dias seguidos, até ${p.domingosSeguidosMax} domingos seguidos).</span></div>`);
  const LIM = 6;
  const mostrar = est.mostrarTodosAlertas ? itens : itens.slice(0, LIM);
  return `<section class="cartao atencao">
    <div class="atencao-cab"><h2>O que precisa de atenção</h2><div>${itens.length > LIM ? `<button class="btn btn-peq btn-borda nao-imprime" data-acao="mais-alertas">${est.mostrarTodosAlertas ? "Menos" : `Ver todos (${itens.length})`}</button>` : ""} <button type="button" class="fechar" data-acao="abrir-aviso" data-v="" title="Fechar">✕</button></div></div>
    <div class="alertas">${mostrar.join("")}</div>
  </section>`;
}

// passo a passo para montar a escala (cada passo leva para a aba certa)
function htmlRoteiro(p, an) {
  const pessoas = ativos(p);
  // mesmo horário de almoço para 3+ pessoas do turno só é problema se a cobertura está faltando
  const almocosIguais = an.faixasAbaixo > 0 && p.turnos.some((t) => {
    const cont = {};
    for (const x of pessoas.filter((y) => y.turno === t.id)) { const k = M.almocoDe(t, x); cont[k] = (cont[k] || 0) + 1; }
    return Object.values(cont).some((n) => n >= 3);
  });
  const passos = [
    ["regras", "1", "Conferir turnos e horário da loja", `${p.turnos.length} turno(s)`],
    ["pessoas", "2", "Turno e domingo de cada pessoa", `${pessoas.length} na escala`],
    ["regras", "3", "Mínimo de pessoas no posto", `mín. ${p.minimos.geral} · ${p.minimos.faixas.length} faixa(s)`],
    ["auto", "4", "Redistribuir folgas", "rodízio e folgas"],
    ["almoco", "5", "Escalonar almoços", almocosIguais ? "almoços juntos" : "ok"],
    ["cobertura", "6", "Conferir a cobertura", an.faixasAbaixo ? `${an.faixasAbaixo} faixa(s) em falta` : "sem falta"],
  ];
  return `<div class="roteiro nao-imprime">${passos.map(([alvo, n, r, s]) => {
    const ruim = (n === "5" && almocosIguais) || (n === "6" && an.faixasAbaixo);
    return `<button type="button" data-acao="passo" data-alvo="${alvo}" class="${ruim ? "ruim" : ""}"><i>${n}</i><span><b>${r}</b><small>${esc(s)}</small></span></button>`;
  }).join("")}</div>`;
}

function htmlEscala(p, pessoas, an) {
  const todos = an.dias;
  const semanasVis = est.verSemana === "todas" ? [...Array(p.semanas).keys()] : [+est.verSemana];
  const dias = todos.filter((d) => semanasVis.includes(d.semana));
  const fim = M.somaDias(M.lerISO(p.inicio), p.semanas * 7 - 1);
  const totTravas = Object.values(p.travas).reduce((s, o) => s + Object.keys(o).length, 0);
  const hojeISO = est.hoje ? M.iso(est.hoje) : "";
  const porFuncao = !lerChave(est.setor)?.funcao;
  const nCols = dias.length + semanasVis.length + 1;

  let cabSem = `<tr class="cab-sem"><th class="col-nome" rowspan="2">Nome · almoço</th>`;
  for (const w of semanasVis) {
    const a = todos[w * 7].d, b = todos[w * 7 + 6].d;
    cabSem += `<th colspan="7" class="ini-sem">Semana ${w + 1} · ${M.dataCurta(a)}–${M.dataCurta(b)}</th>`;
  }
  cabSem += `<th class="col-h" colspan="${semanasVis.length}">Horas</th></tr>`;
  const cabDia = `<tr class="cab-dia">${dias.map((d) => `<th class="${d.dow === 0 ? "dom ini-sem" : ""}${d.iso === hojeISO ? " hoje" : ""}">${d.d.getUTCDate()}<small>${M.DOW[d.dow].slice(0, 3)}</small></th>`).join("")}${semanasVis.map((w) => `<th class="col-h">S${w + 1}</th>`).join("")}</tr>`;

  const avisosP = new Set(an.avisos.map((a) => a.pid));
  const linhaPessoa = (pe) => {
    const t = M.turnoDe(p, pe);
    const tr = p.travas[pe.id] || {};
    const alm = t && t.almocoMin ? M.fmtHM(M.almocoDe(t, pe)) : "—";
    const cels = dias.map((d) => {
      const v = M.valor(p, pe.id, d);
      const tit = v === "T" ? `${t?.entrada}–${t ? M.fmtHM(M.saidaTurno(t)) : ""} · almoço ${alm}` : v === "D" ? `Domingo ${M.horarioPessoa(p, pe, 0, "D")}` : v === "F" ? "Folga" : "Ausente (falta/férias/atestado)";
      return `<td class="${d.dow === 0 ? "ini-sem" : ""}"><button type="button" class="cel ${v}${tr[d.iso] ? " trava" : ""}" data-cel="${esc(pe.id)}|${d.iso}" title="${esc(pe.nome + " · " + M.DOW_LONGO[d.dow] + " " + M.dataCurta(d.d) + " · " + tit)}">${v}</button></td>`;
    }).join("");
    const hs = semanasVis.map((w) => { const h = an.horas[pe.id][w]; return `<td class="col-h${h.acima ? " acima" : h.poucaFolga || h.muitaFolga ? " folga" : ""}">${M.fmtDur(h.min)}</td>`; }).join("");
    const sub = [alm !== "—" ? `alm ${alm}` : "", pe.funcao ? titulo(pe.funcao) : "", pe.ferias ? "férias no QL" : ""].filter(Boolean).join(" · ");
    const hc = horarioNoCenario(p, pe);
    const sub2 = [hc.txt, textoDSR(pe)].filter(Boolean).join(" · ");
    return `<tr class="${avisosP.has(pe.id) ? "linha-aviso " : ""}${pe.origem === "extra" ? "coringa" : ""}"><td class="col-nome"><b title="${esc(pe.nome)}">${esc(pe.nome)}</b><small>${esc(sub)}</small>${sub2 ? `<small class="senior" title="${esc([hc.tit, textoDSR(pe)].filter(Boolean).join(" · "))}">${esc(sub2)}</small>` : ""}</td>${cels}${hs}</tr>`;
  };

  // agrupa por turno; a linha do turno mostra quantos dele trabalham em cada dia
  let corpo = "";
  for (const t of p.turnos) {
    const grupo = pessoas.filter((pe) => (M.turnoDe(p, pe)?.id) === t.id);
    if (!grupo.length) continue;
    const contagem = dias.map((d) => `<td class="${d.dow === 0 ? "ini-sem dom" : ""}">${grupo.filter((pe) => M.trabalha(M.valor(p, pe.id, d))).length}</td>`).join("");
    corpo += `<tr class="grupo"><td class="col-nome"><b>${esc(t.nome)}</b><small>${t.entrada}–${M.fmtHM(M.saidaTurno(t))} · ${grupo.length} pessoa(s)</small></td>${contagem}<td class="col-h" colspan="${semanasVis.length}"></td></tr>`;
    corpo += grupo.map(linhaPessoa).join("");
  }
  const totalDias = an.porDia.filter((x) => semanasVis.includes(x.semana));
  const total = `<tr class="total topo"><td class="col-nome"><b>Trabalhando no dia</b></td>${totalDias.map((x) => `<td class="${x.dow === 0 ? "ini-sem dom " : ""}${x.abaixo ? "baixo" : ""}" title="${x.abaixo ? `${x.abaixo} faixa(s) de 15 min abaixo do mínimo` : "cobertura ok"}">${x.trab}</td>`).join("")}<td class="col-h" colspan="${semanasVis.length}"></td></tr>`;

  return `<section class="cartao cartao-escala">
    <div class="barra-ferramentas nao-imprime">
      <div class="grupo-ferr">
        <label class="campo"><span>Início (domingo)</span><input type="date" class="ent" value="${p.inicio}" data-acao-change="inicio"></label>
        <label class="campo"><span>Semanas</span><select class="ent" data-acao-change="semanas">${opcoes([1, 2, 3, 4, 5, 6, 7, 8].map((x) => [x, x]), p.semanas)}</select></label>
        <label class="campo"><span>Mostrar</span><select class="ent" data-acao-change="ver-semana">${opcoes([["todas", "Todas as semanas"], ...[...Array(p.semanas).keys()].map((w) => [w, `Semana ${w + 1}`])], est.verSemana)}</select></label>
      </div>
      <div class="grupo-ferr">
        <button class="btn btn-primario" data-acao="redistribuir">Redistribuir folgas</button>
        <button class="btn btn-borda" data-acao="escalonar" title="Espalha os almoços de quem é do mesmo turno para não abrir buraco">Escalonar almoços</button>
        ${totTravas ? `<button class="btn btn-borda" data-acao="destravar" title="Remove os ajustes feitos à mão">Desfazer ajustes (${totTravas})</button>` : ""}
        <button class="btn btn-borda" data-acao="csv">Planilha</button>
      </div>
    </div>
    <p class="sub nao-imprime">Escala de ${M.dataBR(M.lerISO(p.inicio))} a ${M.dataBR(fim)}. Clique numa célula para trocar (T = trabalha → F → X). As folgas vão para os dias de menor movimento (pesos na aba Turnos e mínimos); o domingo é em rodízio.</p>
    <div class="rolagem" data-rolagem="escala"><table class="escala${dias.length > 35 ? " compacta" : ""}"><thead>${cabSem}${cabDia}</thead><tbody>${total}${corpo}</tbody></table></div>
    <div class="legenda"><span><i class="cel T">T</i>trabalha</span><span><i class="cel F">F</i>folga</span><span><i class="cel D">D</i>domingo (jornada normal)</span><span><i class="cel X">X</i>ausente (falta/férias/atestado)</span><span><i class="cel trava" style="width:20px;height:20px"></i>ajustado à mão</span><span class="texto-fraco">Linha azul = turno e quantos dele trabalham no dia · Horas = jornada da pessoa · laranja = semana sem ${M.folgasSemana(p.cenario)} folga(s) · vermelho = acima de ${p.cenario}h</span></div>
  </section>`;
}

function htmlMapa(p, an) {
  const w = est.semanaMapa;
  const dias = an.porDia.slice(w * 7, w * 7 + 7);
  const { ini, n } = an.jan;
  let cab = "<tr><th class='dia'></th>";
  for (let k = 0; k < n; k++) { const t = ini + k * M.PASSO; cab += `<th>${t % 60 === 0 ? `${Math.floor(t / 60)}h` : ""}</th>`; }
  cab += "<th class='res'>Falta</th></tr>";
  const linha = (rot, valores, cls) => `<tr class="${cls || ""}"><th class="dia">${rot}</th>${valores}</tr>`;
  const linhas = dias.map((x) => {
    let tds = "", minRow = "";
    for (let k = 0; k < n; k++) {
      const t = ini + k * M.PASSO, c = x.cov[k], m = x.min[k];
      const cls = m === 0 && c === 0 ? "vazio" : c < m ? "falta" : c === m ? "ok" : "sobra";
      tds += `<td class="${cls}${t % 60 === 0 ? " hora" : ""}" title="${M.DOW[x.dow]} ${M.fmtHM(t)}: ${c} no posto · mínimo ${m}">${cls === "vazio" ? "" : c}</td>`;
      minRow += `<td class="minimo${t % 60 === 0 ? " hora" : ""}">${m || ""}</td>`;
    }
    return linha(`${M.DOW[x.dow]} ${x.d.getUTCDate()}`, tds + `<td class="res${x.abaixo ? " ruim" : ""}">${x.abaixo ? `${x.abaixo}×15'` : "—"}</td>`)
      + (est.mostrarMinimo ? linha("mín.", minRow + "<td></td>", "linha-min") : "");
  }).join("");
  const botoes = Array.from({ length: p.semanas }, (_, i) => {
    const ruim = an.porDia.slice(i * 7, i * 7 + 7).some((x) => x.abaixo);
    const a = an.porDia[i * 7].d, b = an.porDia[i * 7 + 6].d;
    return `<button type="button" data-acao="semana-mapa" data-w="${i}" class="${i === w ? "ativo" : ""}${ruim ? " ruim" : ""}">S${i + 1} · ${M.dataCurta(a)}–${M.dataCurta(b)}</button>`;
  }).join("");
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Mapa de cobertura</h2><p class="sub">Pessoas no posto a cada 15 minutos, já descontando o almoço. <span class="lg falta"></span> abaixo do mínimo · <span class="lg ok"></span> no mínimo · <span class="lg sobra"></span> acima.</p></div>
      <div class="ferr-mapa nao-imprime"><label class="texto-fraco"><input type="checkbox" data-acao-change="mostrar-minimo"${est.mostrarMinimo ? " checked" : ""}> mostrar o mínimo de cada horário</label>
      <button class="btn btn-peq btn-borda" data-acao="escalonar">Escalonar almoços</button></div></div>
    <div class="semanas-mapa nao-imprime">${botoes}</div>
    <div class="rolagem" data-rolagem="mapa" style="border:0;margin-top:12px"><table class="mapa"><thead>${cab}</thead><tbody>${linhas}</tbody></table></div>
  </section>`;
}

function htmlTurnos(p) {
  const optJ = (v) => opcoes([...new Set([...OPC_JORNADA, v])].sort((a, b) => a - b).map((m) => [m, M.fmtDur(m)]), v);
  const optA = (v) => opcoes([...new Set([...OPC_ALMOCO, v])].sort((a, b) => a - b).map((m) => [m, m ? M.fmtDur(m).replace(/^0h/, "") : "sem"]), v);
  const usando = (id) => p.pessoas.filter((x) => !x.fora && x.turno === id).length;
  const linhas = p.turnos.map((t, i) => `<tr>
    <td><input class="ent nome-in" value="${esc(t.nome)}" data-bind="turnos.${i}.nome"></td>
    <td><input type="time" class="ent hora" value="${t.entrada}" data-bind="turnos.${i}.entrada"></td>
    <td><input type="time" class="ent hora" value="${t.almoco}" data-bind="turnos.${i}.almoco"></td>
    <td><select class="ent" data-bind="turnos.${i}.almocoMin" data-tipo="num">${optA(t.almocoMin)}</select></td>
    <td><select class="ent" data-bind="turnos.${i}.jornadaMin" data-tipo="num">${optJ(t.jornadaMin)}</select></td>
    <td class="saida">${M.fmtHM(M.saidaTurno(t))}</td>
    <td class="texto-fraco mono">${t.hoje ? `${t.hoje.entrada}–${M.fmtHM(M.hm(t.hoje.entrada) + t.hoje.jornadaMin + t.almocoMin)} · ${M.fmtDur(t.hoje.jornadaMin)}` : "—"}</td>
    <td class="texto-fraco">${usando(t.id)}</td>
    <td><button class="btn-x" data-acao="rm-turno" data-id="${t.id}" title="Remover turno">✕</button></td></tr>`).join("");
  const fu = p.funcionamento;
  const hor = (rot, k) => `<div class="linha-config"><b>${rot}:</b> <input type="time" class="ent hora" value="${fu[k][0]}" data-bind="funcionamento.${k}.0"> às <input type="time" class="ent hora" value="${fu[k][1]}" data-bind="funcionamento.${k}.1"></div>`;
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Turnos</h2><p class="sub">A saída é calculada: entrada + jornada + almoço. No 44h vale o horário de hoje (Excel); no 42h/40h a jornada do dia aumenta (as horas da semana de hoje ÷ 5, até o limite do cenário) e a hora a mais entra no fim do turno.</p></div></div>
    <div class="rolagem-conf"><table class="conf"><thead><tr><th>Turno</th><th>Entrada</th><th>Almoço</th><th>Duração</th><th>Jornada</th><th>Saída</th><th title="Horário de hoje (6x1), do Excel">Hoje</th><th>Pessoas</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
    <p><button class="btn btn-peq btn-borda nao-imprime" data-acao="add-turno">+ Turno</button></p>
    <h3 class="sub-titulo">Horário da loja <small class="texto-fraco">(usado no mapa de cobertura e nos mínimos — as horas de cada pessoa seguem a jornada dela)</small></h3>
    ${hor("Loja aberta seg a sex", "segsab")}
    ${hor("Sábado", "sab")}
    <div class="linha-config"><b>Domingo:</b> ${fu.dom ? `<input type="time" class="ent hora" value="${fu.dom[0]}" data-bind="funcionamento.dom.0"> às <input type="time" class="ent hora" value="${fu.dom[1]}" data-bind="funcionamento.dom.1">` : `<span class="texto-fraco">não abre</span>`}
      <label class="texto-fraco"><input type="checkbox" data-acao-change="dom-fechado"${fu.dom ? "" : " checked"}> fechado no domingo</label>
      <span class="texto-fraco">· no domingo cada pessoa faz a jornada normal dela; turno que passa do horário é puxado para mais cedo</span></div>
    <p><button class="btn btn-peq btn-borda nao-imprime" data-acao="horario-padrao" title="Volta para o horário oficial desta loja">Usar horário padrão da loja</button></p>
    <div class="linha-config"><b>Movimento do dia</b> <span class="texto-fraco">(1 = fraco · 5 = forte — a folga vai para os dias mais fracos)</span></div>
    <div class="pesos">${[1, 2, 3, 4, 5, 6].map((dw) => `<label>${M.DOW[dw]} <select data-bind="pesos.${dw}" data-tipo="num">${opcoes([[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]], p.pesos[dw])}</select></label>`).join("")}</div>
    <div class="linha-config"><b>Dia sem folga:</b> ${[1, 2, 3, 4, 5, 6].map((dw) => `<label class="texto-fraco"><input type="checkbox" data-acao-change="sem-folga" data-dow="${dw}"${(p.diasSemFolga || []).includes(dw) ? " checked" : ""}> ${M.DOW[dw]}</label>`).join(" ")} <span class="texto-fraco">· o motor não coloca folga nesses dias (DSR nesses dias passa para o outro dia de semana do DSR; se não tiver outro, fica)</span></div>
  </section>`;
}

function htmlMinimos(p) {
  const optDias = Object.entries(M.GRUPOS_DIAS).map(([k, g]) => [k, g.rotulo]);
  const linhas = p.minimos.faixas.map((f, i) => `<tr>
    <td><select class="ent" data-bind="minimos.faixas.${i}.dias">${opcoes(optDias, f.dias)}</select></td>
    <td><input type="time" class="ent hora" value="${f.de}" data-bind="minimos.faixas.${i}.de"></td>
    <td><input type="time" class="ent hora" value="${f.ate}" data-bind="minimos.faixas.${i}.ate"></td>
    <td><input type="number" min="0" max="60" class="ent num" value="${f.min}" data-bind="minimos.faixas.${i}.min" data-tipo="num"></td>
    <td><button class="btn-x" data-acao="rm-faixa" data-i="${i}" title="Remover faixa">✕</button></td></tr>`).join("");
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Mínimo de pessoas no posto</h2><p class="sub">Vale o mínimo geral no horário da loja. Uma faixa vale no lugar da geral naquele horário (ex.: abre com 2, reforça às 9h e no almoço).</p></div></div>
    <div class="linha-config"><b>Mínimo geral (seg a sáb):</b> <input type="number" min="0" max="60" class="ent num" value="${p.minimos.geral}" data-bind="minimos.geral" data-tipo="num"> pessoas</div>
    <div class="rolagem-conf" style="margin-top:10px"><table class="conf"><thead><tr><th>Dias</th><th>De</th><th>Até</th><th>Mínimo</th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="5" class="texto-fraco">Nenhuma faixa. Só o mínimo geral está valendo.</td></tr>`}</tbody></table></div>
    <p><button class="btn btn-peq btn-borda nao-imprime" data-acao="add-faixa">+ Faixa de mínimo</button></p>
    <div class="linha-config"><b>Domingo, mínimo no posto:</b> <input type="number" min="0" max="60" class="ent num" value="${p.domingo.minimo}" data-bind="domingo.minimo" data-tipo="num"> pessoas</div>
    <div class="linha-config"><b>Domingos seguidos, no máximo:</b> <input type="number" min="1" max="8" class="ent num" value="${p.domingosSeguidosMax}" data-bind="domingosSeguidosMax" data-tipo="num"> <span class="texto-fraco">(comércio: folga em pelo menos 1 domingo a cada 3 semanas)</span></div>
  </section>`;
}

function htmlPessoas(p) {
  const optT = p.turnos.map((t) => [t.id, `${t.nome} (${t.entrada})`]);
  const optDom = [["rodizio", "Rodízio"], ["nunca", "Nunca"], ["sempre", "Sempre"]];
  const optFolga = [["", "—"], ...[1, 2, 3, 4, 5, 6].map((d) => [d, M.DOW_LONGO[d]])];
  const linhas = p.pessoas.map((pe, i) => {
    if (pe.fora) return `<tr><td><b>${esc(pe.nome)}</b></td><td><span class="chip fora">fora do quadro do Senior</span></td><td colspan="8" class="texto-fraco">Não entra na escala.</td></tr>`;
    const chip = (pe.semEscala ? `<span class="chip fora">${esc(pe.semEscala)}</span> ` : "") + (lerChave(est.setor)?.funcao || !pe.funcao ? "" : `<span class="chip">${esc(titulo(pe.funcao))}</span> `) + (pe.origem === "extra" ? `<span class="chip extra">extra</span>` : pe.ferias ? `<span class="chip ferias">${esc(titulo(pe.sit))}</span>` : `<span class="chip">${esc(titulo(pe.sit || "Ativo"))}</span>`);
    const nome = pe.origem === "extra" ? `<input class="ent nome-in" value="${esc(pe.nome)}" data-bind="pessoas.${i}.nome">` : `<b>${esc(pe.nome)}</b>`;
    return `<tr>
      <td>${nome}</td>
      <td>${chip}<div class="texto-fraco mono" title="Horário no Senior">${esc(pe.senior || "")}</div></td>
      <td><select class="ent" data-bind="pessoas.${i}.turno">${opcoes(optT, pe.turno)}</select></td>
      <td>${almocoSel(p, pe, i)}</td>
      <td><select class="ent" data-bind="pessoas.${i}.domingo">${opcoes(optDom, pe.domingo)}</select></td>
      <td><select class="ent" data-bind="pessoas.${i}.folgaFixa" data-tipo="numnull">${opcoes(optFolga, pe.folgaFixa ?? "")}</select></td>
      <td><select class="ent" data-bind="pessoas.${i}.folgaFixa2" data-tipo="numnull">${opcoes(optFolga, pe.folgaFixa2 ?? "")}</select></td>
      <td class="texto-fraco">${pe.dsr ? `${esc(textoDSR(pe))}${pe.dsrAuto === false ? ` <button class="btn-link" data-acao="usar-dsr" data-id="${esc(pe.id)}" title="Volta domingo e folgas para o que está no DSR do Excel">usar DSR</button>` : ""}` : "—"}</td>
      <td><label class="texto-fraco"><input type="checkbox" ${pe.ativo !== false ? "checked" : ""} data-bind="pessoas.${i}.ativo" data-tipo="bool"> na escala</label></td>
      <td>${pe.origem === "extra" ? `<button class="btn-x" data-acao="rm-extra" data-id="${esc(pe.id)}" title="Remover">✕</button>` : ""}</td></tr>`;
  }).join("");
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Pessoas e regras</h2><p class="sub">Vêm do Quadro de Lotação (quadro do Senior: ${esc(infoSetor(est.setor).rotulo)}, ativos da loja). Escolha o turno de cada uma, a regra do domingo e a folga fixa — já vêm preenchidas pelo DSR do Banco QL.xlsx (DSR1 Domingo = não trabalha domingo; dia de semana = folga fixa). Mudou à mão, vale o que você escolheu. Pessoa extra = coringa, vaga em aberto ou contratação nova.</p></div>
      <div class="ferramentas nao-imprime"><button class="btn btn-borda" data-acao="recarregar" title="Busca de novo o quadro do QL">Atualizar do QL</button><button class="btn btn-borda" data-acao="add-extra">+ Pessoa extra</button></div></div>
    <div class="rolagem-conf"><table class="conf"><thead><tr><th>Nome</th><th>Situação · horário Senior</th><th>Turno</th><th>Almoço</th><th>Domingo</th><th>Folga fixa</th><th title="Folga preferida quando a pessoa precisa de mais uma folga na semana">2ª folga</th><th title="Os 2 principais dias de folga (DSR1 + DSR2 do Banco QL.xlsx)">DSR</th><th></th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="10" class="texto-fraco">Ninguém neste setor.</td></tr>`}</tbody></table></div>
  </section>`;
}

function almocoSel(p, pe, i) {
  const t = M.turnoDe(p, pe);
  if (!t || !t.almocoMin) return `<span class="texto-fraco">—</span>`;
  const lim = M.limitesAlmoco(t);
  const ops = [];
  for (let aj = -90; aj <= 90; aj += 15) {
    const ini = M.hm(t.almoco) + aj;
    if ((ini < lim.min || ini > lim.max) && aj !== (+pe.almocoAjuste || 0)) continue;
    ops.push([aj, `${M.fmtHM(ini)}${aj ? ` (${aj > 0 ? "+" : ""}${aj}')` : " (do turno)"}`]);
  }
  return `<select class="ent" data-bind="pessoas.${i}.almocoAjuste" data-tipo="int">${opcoes(ops, +pe.almocoAjuste || 0)}</select>`;
}

function htmlBarra() {
  const b = $("#barra-salvar");
  const sujos = Object.keys(est.planos).filter((s) => est.planos[s].sujo);
  const reg = est.planos[est.setor];
  if (!sujos.length) {
    b.hidden = !reg?.versao;
    b.innerHTML = reg?.versao ? `<span>Salvo · ${esc(reg.usuario || "")} · ${new Date(reg.versao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "")}</span>` : "";
    return;
  }
  b.hidden = false;
  b.innerHTML = `<span>Alterações não salvas: <b>${sujos.length > 3 ? `${sujos.length} escalas` : sujos.map((s) => infoSetor(s).rotulo).join(", ")}</b></span><button class="btn btn-primario btn-peq" id="btn-salvar" data-acao="salvar">Salvar</button>`;
}

// ============================================================
// EVENTOS (delegados)
// ============================================================
document.addEventListener("click", (ev) => {
  const cel = ev.target.closest("[data-cel]");
  if (cel) { const [pid, d] = cel.dataset.cel.split("|"); return clicarCelula(pid, d); }
  const el = ev.target.closest("[data-acao]");
  if (!el || el.tagName === "SELECT" || el.tagName === "INPUT") return;
  const a = el.dataset.acao;
  if (a === "sair") return sair(false);
  if (a === "recarregar") {
    if (algumSujo()) { salvarRascunhosTodos(); }
    ORC.dados = null;
    return carregarLoja(est.loja);
  }
  if (a === "tema") {
    const atual = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = atual; gravarLocal("escala_web_tema", atual); return;
  }
  if (a === "imprimir") return window.print();
  if (a === "modo") { trocarModo(el.dataset.v); return; }
  if (a === "orc-base") { ORC.base = el.dataset.v; gravarLocal("escala_orc_base", ORC.base); return render(); }
  if (a === "orc-cenario") { ORC.cenario = +el.dataset.h; gravarLocal("escala_orc_cenario", String(ORC.cenario)); return render(); }
  if (a === "orc-loja") { ORC.escopo = +el.dataset.l; render(); return window.scrollTo({ top: 0, behavior: "smooth" }); }
  if (a === "orc-recarregar") { ORC.erro = null; ORC.dados = null; render(); return; }
  if (a === "setor") { est.modo = "escala"; gravarLocal("escala_web_modo", "escala"); return abrirSetor(el.dataset.setor); }
  if (a === "dept") { est.modo = "escala"; gravarLocal("escala_web_modo", "escala"); const dpt = el.dataset.dept; return abrirSetor(est.ultimoPorDept[dpt] && lerChave(est.ultimoPorDept[dpt])?.dept === dpt ? est.ultimoPorDept[dpt] : chaveSetor(dpt)); }
  if (a === "cenario") {
    if (est.modo === "total") return toast("A jornada (44h/42h/40h) é escolhida dentro de cada departamento.");
    if (est.modo !== "escala") { ORC.cenario = +el.dataset.h; gravarLocal("escala_orc_cenario", String(ORC.cenario)); return render(); }
    return trocarCenario(+el.dataset.h);
  }
  if (a === "redistribuir") return redistribuirAgora();
  if (a === "destravar") return destravar();
  if (a === "csv") return exportarCSV();
  if (a === "semana-mapa") { est.semanaMapa = +el.dataset.w; return render(); }
  if (a === "abrir-aviso") { const v = el.dataset.v || null; est.aberto = est.aberto === v ? null : v; return render(); }
  if (a === "mais-alertas") { est.mostrarTodosAlertas = !est.mostrarTodosAlertas; return render(); }
  if (a === "add-turno") return addTurno();
  if (a === "rm-turno") return removerTurno(el.dataset.id);
  if (a === "add-faixa") return addFaixa();
  if (a === "rm-faixa") { plano().minimos.faixas.splice(+el.dataset.i, 1); return alterou(); }
  if (a === "add-extra") return addExtra();
  if (a === "rm-extra") return removerExtra(el.dataset.id);
  if (a === "usar-dsr") return usarDSR(el.dataset.id);
  if (a === "horario-padrao") {
    const pl = plano();
    pl.funcionamento = funcionamentoPadrao(lojaAtual());
    if (!pl.funcionamento.dom) pl.domingo.minimo = 0;
    M.redistribuir(pl, ativos(pl));
    alterou();
    return toast("Horário padrão da loja aplicado e folgas redistribuídas.", "ok");
  }
  if (a === "salvar") return salvar();
  if (a === "visao") { est.aba = el.dataset.v; gravarLocal("escala_web_aba", est.aba); render(); return window.scrollTo({ top: $(".visoes")?.offsetTop - 8 || 0, behavior: "smooth" }); }
  if (a === "ir-problema") { est.aba = "cobertura"; est.semanaMapa = +el.dataset.w || 0; render(); return window.scrollTo({ top: $(".visoes")?.offsetTop - 8 || 0, behavior: "smooth" }); }
  if (a === "escalonar") return escalonarAgora();
  if (a === "passo") {
    const alvo = el.dataset.alvo;
    if (alvo === "auto") return redistribuirAgora();
    if (alvo === "almoco") return escalonarAgora();
    est.aba = alvo; render(); return window.scrollTo({ top: $(".visoes")?.offsetTop - 8 || 0, behavior: "smooth" });
  }
});

function salvarRascunhosTodos() {
  for (const s of Object.keys(est.planos)) { const r = est.planos[s]; if (r.sujo) gravarRascunho(est.loja, s, { base: r.versao, p: r.p }); }
}

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.acaoChange === "loja") {
    const nova = +el.value;
    if (algumSujo() && !confirm("Há alterações não salvas nesta loja. Trocar mesmo assim? (elas ficam guardadas neste navegador)")) { el.value = est.loja; return; }
    salvarRascunhosTodos();
    if (!ehTotalOrc(ORC.escopo)) ORC.escopo = nova;
    return carregarLoja(nova);
  }
  if (el.dataset.acaoChange === "orc-escopo") {
    ORC.escopo = lerEscopoOrc(el.value);
    // escolheu uma loja: a escala dos setores passa a ser dessa loja também
    if (!ehTotalOrc(ORC.escopo) && ORC.escopo !== est.loja && (est.dados?.lojas || []).includes(ORC.escopo)) {
      if (algumSujo() && !confirm("Há alterações não salvas nesta loja. Trocar mesmo assim? (elas ficam guardadas neste navegador)")) return render();
      salvarRascunhosTodos();
      return carregarLoja(ORC.escopo);
    }
    return render();
  }
  if (el.dataset.acaoChange === "pn-custo") { PN.custo = Math.max(0, +el.value || 0) || null; gravarLocal("escala_pn_custo", PN.custo ? String(PN.custo) : ""); return render(); }
  if (el.dataset.acaoChange === "orc-gestao") { ORC.gestaoFixa = el.checked; gravarLocal("escala_orc_gestao", el.checked ? "1" : "0"); return render(); }
  if (el.dataset.acaoChange === "inicio") {
    const d = M.lerISO(el.value);
    if (!d) return;
    const dom = M.domingoDe(d);
    if (d.getUTCDay() !== 0) toast(`A escala começa no domingo: ajustei para ${M.dataBR(dom)}.`);
    plano().inicio = M.iso(dom);
    M.redistribuir(plano(), ativos(plano()));
    return alterou();
  }
  if (el.dataset.acaoChange === "ver-semana") { est.verSemana = el.value === "todas" ? "todas" : +el.value; return render(); }
  if (el.dataset.acaoChange === "sem-folga") {
    const pl = plano(), dw = +el.dataset.dow;
    const set = new Set(pl.diasSemFolga || []);
    if (el.checked) set.add(dw); else set.delete(dw);
    pl.diasSemFolga = [...set].sort();
    const doQL = new Map(est.dados.pessoas.map((x) => [idPessoaQL(x.n), x]));
    for (const pe of pl.pessoas) {
      const x = doQL.get(pe.id), r = x && regraDSR(x, pl.diasSemFolga);
      if (!r) continue;
      pe.dsrRegra = r;
      if (pe.dsrAuto !== false) Object.assign(pe, { domingo: r.domingo, folgaFixa: r.folgaFixa, folgaFixa2: r.folgaFixa2 });
    }
    M.redistribuir(pl, ativos(pl));
    return alterou();
  }
  if (el.dataset.acaoChange === "dom-fechado") {
    const pl = plano();
    pl.funcionamento.dom = el.checked ? null : [...(funcionamentoPadrao(lojaAtual()).dom || ["08:00", "20:00"])];
    if (el.checked) pl.domingo.minimo = 0;
    M.redistribuir(pl, ativos(pl));
    return alterou();
  }
  if (el.dataset.acaoChange === "mostrar-minimo") { est.mostrarMinimo = el.checked; return render(); }
  if (el.dataset.acaoChange === "semanas") {
    plano().semanas = +el.value;
    M.redistribuir(plano(), ativos(plano()));
    return alterou();
  }
  const bind = el.dataset.bind;
  if (!bind) return;
  let v = el.type === "checkbox" ? el.checked : el.value;
  const tipo = el.dataset.tipo;
  if (tipo === "num") v = Math.max(0, +v || 0);
  if (tipo === "numnull") v = v === "" ? null : +v;
  if (tipo === "int") v = Math.round(+v || 0);
  if (tipo === "bool") v = !!el.checked;
  if (el.type === "time" && !v) return render();
  setCaminho(plano(), bind, v);
  const mDsr = bind.match(/^pessoas\.(\d+)\.(domingo|folgaFixa|folgaFixa2)$/);
  if (mDsr) plano().pessoas[+mDsr[1]].dsrAuto = false;
  alterou();
});

window.addEventListener("beforeunload", (e) => {
  if (algumSujo()) { salvarRascunhosTodos(); e.preventDefault(); e.returnValue = ""; }
});

// ============================================================
// INÍCIO
// ============================================================
if (sessao?.token) iniciarApp(); else telaLogin();
