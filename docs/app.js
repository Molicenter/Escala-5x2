// ============================================================
// Escala 5x2 · Molicenter — app web
// Login do QL · colaboradores da Frente de Caixa vindos do quadro do Senior (QL)
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
const nomeLoja = (n) => `Loja ${p2(n)}`;
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
const MIN_GERAL = 0.3, MIN_DOM = 0.25;
const PESOS_PADRAO = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 4, 6: 5 };
const OPC_JORNADA = [240, 360, 380, 440, 480, 504, 528];
const OPC_ALMOCO = [0, 15, 60, 75, 90, 120];
const VERSAO_PLANO = 1;

function toast(msg, tipo = "") {
  const t = $("#toast");
  t.textContent = msg; t.className = "toast " + tipo; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), tipo === "erro" ? 6500 : 3200);
}
function carregando(sim) { $("#carregando").hidden = !sim; }
function lerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravarLocal(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }

// ---------- sessão (a MESMA do QL: quem já entrou no QL neste navegador entra direto aqui) ----------
const CHAVE_SESSAO = "ql_web_sessao";
let sessao = (() => { try { return JSON.parse(lerLocal(CHAVE_SESSAO)) || null; } catch { return null; } })();

const MENSAGENS = {
  SENHA_INCORRETA: "Usuário ou senha incorretos. Tente de novo.",
  SENHA_NAO_CONFIGURADA: "A senha deste usuário ainda não foi cadastrada no QL.",
  MUITAS_TENTATIVAS: "Muitas tentativas erradas. Espere 10 minutos e tente de novo.",
  SESSAO_INVALIDA: "Sua sessão expirou. Entre de novo.",
  SEM_PERMISSAO: "Seu login não tem acesso a esta loja.",
  ESCOPO_INVALIDO: "Escolha a loja.",
  SETOR_INVALIDO: "Setor inválido.",
  DADOS_GRANDES: "A escala ficou grande demais para gravar. Diminua o número de semanas.",
  "Could not find the function": "O banco ainda não tem as funções da escala (falta rodar o SQL 01_escala_web.sql).",
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
    const lista = await rpc("ql_web_lista_usuarios");
    const ultimo = lerLocal("ql_web_ultimo_usuario");
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
    sessao = await rpc("ql_web_login", { p_email: email, p_senha: senha });
    gravarLocal(CHAVE_SESSAO, JSON.stringify(sessao));
    gravarLocal("ql_web_ultimo_usuario", email);
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
  sessao = null; est.dados = null;
  gravarLocal(CHAVE_SESSAO, null);
  if (tok && !silencioso) rpc("ql_web_sair", { p_token: tok }).catch(() => {});
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
  mostrarTodosAlertas: false,
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
    toast("Recuperei alterações que não tinham sido salvas.", "ok");
  } else if (rasc) gravarRascunho(d.loja, k, null);
  est.sync[k] = sincronizar(p, doQL);
  est.planos[k] = { p, versao, usuario, sujo };
  return est.planos[k];
}
function abrirSetor(k) {
  est.setor = k; est.semanaMapa = 0;
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

function inferirTurnos(doQL, jornadaMin, fecha = "21:00") {
  const contagem = new Map();
  for (const x of doQL) {
    const e = M.lerEscalaSenior(x.e);
    if (!e) continue;
    const almocoMin = Math.min(120, Math.max(60, e.almocoMin));
    const k = `${e.entrada}|${e.almoco}|${almocoMin}`;
    contagem.set(k, (contagem.get(k) || 0) + 1);
  }
  let top = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k.split("|"));
  top.sort((a, b) => M.hm(a[0]) - M.hm(b[0]));
  if (!top.length) top = [["07:30", "11:30", "60"], ["10:00", "14:00", "60"], ["12:45", "17:00", "60"]];
  const nomes = top.length === 1 ? ["Turno único"] : top.length === 2 ? ["Abertura", "Fechamento"]
    : top.length === 3 ? ["Abertura", "Intermediário", "Fechamento"] : ["Abertura", "Intermediário", "Tarde", "Fechamento"];
  // no 5x2 a jornada é maior que no 6x1: se o turno passaria do fechamento, adianta a entrada (e o almoço)
  const limite = M.hm(fecha) + 30;
  return top.map(([entrada, almoco, am], i) => {
    const t = { id: "t" + (i + 1), nome: nomes[i], entrada, almoco, almocoMin: +am, jornadaMin };
    const passa = M.saidaTurno(t) - limite;
    if (passa > 0) { t.entrada = M.fmtHM(Math.max(0, M.hm(entrada) - passa)); t.almoco = M.fmtHM(Math.max(0, M.hm(almoco) - passa)); }
    return t;
  }).filter((t, i, arr) => arr.findIndex((u) => Math.abs(M.hm(u.entrada) - M.hm(t.entrada)) <= 20 && Math.abs(M.saidaTurno(u) - M.saidaTurno(t)) <= 20) === i)
    .map((t, i, arr) => ({ ...t, id: "t" + (i + 1), nome: arr.length === 1 ? "Turno único" : i === 0 ? "Abertura" : i === arr.length - 1 ? "Fechamento" : arr.length === 3 ? "Intermediário" : `Intermediário ${i}` }));
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
  const p = {
    v: VERSAO_PLANO, setor, cenario, inicio, semanas: 4,
    funcionamento: { segsab: ["08:00", "21:00"], dom: ["08:00", "12:00"] },
    domingo: { entrada: "07:45", saida: "12:15", minimo: Math.max(1, Math.round(n * MIN_DOM)) },
    domingosSeguidosMax: 2,
    minimos: { geral: Math.max(1, Math.floor(n * MIN_GERAL)), faixas: [] },
    pesos: { ...PESOS_PADRAO },
    turnos: inferirTurnos(naEscala, M.CENARIOS[cenario].jornadaMin),
    pessoas: [], grade: {}, travas: {},
  };
  return p;
}

function normalizarPlano(p, setor) {
  p.v ||= VERSAO_PLANO; p.setor = setor;
  p.cenario = M.CENARIOS[p.cenario] ? p.cenario : 42;
  p.semanas = Math.min(8, Math.max(1, +p.semanas || 4));
  p.funcionamento ||= { segsab: ["08:00", "21:00"], dom: ["08:00", "12:00"] };
  p.domingo ||= { entrada: "08:00", saida: "12:00", minimo: 2 };
  p.domingosSeguidosMax ||= 2;
  p.minimos ||= { geral: 2, faixas: [] }; p.minimos.faixas ||= [];
  p.pesos ||= { ...PESOS_PADRAO };
  p.turnos ||= []; p.pessoas ||= []; p.grade ||= {}; p.travas ||= {};
  if (!p.turnos.length) p.turnos = inferirTurnos([], M.CENARIOS[p.cenario].jornadaMin);
  if (!p.inicio) p.inicio = M.iso(M.domingoDe(new Date(), true));
  return p;
}

// junta o plano com o quadro atual do QL: entra quem é novo, sai quem não está mais no Senior
function sincronizar(p, doQL) {
  const novos = [], saiu = [];
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
    const mot = motivoSemEscala(x); if (mot) pe.semEscala = mot; else delete pe.semEscala;
    if (/FERIAS|FÉRIAS/i.test(pe.sit)) pe.ferias = true; else delete pe.ferias;
  }
  for (const pe of p.pessoas) {
    if (pe.origem === "ql" && !noQL.has(pe.id)) { if (!pe.fora) saiu.push(pe.nome); pe.fora = true; }
  }
  // ordem: QL por turno e nome, extras no fim
  const ordT = (pe) => p.turnos.findIndex((t) => t.id === pe.turno);
  p.pessoas.sort((a, b) => (a.origem === "extra") - (b.origem === "extra") || ordT(a) - ordT(b) || a.nome.localeCompare(b.nome));
  if (vazio) M.redistribuir(p, ativos(p));
  return { novos, saiu };
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

function trocarCenario(h) {
  const p = plano();
  const antiga = M.CENARIOS[p.cenario].jornadaMin, nova = M.CENARIOS[h].jornadaMin;
  p.cenario = h;
  p.turnos.forEach((t) => { if (t.jornadaMin === antiga) t.jornadaMin = nova; });
  alterou();
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

function redistribuirAgora() {
  const p = plano();
  M.redistribuir(p, ativos(p));
  alterou();
  toast("Folgas redistribuídas. Os ajustes feitos à mão (bolinha rosa) foram mantidos.", "ok");
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
  p.turnos.push({ id, nome: "Novo turno", entrada: ult ? M.fmtHM(M.hm(ult.entrada) + 60) : "09:00", almoco: ult ? M.fmtHM(M.hm(ult.almoco) + 60) : "13:00", almocoMin: 60, jornadaMin: M.CENARIOS[p.cenario].jornadaMin });
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

function render() {
  if (!est.dados || !plano()) return;
  // guarda a rolagem lateral das tabelas
  const rol = {};
  $$("[data-rolagem]").forEach((el) => (rol[el.dataset.rolagem] = el.scrollLeft));

  const p = plano();
  const pessoas = ativos(p);
  const an = M.analisar(p, pessoas);
  if (est.semanaMapa >= p.semanas) est.semanaMapa = 0;
  $("#topo").innerHTML = htmlTopo(p);
  $("#conteudo").innerHTML = [
    htmlAbas(), htmlAvisoSync(), htmlKpis(p, pessoas, an), htmlAlertas(p, an), htmlEscala(p, pessoas, an), htmlMapa(p, an),
    `<div class="duas">${htmlTurnos(p)}${htmlMinimos(p)}</div>`, htmlPessoas(p),
  ].join("");
  htmlBarra();
  $$("[data-rolagem]").forEach((el) => { if (rol[el.dataset.rolagem] != null) el.scrollLeft = rol[el.dataset.rolagem]; });
}

function htmlTopo(p) {
  const lojas = est.dados.lojas || [];
  const seletor = sessao.loja_fixa != null || lojas.length <= 1
    ? `<span class="loja-fixa">${nomeLoja(est.loja)}</span>`
    : `<select class="sel-loja" data-acao-change="loja" aria-label="Loja">${opcoes(lojas.map((l) => [l, nomeLoja(l)]), est.loja)}</select>`;
  const j = M.CENARIOS[p.cenario];
  const ini = M.lerISO(p.inicio);
  const dom = `${fmtHoraPilula(p.domingo.entrada)}–${fmtHoraPilula(p.domingo.saida)}`;
  return `<div class="topo-in">
    <div class="topo-linha">
      <div class="topo-titulo"><img src="logo.png" alt=""><h1>Escala 5x2 <span class="ponto">·</span> ${seletor}</h1></div>
      <div class="topo-conta">
        <div class="quem"><strong>${esc(sessao.email)}</strong>${esc(sessao.perfil || "")}</div>
        <button class="btn btn-peq btn-vidro" data-acao="imprimir" title="Imprimir ou salvar em PDF">Imprimir / PDF</button>
        <button class="btn btn-peq btn-vidro" data-acao="tema" title="Tema claro/escuro">◐</button>
        <button class="btn btn-peq btn-vidro" data-acao="sair">Sair</button>
      </div>
    </div>
    <p class="topo-sub">Simulador da escala de cada setor a partir de ${ini ? M.dataBR(ini) : "-"}. Mude turnos, pessoas e folgas e veja na hora quem trabalha, quantas horas faz e onde falta gente.</p>
    <div class="pilulas">
      <span class="pilula">Folgas <b>2 por semana</b></span>
      <span class="pilula">Jornada <b>${M.fmtDur(j.jornadaMin)}/dia</b></span>
      <span class="pilula">Semana <b>${p.cenario}h máx.</b></span>
      <span class="pilula">Seg a sáb <b>${fmtHoraPilula(p.funcionamento.segsab[0])}–${fmtHoraPilula(p.funcionamento.segsab[1])}</b></span>
      <span class="pilula">Domingo <b>${dom}</b></span>
    </div>
    <div class="cenarios"><span>Cenário:</span>
      ${[44, 42, 40].map((h) => `<button type="button" data-acao="cenario" data-h="${h}" class="${p.cenario === h ? "ativo" : ""}">${M.CENARIOS[h].rotulo}</button>`).join("")}
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
function htmlAbas() {
  const cur = lerChave(est.setor);
  const salvosDept = (dept) => est.dados.planos.some((x) => lerChave(x.setor)?.dept === dept);
  const sujoDept = (dept) => Object.keys(est.planos).some((k) => est.planos[k].sujo && lerChave(k)?.dept === dept);
  const linhaD = est.estrutura.map((dp) => `<button type="button" data-acao="dept" data-dept="${esc(dp.dept)}" class="${dp.dept === cur.dept ? "ativo" : ""}">${esc(titulo(dp.dept))} <span class="qtd">${dp.n}</span>${sujoDept(dp.dept) ? "<span class='qtd'>•</span>" : salvosDept(dp.dept) ? "<span class='salvo'>✓</span>" : ""}</button>`).join("");
  const dp = est.estrutura.find((x) => x.dept === cur.dept);
  const chips = dp ? [[chaveSetor(dp.dept), "Todas as funções", dp.n], ...dp.funcoes.map((f) => [chaveSetor(dp.dept, f.f), titulo(f.f), f.n])] : [];
  const linhaF = chips.map(([k, r, n]) => `<button type="button" data-acao="setor" data-setor="${esc(k)}" class="chip-setor${k === est.setor ? " ativo" : ""}">${esc(r)} <span class="qtd">${n}</span>${marcasSetor(k)}</button>`).join("");
  return `<nav class="abas nao-imprime">${linhaD}</nav><div class="funcoes nao-imprime"><span class="texto-fraco">Montar a escala de:</span>${linhaF}</div>`;
}

function htmlAvisoSync() {
  const s = est.sync[est.setor];
  const p = plano();
  const fora = p.pessoas.filter((x) => x.fora);
  const partes = [];
  if (s?.novos?.length) partes.push(`<span><b>Entraram do QL:</b> ${esc(s.novos.join(", "))} — clique em Redistribuir para encaixar.</span>`);
  if (fora.length) partes.push(`<span><b>Não estão mais no quadro do Senior (fora da escala):</b> ${esc(fora.map((x) => x.nome).join(", "))}</span>`);
  if (!p.pessoas.length) partes.push(`<span>Nenhum colaborador ativo em <b>${esc(infoSetor(est.setor).rotulo)}</b> nesta loja no QL. Adicione uma pessoa extra lá embaixo para simular.</span>`);
  return partes.length ? `<div class="aviso-topo nao-imprime">${partes.join("")}</div>` : "";
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
  const nProb = an.problemas.length + new Set(an.avisos.map((a) => a.pid)).size;
  return `<section class="kpis">
    <div class="kpi"><div class="rot">Pessoas no setor</div><div class="val">${n}</div><div class="det">${num1(mediaDom)} em média no domingo</div></div>
    <div class="kpi"><div class="rot">Por dia, seg a sáb</div><div class="val">${num1(mediaDia)}<small>no 5x2</small></div><div class="det">hoje no 6x1: ~${num1(hoje6x1)} (${mediaDia - hoje6x1 >= 0 ? "+" : ""}${num1(mediaDia - hoje6x1)}/dia)</div></div>
    <div class="kpi"><div class="rot">Dias de trabalho/semana</div><div class="val">${Math.round(diasSem)}<small>de ${n * 6}</small></div><div class="det${n * 6 - diasSem > 0 ? " ruim" : ""}">perde ${Math.round(n * 6 - diasSem)} dia(s) por semana</div></div>
    <div class="kpi"><div class="rot">Horas médias/pessoa</div><div class="val">${M.fmtDur(Math.round(mediaH))}</div><div class="det">limite ${p.cenario}h · domingo curto puxa pra baixo</div></div>
    <div class="kpi${nProb ? " kpi-ruim" : ""}"><div class="rot">Situação</div><div class="val">${nProb}<small>${nProb === 1 ? "problema" : "problemas"}</small></div><div class="det">${an.faixasAbaixo} faixa(s) de 15 min abaixo do mínimo</div></div>
  </section>`;
}

function htmlAlertas(p, an) {
  const itens = [];
  for (const pr of an.problemas) {
    const ex = pr.faixas.slice(0, 3).join(", ") + (pr.faixas.length > 3 ? "…" : "");
    itens.push(`<div class="alerta"><span class="selo">Problema</span><span><b>${M.DOW_LONGO[pr.dow]}:</b> falta gente em ${pr.semanas} de ${pr.total} semana${pr.total > 1 ? "s" : ""} (ex.: ${esc(ex)}).</span></div>`);
  }
  const porPessoa = new Map();
  for (const a of an.avisos) { if (!porPessoa.has(a.pid)) porPessoa.set(a.pid, { nome: a.nome, txt: [] }); porPessoa.get(a.pid).txt.push(a.txt); }
  for (const [, v] of porPessoa) itens.push(`<div class="alerta aviso"><span class="selo">Atenção</span><span><b>${esc(v.nome)}:</b> ${esc(v.txt.join(" · "))}</span></div>`);
  if (!itens.length) itens.push(`<div class="alerta ok"><span class="selo">Tudo certo</span><span>Nenhuma faixa abaixo do mínimo e ninguém fora das regras (2 folgas, ${p.cenario}h, até 6 dias seguidos, até ${p.domingosSeguidosMax} domingos seguidos).</span></div>`);
  const LIM = 8;
  const mostrar = est.mostrarTodosAlertas ? itens : itens.slice(0, LIM);
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>O que precisa de atenção</h2><p class="sub">Faixas de 15 minutos abaixo do mínimo e regras de cada pessoa.</p></div></div>
    <div class="alertas">${mostrar.join("")}</div>
    ${itens.length > LIM ? `<p class="nao-imprime"><button class="btn btn-peq btn-borda" data-acao="mais-alertas">${est.mostrarTodosAlertas ? "Mostrar menos" : `Mostrar todos (${itens.length})`}</button></p>` : ""}
  </section>`;
}

function htmlEscala(p, pessoas, an) {
  const dias = an.dias;
  const fim = M.somaDias(M.lerISO(p.inicio), p.semanas * 7 - 1);
  const totTravas = Object.values(p.travas).reduce((s, o) => s + Object.keys(o).length, 0);
  let cabSem = `<tr class="cab-sem"><th class="col-nome" rowspan="2">Nome</th>`;
  for (let w = 0; w < p.semanas; w++) {
    const a = dias[w * 7].d, b = dias[w * 7 + 6].d;
    cabSem += `<th colspan="7">Semana ${w + 1} · ${M.dataCurta(a)}–${M.dataCurta(b)}</th>`;
  }
  for (let w = 0; w < p.semanas; w++) cabSem += `<th class="col-h" rowspan="2">Sem ${w + 1}</th>`;
  cabSem += "</tr>";
  const cabDia = `<tr class="cab-dia">${dias.map((d) => `<th class="${d.dow === 0 ? "dom " : ""}${d.dow === 0 ? "ini-sem" : ""}">${d.d.getUTCDate()}<small>${M.DOW[d.dow]}</small></th>`).join("")}</tr>`;

  const avisosP = new Set(an.avisos.map((a) => a.pid));
  const linhas = pessoas.map((pe) => {
    const t = M.turnoDe(p, pe);
    const tr = p.travas[pe.id] || {};
    const cels = dias.map((d) => {
      const v = M.valor(p, pe.id, d);
      const tit = v === "T" ? `${t?.nome}: ${t?.entrada}–${t ? M.fmtHM(M.saidaTurno(t)) : ""}` : v === "D" ? `Domingo ${p.domingo.entrada}–${p.domingo.saida}` : v === "F" ? "Folga" : "Ausente (férias/atestado)";
      return `<td class="${d.dow === 0 ? "ini-sem" : ""}"><button type="button" class="cel ${v}${tr[d.iso] ? " trava" : ""}" data-cel="${esc(pe.id)}|${d.iso}" title="${esc(M.DOW_LONGO[d.dow] + " " + M.dataCurta(d.d) + " · " + tit)}">${v}</button></td>`;
    }).join("");
    const hs = an.horas[pe.id].map((h) => `<td class="col-h${h.acima ? " acima" : h.poucaFolga || h.muitaFolga ? " folga" : ""}">${M.fmtDur(h.min)}</td>`).join("");
    return `<tr class="${avisosP.has(pe.id) ? "linha-aviso " : ""}${pe.origem === "extra" ? "coringa" : ""}"><td class="col-nome"><b title="${esc(pe.nome)}">${esc(pe.nome)}</b><small>${esc(t?.nome || "-")} · ${esc(t?.entrada || "")}${pe.ferias ? " · férias no QL" : ""}</small></td>${cels}${hs}</tr>`;
  }).join("");
  const total = `<tr class="total"><td class="col-nome"><b>Trabalhando</b></td>${an.porDia.map((x) => `<td class="${x.dow === 0 ? "ini-sem dom " : ""}${x.abaixo ? "baixo" : ""}">${x.trab}</td>`).join("")}${"<td class='col-h'></td>".repeat(p.semanas)}</tr>`;

  const pesos = [1, 2, 3, 4, 5, 6].map((dw) => `<label>${M.DOW[dw]} <select data-bind="pesos.${dw}" data-tipo="num">${opcoes([[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]], p.pesos[dw])}</select></label>`).join("");

  return `<section class="cartao">
    <div class="cartao-cab">
      <div><h2>Escala de ${M.dataCurta(M.lerISO(p.inicio))}/${M.lerISO(p.inicio).getUTCFullYear()} a ${M.dataBR(fim)}</h2>
        <p class="sub">As folgas vão para os dias de menos movimento (ajuste o peso dos dias logo abaixo). Quem trabalha no domingo folga 2 dias na semana; o domingo é em rodízio. Clique numa célula para trocar (T → F → X). A última linha mostra quantas pessoas trabalham em cada dia.</p></div>
      <div class="ferramentas nao-imprime">
        <label class="campo"><span>Início (domingo)</span><input type="date" class="ent" value="${p.inicio}" data-acao-change="inicio"></label>
        <label class="campo"><span>Semanas</span><select class="ent" data-acao-change="semanas">${opcoes([1, 2, 3, 4, 5, 6, 7, 8].map((x) => [x, x]), p.semanas)}</select></label>
        <button class="btn btn-primario" data-acao="redistribuir">Redistribuir folgas automaticamente</button>
        ${totTravas ? `<button class="btn btn-borda" data-acao="destravar" title="Remove os ajustes feitos à mão">Desfazer ajustes manuais (${totTravas})</button>` : ""}
        <button class="btn btn-borda" data-acao="csv">Baixar planilha</button>
      </div>
    </div>
    <div class="pesos nao-imprime"><span>Movimento do dia (1 = fraco · 5 = forte):</span>${pesos}</div>
    <div class="rolagem" data-rolagem="escala"><table class="escala"><thead>${cabSem}${cabDia}</thead><tbody>${linhas}${total}</tbody></table></div>
    <div class="legenda"><span><i class="cel T">T</i>trabalha</span><span><i class="cel F">F</i>folga</span><span><i class="cel D">D</i>trabalho no domingo (meio período)</span><span><i class="cel X">X</i>ausente (férias/atestado)</span><span><i class="cel trava" style="width:20px;height:20px"></i>ajustado à mão (a redistribuição não mexe)</span></div>
  </section>`;
}

function htmlMapa(p, an) {
  const w = est.semanaMapa;
  const dias = an.porDia.slice(w * 7, w * 7 + 7);
  const { ini, n } = an.jan;
  let cab = "<tr><th class='dia'></th>";
  for (let k = 0; k < n; k++) { const t = ini + k * M.PASSO; cab += `<th>${t % 60 === 0 ? `${Math.floor(t / 60)}h` : ""}</th>`; }
  cab += "</tr>";
  const linhas = dias.map((x) => {
    let tds = "";
    for (let k = 0; k < n; k++) {
      const t = ini + k * M.PASSO, c = x.cov[k], m = x.min[k];
      const cls = m === 0 && c === 0 ? "vazio" : c < m ? "falta" : c === m ? "ok" : "sobra";
      tds += `<td class="${cls}${t % 60 === 0 ? " hora" : ""}" title="${M.DOW[x.dow]} ${M.fmtHM(t)}: ${c} no posto · mínimo ${m}">${cls === "vazio" ? "" : c}</td>`;
    }
    return `<tr><th class="dia">${M.DOW[x.dow]} ${x.d.getUTCDate()}</th>${tds}</tr>`;
  }).join("");
  const botoes = Array.from({ length: p.semanas }, (_, i) => {
    const ruim = an.porDia.slice(i * 7, i * 7 + 7).some((x) => x.abaixo);
    const a = an.porDia[i * 7].d, b = an.porDia[i * 7 + 6].d;
    return `<button type="button" data-acao="semana-mapa" data-w="${i}" class="${i === w ? "ativo" : ""}${ruim ? " ruim" : ""}">${M.dataCurta(a)}–${M.dataCurta(b)}</button>`;
  }).join("");
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Mapa de cobertura</h2><p class="sub">Quantas pessoas estão no posto a cada 15 minutos, descontando o almoço. Vermelho: abaixo do mínimo que você definiu. Verde-claro: exatamente o mínimo. Verde forte: acima.</p></div>
      <div class="semanas-mapa">${botoes}</div></div>
    <div class="rolagem" data-rolagem="mapa" style="border:0"><table class="mapa"><thead>${cab}</thead><tbody>${linhas}</tbody></table></div>
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
    <td class="texto-fraco">${usando(t.id)}</td>
    <td><button class="btn-x" data-acao="rm-turno" data-id="${t.id}" title="Remover turno">✕</button></td></tr>`).join("");
  const domH = Math.max(0, M.hm(p.domingo.saida) - M.hm(p.domingo.entrada));
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Turnos</h2><p class="sub">A saída é calculada: entrada + jornada + almoço.</p></div></div>
    <div class="rolagem-conf"><table class="conf"><thead><tr><th>Turno</th><th>Entrada</th><th>Almoço</th><th>Duração</th><th>Jornada</th><th>Saída</th><th>Pessoas</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
    <p><button class="btn btn-peq btn-borda nao-imprime" data-acao="add-turno">+ Turno</button></p>
    <div class="linha-config"><b>Domingo:</b> entrada <input type="time" class="ent hora" value="${p.domingo.entrada}" data-bind="domingo.entrada"> saída <input type="time" class="ent hora" value="${p.domingo.saida}" data-bind="domingo.saida"> <span>${M.fmtDur(domH)} no posto</span></div>
    <div class="linha-config"><b>Loja aberta seg a sáb:</b> <input type="time" class="ent hora" value="${p.funcionamento.segsab[0]}" data-bind="funcionamento.segsab.0"> às <input type="time" class="ent hora" value="${p.funcionamento.segsab[1]}" data-bind="funcionamento.segsab.1"></div>
    <div class="linha-config"><b>Loja aberta domingo:</b> <input type="time" class="ent hora" value="${p.funcionamento.dom[0]}" data-bind="funcionamento.dom.0"> às <input type="time" class="ent hora" value="${p.funcionamento.dom[1]}" data-bind="funcionamento.dom.1"></div>
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
    if (pe.fora) return `<tr><td><b>${esc(pe.nome)}</b></td><td><span class="chip fora">fora do quadro do Senior</span></td><td colspan="5" class="texto-fraco">Não entra na escala.</td></tr>`;
    const chip = (pe.semEscala ? `<span class="chip fora">${esc(pe.semEscala)}</span> ` : "") + (lerChave(est.setor)?.funcao || !pe.funcao ? "" : `<span class="chip">${esc(titulo(pe.funcao))}</span> `) + (pe.origem === "extra" ? `<span class="chip extra">extra</span>` : pe.ferias ? `<span class="chip ferias">${esc(titulo(pe.sit))}</span>` : `<span class="chip">${esc(titulo(pe.sit || "Ativo"))}</span>`);
    const nome = pe.origem === "extra" ? `<input class="ent nome-in" value="${esc(pe.nome)}" data-bind="pessoas.${i}.nome">` : `<b>${esc(pe.nome)}</b>`;
    return `<tr>
      <td>${nome}</td>
      <td>${chip}<div class="texto-fraco mono" title="Horário no Senior">${esc(pe.senior || "")}</div></td>
      <td><select class="ent" data-bind="pessoas.${i}.turno">${opcoes(optT, pe.turno)}</select></td>
      <td><select class="ent" data-bind="pessoas.${i}.domingo">${opcoes(optDom, pe.domingo)}</select></td>
      <td><select class="ent" data-bind="pessoas.${i}.folgaFixa" data-tipo="numnull">${opcoes(optFolga, pe.folgaFixa ?? "")}</select></td>
      <td><label class="texto-fraco"><input type="checkbox" ${pe.ativo !== false ? "checked" : ""} data-bind="pessoas.${i}.ativo" data-tipo="bool"> na escala</label></td>
      <td>${pe.origem === "extra" ? `<button class="btn-x" data-acao="rm-extra" data-id="${esc(pe.id)}" title="Remover">✕</button>` : ""}</td></tr>`;
  }).join("");
  return `<section class="cartao">
    <div class="cartao-cab"><div><h2>Pessoas e regras</h2><p class="sub">Vêm do Quadro de Lotação (quadro do Senior: ${esc(infoSetor(est.setor).rotulo)}, ativos da loja). Escolha o turno de cada uma, a regra do domingo e, se tiver, a folga fixa. Pessoa extra = coringa, vaga em aberto ou contratação nova.</p></div>
      <div class="ferramentas nao-imprime"><button class="btn btn-borda" data-acao="recarregar" title="Busca de novo o quadro do QL">Atualizar do QL</button><button class="btn btn-borda" data-acao="add-extra">+ Pessoa extra</button></div></div>
    <div class="rolagem-conf"><table class="conf"><thead><tr><th>Nome</th><th>Situação · horário Senior</th><th>Turno</th><th>Domingo</th><th>Folga fixa</th><th></th><th></th></tr></thead><tbody>${linhas || `<tr><td colspan="7" class="texto-fraco">Ninguém neste setor.</td></tr>`}</tbody></table></div>
  </section>`;
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
  b.innerHTML = `<span>Alterações não salvas: <b>${sujos.map((s) => infoSetor(s).rotulo).join(", ")}</b></span><button class="btn btn-primario btn-peq" id="btn-salvar" data-acao="salvar">Salvar</button>`;
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
    return carregarLoja(est.loja);
  }
  if (a === "tema") {
    const atual = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = atual; gravarLocal("escala_web_tema", atual); return;
  }
  if (a === "imprimir") return window.print();
  if (a === "setor") return abrirSetor(el.dataset.setor);
  if (a === "dept") { const dpt = el.dataset.dept; return abrirSetor(est.ultimoPorDept[dpt] && lerChave(est.ultimoPorDept[dpt])?.dept === dpt ? est.ultimoPorDept[dpt] : chaveSetor(dpt)); }
  if (a === "cenario") return trocarCenario(+el.dataset.h);
  if (a === "redistribuir") return redistribuirAgora();
  if (a === "destravar") return destravar();
  if (a === "csv") return exportarCSV();
  if (a === "semana-mapa") { est.semanaMapa = +el.dataset.w; return render(); }
  if (a === "mais-alertas") { est.mostrarTodosAlertas = !est.mostrarTodosAlertas; return render(); }
  if (a === "add-turno") return addTurno();
  if (a === "rm-turno") return removerTurno(el.dataset.id);
  if (a === "add-faixa") return addFaixa();
  if (a === "rm-faixa") { plano().minimos.faixas.splice(+el.dataset.i, 1); return alterou(); }
  if (a === "add-extra") return addExtra();
  if (a === "rm-extra") return removerExtra(el.dataset.id);
  if (a === "salvar") return salvar();
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
    return carregarLoja(nova);
  }
  if (el.dataset.acaoChange === "inicio") {
    const d = M.lerISO(el.value);
    if (!d) return;
    const dom = M.domingoDe(d);
    if (d.getUTCDay() !== 0) toast(`A escala começa no domingo: ajustei para ${M.dataBR(dom)}.`);
    plano().inicio = M.iso(dom);
    M.redistribuir(plano(), ativos(plano()));
    return alterou();
  }
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
  if (tipo === "bool") v = !!el.checked;
  if (el.type === "time" && !v) return render();
  setCaminho(plano(), bind, v);
  alterou();
});

window.addEventListener("beforeunload", (e) => {
  if (algumSujo()) { salvarRascunhosTodos(); e.preventDefault(); e.returnValue = ""; }
});

// ============================================================
// INÍCIO
// ============================================================
if (sessao?.token) iniciarApp(); else telaLogin();
