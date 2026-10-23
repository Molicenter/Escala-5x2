// ============================================================
// Escala 5x2 · Molicenter — motor de cálculo (sem tela)
// Datas, horas, cobertura de 15 em 15 min, problemas e a
// redistribuição automática das folgas.
//
// Valores de cada célula da escala:
//   T = trabalha (dia de semana, no turno da pessoa)
//   D = trabalha no domingo (jornada normal da pessoa, encaixada no horário de domingo da loja)
//   F = folga
//   X = ausente (falta, férias, atestado, afastamento) — não conta como folga nem como trabalho
// ============================================================
(function () {
  const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const DOW_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const PASSO = 15; // minutos por faixa do mapa de cobertura

  // dias de cada opção de faixa de mínimo
  const GRUPOS_DIAS = {
    segsab: { rotulo: "Seg a sáb", dias: [1, 2, 3, 4, 5, 6] },
    segsex: { rotulo: "Seg a sex", dias: [1, 2, 3, 4, 5] },
    sab: { rotulo: "Sábado", dias: [6] },
    dom: { rotulo: "Domingo", dias: [0] },
    segquaqui: { rotulo: "Seg, qua e qui", dias: [1, 3, 4] },
    tersex: { rotulo: "Ter e sex", dias: [2, 5] },
    sexsab: { rotulo: "Sex e sáb", dias: [5, 6] },
    d1: { rotulo: "Segunda", dias: [1] }, d2: { rotulo: "Terça", dias: [2] }, d3: { rotulo: "Quarta", dias: [3] },
    d4: { rotulo: "Quinta", dias: [4] }, d5: { rotulo: "Sexta", dias: [5] },
  };

  const CENARIOS = {
    44: { jornadaMin: 528, rotulo: "44h · 8h48 por dia" },
    42: { jornadaMin: 504, rotulo: "42h · 8h24 por dia" },
    40: { jornadaMin: 480, rotulo: "40h · 8h00 por dia" },
  };

  // 44h = como hoje (6x1: 1 folga por semana, jornada do Excel); 42h e 40h = 5x2 (2 folgas)
  const folgasSemana = (cen) => (+cen === 44 ? 1 : 2);
  // jornada por dia no cenário a partir da jornada de hoje (6x1): as horas da semana de hoje
  // (jornada × 6), limitadas ao cenário, divididas pelos 5 dias do 5x2. Ex.: 7h20 → 8h24 (42h) / 8h (40h)
  function jornadaCenario(cen, jornadaHoje) {
    const j = +jornadaHoje > 0 ? +jornadaHoje : 440;
    if (+cen === 44) return j;
    return Math.round(Math.min(j * 6, cen * 60) / 5);
  }
  // horário de hoje → horário no cenário: mesma entrada e almoço, a hora a mais entra no fim do dia;
  // se passar de 30 min depois do fechamento da loja, adianta entrada e almoço (de 15 em 15 min)
  function ajustarCenario(base, cen, fecha) {
    const jornadaMin = jornadaCenario(cen, base.jornadaMin);
    let e = hm(base.entrada), a = hm(base.almoco);
    const fim = typeof fecha === "number" ? fecha : hm(fecha || "21:00");
    const passa = e + jornadaMin + (+base.almocoMin || 0) - (fim + 30);
    if (+cen !== 44 && passa > 0) { const ad = Math.min(e, Math.ceil(passa / 15) * 15); e -= ad; a = Math.max(0, a - ad); }
    return { entrada: fmtHM(e), almoco: fmtHM(a), jornadaMin };
  }

  // ---------- horas ----------
  const p2 = (n) => String(n).padStart(2, "0");
  function hm(txt) {
    const m = String(txt || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? +m[1] * 60 + +m[2] : 0;
  }
  const fmtHM = (min) => `${p2(Math.floor(min / 60) % 24)}:${p2(min % 60)}`;
  function fmtDur(min) {
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return m ? `${h}h${p2(m)}` : `${h}h`;
  }

  // ---------- datas (UTC, texto AAAA-MM-DD) ----------
  function lerISO(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  const iso = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  const somaDias = (d, n) => new Date(d.getTime() + n * 86400000);
  const dataCurta = (d) => `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}`;
  const dataBR = (d) => `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  // domingo da semana da data (ou o próximo, se proximo=true e a data não for domingo)
  function domingoDe(d, proximo) {
    const dw = d.getUTCDay();
    if (dw === 0) return d;
    return proximo ? somaDias(d, 7 - dw) : somaDias(d, -dw);
  }

  function datasDoPlano(p) {
    const ini = domingoDe(lerISO(p.inicio) || domingoDe(new Date(), true));
    const out = [];
    for (let i = 0; i < p.semanas * 7; i++) {
      const d = somaDias(ini, i);
      out.push({ i, iso: iso(d), d, dow: d.getUTCDay(), semana: Math.floor(i / 7) });
    }
    return out;
  }

  // ---------- turnos e presença ----------
  function turnoDe(p, pessoa) {
    return p.turnos.find((t) => t.id === pessoa.turno) || p.turnos[0] || null;
  }
  function saidaTurno(t) { return hm(t.entrada) + t.jornadaMin + t.almocoMin; }

  // horário da loja no dia: [abre, fecha] em minutos, ou null se fechada (ex.: CD no domingo)
  function horarioDia(p, dow) {
    const f = p.funcionamento || {};
    const h = dow === 0 ? f.dom : dow === 6 ? (f.sab || f.segsab) : f.segsab;
    if (!h || !h[0] || !h[1]) return null;
    const a = hm(h[0]), b = hm(h[1]);
    return b > a ? [a, b] : null;
  }
  const abertaNoDia = (p, dow) => !!horarioDia(p, dow);

  // deslocamento do turno no domingo: a pessoa faz a jornada inteira dela, mas se o turno passa
  // da hora que a loja fecha no domingo, ele é puxado para mais cedo (sem começar antes de abrir)
  function deslocDomingo(p, t) {
    const h = horarioDia(p, 0);
    if (!h || !t) return 0;
    const e = hm(t.entrada), fim = saidaTurno(t);
    if (fim <= h[1]) return 0;
    return -Math.min(fim - h[1], Math.max(0, e - h[0]));
  }

  // intervalos [ini, fim) em minutos em que a pessoa está no posto
  function intervalos(p, pessoa, dow, valor) {
    const domingo = valor === "D" && dow === 0;
    if (!domingo && (valor !== "T" || dow === 0)) return [];
    const t = turnoDe(p, pessoa);
    if (!t) return [];
    const sh = domingo ? deslocDomingo(p, t) : 0;
    const e = hm(t.entrada) + sh, fim = saidaTurno(t) + sh;
    const a = almocoDe(t, pessoa) + sh, b = a + t.almocoMin;
    if (t.almocoMin > 0 && a > e && b < fim) return [[e, a], [b, fim]];
    return [[e, fim]];
  }
  // entrada–saída da pessoa no dia (para mostrar)
  function horarioPessoa(p, pessoa, dow, valor) {
    const t = turnoDe(p, pessoa);
    if (!t) return "";
    const sh = valor === "D" && dow === 0 ? deslocDomingo(p, t) : 0;
    return `${fmtHM(hm(t.entrada) + sh)}–${fmtHM(saidaTurno(t) + sh)}`;
  }
  // almoço da pessoa = almoço do turno + ajuste individual (para escalonar quem é do mesmo turno)
  function almocoDe(t, pessoa) { return hm(t.almoco) + (+pessoa?.almocoAjuste || 0); }
  function limitesAlmoco(t) {
    // pelo menos 2h trabalhadas antes e 1h depois do almoço
    const e = hm(t.entrada), fim = saidaTurno(t);
    return { min: e + 120, max: fim - 60 - t.almocoMin };
  }
  // horas do dia = jornada da pessoa (turno), não o horário de funcionamento da loja
  function minutosTrabalho(p, pessoa, dow, valor) {
    if ((valor === "D" && dow === 0) || (valor === "T" && dow !== 0)) { const t = turnoDe(p, pessoa); return t ? t.jornadaMin : 0; }
    return 0;
  }

  function valorPadrao(dow) { return dow === 0 ? "F" : "T"; }
  function valor(p, pid, data) {
    const v = p.grade?.[pid]?.[data.iso];
    if (v === "X" || v === "F") return v;
    if (data.dow === 0) return v === "D" ? "D" : v === "T" ? "D" : v || "F";
    return v === "D" ? "T" : v || "T";
  }
  const trabalha = (v) => v === "T" || v === "D";

  // ---------- janela do mapa e mínimos ----------
  function janela(p) {
    let a = 24 * 60, b = 0;
    for (const dw of [0, 1, 6]) { const h = horarioDia(p, dw); if (h) { a = Math.min(a, h[0]); b = Math.max(b, h[1]); } }
    for (const t of p.turnos) { a = Math.min(a, hm(t.entrada)); b = Math.max(b, saidaTurno(t)); }
    if (a >= b) { a = 8 * 60; b = 18 * 60; }
    a = Math.floor(a / 60) * 60; b = Math.ceil(b / 60) * 60;
    if (b <= a) b = a + 60;
    return { ini: a, fim: Math.min(b, 24 * 60), n: Math.max(1, Math.round((Math.min(b, 1440) - a) / PASSO)) };
  }

  function minimoNoSlot(p, dow, t) {
    if (!abertaNoDia(p, dow)) return 0;
    let melhor = null;
    for (const f of p.minimos.faixas) {
      const g = GRUPOS_DIAS[f.dias];
      if (!g || !g.dias.includes(dow)) continue;
      if (t >= hm(f.de) && t < hm(f.ate)) melhor = Math.max(melhor ?? 0, +f.min || 0);
    }
    if (melhor != null) return melhor;
    const fh = horarioDia(p, dow);
    if (!fh || t < fh[0] || t >= fh[1]) return 0;
    return dow === 0 ? +p.domingo.minimo || 0 : +p.minimos.geral || 0;
  }

  // ---------- análise completa ----------
  function analisar(p, pessoas) {
    const dias = datasDoPlano(p);
    const jan = janela(p);
    const limite = p.cenario * 60;
    const alvo = folgasSemana(p.cenario);
    const porDia = dias.map((d) => {
      const cov = new Array(jan.n).fill(0), min = new Array(jan.n).fill(0);
      for (let k = 0; k < jan.n; k++) min[k] = minimoNoSlot(p, d.dow, jan.ini + k * PASSO);
      let trab = 0;
      for (const pe of pessoas) {
        const v = valor(p, pe.id, d);
        if (trabalha(v)) trab++;
        for (const [a, b] of intervalos(p, pe, d.dow, v)) {
          for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b) cov[k]++; }
        }
      }
      let abaixo = 0;
      for (let k = 0; k < jan.n; k++) if (cov[k] < min[k]) abaixo++;
      return { ...d, cov, min, trab, abaixo };
    });

    // problemas agrupados pelo dia da semana
    const problemas = [];
    let faixasAbaixo = 0;
    for (const x of porDia) faixasAbaixo += x.abaixo;
    for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
      const ds = porDia.filter((x) => x.dow === dow);
      const ruins = ds.filter((x) => x.abaixo > 0);
      if (!ruins.length) continue;
      // exemplo: faixas da 1ª semana com problema, juntando os horários seguidos
      const r = ruins[0], faixas = [];
      let ini = null;
      for (let k = 0; k <= jan.n; k++) {
        const ruim = k < jan.n && r.cov[k] < r.min[k];
        if (ruim && ini == null) ini = k;
        if (!ruim && ini != null) { faixas.push(`${fmtHM(jan.ini + ini * PASSO)}–${fmtHM(jan.ini + k * PASSO)}`); ini = null; }
      }
      const pior = Math.max(...ruins.map((x) => Math.max(...x.min.map((m, k) => m - x.cov[k]))));
      problemas.push({ dow, primeiraSemana: r.semana, semanas: ruins.length, total: ds.length, faixas, pior, slots: ruins.reduce((s, x) => s + x.abaixo, 0) });
    }

    // horas por semana, folgas e regras por pessoa
    const horas = {}, avisos = [];
    for (const pe of pessoas) {
      horas[pe.id] = [];
      let seguidos = 0, maxSeguidos = 0, domSeg = 0, maxDomSeg = 0, folgaSeg = 0, maxFolgaSeg = 0;
      for (let w = 0; w < p.semanas; w++) {
        let min = 0, folgas = 0, aus = 0;
        for (const d of dias.slice(w * 7, w * 7 + 7)) {
          const v = valor(p, pe.id, d);
          min += minutosTrabalho(p, pe, d.dow, v);
          if (v === "F") folgas++;
          if (v === "X") aus++;
          if (trabalha(v)) { seguidos++; maxSeguidos = Math.max(maxSeguidos, seguidos); } else seguidos = 0;
          if (v === "F") { folgaSeg++; maxFolgaSeg = Math.max(maxFolgaSeg, folgaSeg); } else folgaSeg = 0;
          if (d.dow === 0) { if (v === "D") { domSeg++; maxDomSeg = Math.max(maxDomSeg, domSeg); } else domSeg = 0; }
        }
        horas[pe.id].push({ min, folgas, aus, acima: min > limite, poucaFolga: aus === 0 && folgas < alvo, muitaFolga: alvo === 2 && aus === 0 && folgas > alvo });
        const h = horas[pe.id][w];
        if (h.poucaFolga) avisos.push({ pid: pe.id, nome: pe.nome, txt: `semana ${w + 1}: só ${folgas} folga(s)` });
        if (h.muitaFolga) avisos.push({ pid: pe.id, nome: pe.nome, txt: `semana ${w + 1}: ${folgas} folgas (fica abaixo das horas)` });
        if (h.acima) avisos.push({ pid: pe.id, nome: pe.nome, txt: `semana ${w + 1}: ${fmtDur(min)}, acima de ${p.cenario}h` });
      }
      if (maxFolgaSeg >= 3) avisos.push({ pid: pe.id, nome: pe.nome, txt: `${maxFolgaSeg} folgas seguidas (máx. 2)` });
      if (maxSeguidos > 6) avisos.push({ pid: pe.id, nome: pe.nome, txt: `${maxSeguidos} dias seguidos sem folga (máx. 6)` });
      if (maxDomSeg > (p.domingosSeguidosMax || 2)) avisos.push({ pid: pe.id, nome: pe.nome, txt: `${maxDomSeg} domingos seguidos (máx. ${p.domingosSeguidosMax || 2})` });
    }
    return { dias, porDia, jan, problemas, faixasAbaixo, horas, avisos, limite };
  }

  // ---------- redistribuição automática ----------
  // Domingo: escala exatamente o necessário, em rodízio (quem trabalhou menos domingos vai primeiro,
  // respeitando o máximo de domingos seguidos). Semana: cada pessoa fica com 2 folgas no total
  // (a folga de domingo conta); as folgas de seg a sáb vão para o dia em que a saída da pessoa
  // menos derruba a cobertura abaixo do mínimo e que tem menos movimento (peso do dia).
  // Células ajustadas à mão (travadas) e ausências (X) não são mexidas.
  function redistribuir(p, pessoas) {
    const dias = datasDoPlano(p);
    const jan = janela(p);
    const travado = (pid, d) => !!p.travas?.[pid]?.[d.iso] || p.grade?.[pid]?.[d.iso] === "X";
    const set = (pid, d, v) => { (p.grade[pid] ||= {})[d.iso] = v; };
    p.grade ||= {}; p.travas ||= {};
    const maxDomSeg = p.domingosSeguidosMax || 2;
    const domContagem = {}, domSeguidos = {};
    pessoas.forEach((pe) => { domContagem[pe.id] = 0; domSeguidos[pe.id] = 0; });

    // necessidade do domingo = maior mínimo dentro do horário de domingo
    const hDom = horarioDia(p, 0);
    let reqDom = 0;
    if (hDom) {
      for (let k = 0; k < jan.n; k++) {
        const t = jan.ini + k * PASSO;
        if (t >= hDom[0] && t < hDom[1]) reqDom = Math.max(reqDom, minimoNoSlot(p, 0, t));
      }
      if (!reqDom) reqDom = +p.domingo.minimo || 0;
    }
    // folga (F ou X) no dia de índice i? fora do período conta como "não sei" (false)
    const folgaEm = (pe, i) => i >= 0 && i < dias.length && ["F", "X"].includes(valor(p, pe.id, dias[i]));

    const pesos = p.pesos || {};
    const n = pessoas.length;
    const alvo = folgasSemana(p.cenario);   // 1 folga no 44h (6x1, como hoje), 2 no 42h/40h (5x2)

    for (let w = 0; w < p.semanas; w++) {
      const semana = dias.slice(w * 7, w * 7 + 7);
      // 1) limpa o que não está travado
      for (const pe of pessoas) for (const d of semana) if (!travado(pe.id, d)) set(pe.id, d, valorPadrao(d.dow));

      // 2) domingo
      const dom = semana[0];
      let escalados = 0;
      const livres = [];
      pessoas.forEach((pe, idx) => {
        const v = valor(p, pe.id, dom);
        if (travado(pe.id, dom)) { if (v === "D") escalados++; return; }
        if (!hDom || pe.domingo === "nunca") return;
        if (pe.domingo === "sempre") { set(pe.id, dom, "D"); escalados++; return; }
        livres.push({ pe, idx });
      });
      // folgar neste domingo juntaria 3 folgas (sábado de folga antes + folga fixa na segunda)? vai trabalhar primeiro
      // folgar neste domingo juntaria 3 folgas? (sex+sáb de folga antes, ou sáb antes + folga fixa na segunda)
      const risco3 = (pe) => (folgaEm(pe, dom.i - 1) && (folgaEm(pe, dom.i - 2) || +pe.folgaFixa === 1) ? 1 : 0);
      livres.sort((a, b) =>
        ((domSeguidos[a.pe.id] >= maxDomSeg) - (domSeguidos[b.pe.id] >= maxDomSeg)) ||
        (risco3(b.pe) - risco3(a.pe)) ||
        (domContagem[a.pe.id] - domContagem[b.pe.id]) ||
        (((a.idx - w) % n + n) % n - (((b.idx - w) % n + n) % n)));
      // cobertura do domingo por horário: o rodízio preenche os horários que estão abaixo do mínimo
      // (assim a abertura e o fechamento entram no domingo, não só quem é do turno com mais gente)
      const covDom = new Array(jan.n).fill(0), minDom = new Array(jan.n).fill(0);
      for (let k = 0; k < jan.n; k++) minDom[k] = minimoNoSlot(p, 0, jan.ini + k * PASSO);
      const somaDom = (pe) => {
        for (const [a, b] of intervalos(p, pe, 0, "D"))
          for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b) covDom[k]++; }
      };
      const ajudaDom = (pe) => {
        let g = 0;
        for (const [a, b] of intervalos(p, pe, 0, "D"))
          for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b && covDom[k] < minDom[k]) g++; }
        return g;
      };
      for (const pe of pessoas) if (valor(p, pe.id, dom) === "D") somaDom(pe);
      let fila = livres.map((x) => x.pe);
      // quem juntaria 3 folgas trabalha o domingo mesmo passando do mínimo
      for (const pe of fila.filter(risco3)) { set(pe.id, dom, "D"); escalados++; somaDom(pe); }
      fila = fila.filter((pe) => !risco3(pe));
      // teto por turno num mesmo domingo: no máx. maxDomSeg de cada (maxDomSeg+1) pessoas do turno
      // (ex.: máx. 2 domingos seguidos → 2/3 do turno), para o rodízio se sustentar semana a semana
      const noTurno = {}, usadosTurno = {};
      for (const pe of pessoas) if (pe.domingo !== "nunca") noTurno[pe.turno] = (noTurno[pe.turno] || 0) + 1;
      for (const pe of pessoas) if (valor(p, pe.id, dom) === "D") usadosTurno[pe.turno] = (usadosTurno[pe.turno] || 0) + 1;
      const tetoTurno = (pe) => Math.max(1, Math.ceil((noTurno[pe.turno] || 1) * maxDomSeg / (maxDomSeg + 1)));
      const cabe = (pe) => (usadosTurno[pe.turno] || 0) < tetoTurno(pe);
      const usa = (pe) => { usadosTurno[pe.turno] = (usadosTurno[pe.turno] || 0) + 1; };
      while (hDom && fila.length) {
        // o 1º da fila do rodízio que cobre algum horário em falta
        // (quem já está no máximo de domingos seguidos não entra: o domingo fica com o aviso de falta)
        const i = fila.findIndex((pe) => domSeguidos[pe.id] < maxDomSeg && cabe(pe) && ajudaDom(pe) > 0);
        if (i < 0) break;
        const pe = fila.splice(i, 1)[0];
        set(pe.id, dom, "D"); escalados++; somaDom(pe); usa(pe);
      }
      // garante pelo menos o mínimo do domingo em quantidade (caso sem faixas por horário)
      for (const pe of fila) { if (escalados >= reqDom) break; if (domSeguidos[pe.id] >= maxDomSeg || !cabe(pe)) continue; set(pe.id, dom, "D"); escalados++; somaDom(pe); usa(pe); }
      for (const pe of pessoas) {
        if (valor(p, pe.id, dom) === "D") { domContagem[pe.id]++; domSeguidos[pe.id]++; } else domSeguidos[pe.id] = 0;
      }

      // 3) cobertura de seg a sáb com todo mundo trabalhando
      const cov = {}, min = {};
      for (const d of semana.slice(1)) {
        cov[d.iso] = new Array(jan.n).fill(0); min[d.iso] = new Array(jan.n).fill(0);
        for (let k = 0; k < jan.n; k++) min[d.iso][k] = minimoNoSlot(p, d.dow, jan.ini + k * PASSO);
        for (const pe of pessoas) for (const [a, b] of intervalos(p, pe, d.dow, valor(p, pe.id, d)))
          for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b) cov[d.iso][k]++; }
      }

      const diasSeguidosAntes = (pe, d) => {
        let c = 0;
        for (let i = d.i - 1; i >= 0; i--) { if (trabalha(valor(p, pe.id, dias[i]))) c++; else break; }
        return c;
      };

      // 4a) folga fixa (DSR ou escolhida na tela Pessoas): entra primeiro, no dia dela
      for (const pe of pessoas) {
        if (pe.folgaFixa == null) continue;
        const d = semana.find((x) => x.dow === +pe.folgaFixa && x.dow !== 0);
        if (!d || travado(pe.id, d) || valor(p, pe.id, d) !== "T") continue;
        if (semana.filter((x) => ["F", "X"].includes(valor(p, pe.id, x))).length >= alvo) continue;
        // 44h (1 folga): se a folga fixa deixaria mais de 6 dias seguidos antes dela, a folga vem antes (4b)
        if (alvo === 1 && diasSeguidosAntes(pe, d) > 6) continue;
        set(pe.id, d, "F");
        for (const [a, b] of intervalos(p, pe, d.dow, "T"))
          for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b) cov[d.iso][k]--; }
      }

      // 4b) demais folgas de seg a sáb, em 2 rodadas (1ª folga de todo mundo, depois a 2ª)
      const ordem = pessoas.map((pe, idx) => ({ pe, idx })).sort((a, b) => ((a.idx + w) % n) - ((b.idx + w) % n));
      for (let rodada = 0; rodada < alvo; rodada++) {
        for (const { pe } of ordem) {
          const vs = semana.map((d) => valor(p, pe.id, d));
          const folgas = vs.filter((v) => v === "F" || v === "X").length;
          if (folgas >= alvo) continue;
          let melhor = null, melhorNota = -Infinity;
          for (const d of semana.slice(1)) {
            if (travado(pe.id, d) || valor(p, pe.id, d) !== "T") continue;
            const ints = intervalos(p, pe, d.dow, "T");
            let deficit = 0, sobra = 0, nSlots = 0;
            for (const [a, b] of ints) for (let k = 0; k < jan.n; k++) {
              const t = jan.ini + k * PASSO;
              if (t < a || t >= b) continue;
              const m = min[d.iso][k], c = cov[d.iso][k];
              // aprofundar um buraco que já existe pesa mais do que abrir um novo (espalha as folgas)
              const antes = Math.max(0, m - c), depois = Math.max(0, m - (c - 1));
              deficit += depois * depois - antes * antes;
              sobra += c - m; nSlots++;
            }
            let nota = -deficit * 60 + (nSlots ? (sobra / nSlots) * 6 : 0) - (+pesos[d.dow] || 3) * 5;
            // dia sem folga (ex.: terça e sábado, os dias mais fortes): só se não houver outro jeito
            if ((p.diasSemFolga || []).includes(d.dow)) nota -= 2000;
            if (pe.folgaFixa && +pe.folgaFixa === d.dow) nota += 400;
            if (pe.folgaFixa2 && +pe.folgaFixa2 === d.dow) nota += 300;   // 2ª folga preferida (DSR2)
            // mesma folga da semana passada = escala mais previsível
            if (w > 0 && valor(p, pe.id, dias[d.i - 7]) === "F") nota += 4;
            // não deixar passar de 6 dias seguidos trabalhando
            // (no 44h/6x1 a pessoa tem 1 folga só: a folga tem de cair antes do 7º dia seguido,
            //  vale mais que evitar terça/sábado; quanto mais dias seguidos antes, mais cedo deve cair)
            const seg = diasSeguidosAntes(pe, d);
            if (seg > 6) nota -= alvo === 1 ? 3000 + (seg - 6) * 1000 : 600;
            else if (alvo === 1 && seg >= 4) nota += (seg - 3) * 30;
            // nunca juntar 3 folgas seguidas (ex.: sáb + dom + seg)
            // (só olha o que já foi decidido: dias anteriores e esta semana; o domingo seguinte
            //  conta como folga certa quando a pessoa nunca trabalha domingo ou a loja fecha)
            let antes = 0, depois = 0;
            for (let i = d.i - 1; folgaEm(pe, i); i--) antes++;
            for (let i = d.i + 1; i <= w * 7 + 6 && folgaEm(pe, i); i++) depois++;
            const domCertoF = !hDom || pe.domingo === "nunca";
            if (d.dow === 6 && domCertoF) depois += 1 + (+pe.folgaFixa === 1 ? 1 : 0);
            if (antes + depois + 1 >= 3) nota -= 800;
            // sábado com folga fixa na segunda: se folgar o próximo domingo, juntaria 3
            else if (d.dow === 6 && +pe.folgaFixa === 1 && pe.domingo !== "sempre") nota -= 150;
            // evita colar duas folgas da semana no mesmo dia vizinho sem necessidade (espalha)
            if (valor(p, pe.id, dias[d.i - 1]) === "F" || (dias[d.i + 1] && valor(p, pe.id, dias[d.i + 1]) === "F")) nota -= 1;
            if (nota > melhorNota) { melhorNota = nota; melhor = d; }
          }
          if (!melhor) continue;
          set(pe.id, melhor, "F");
          for (const [a, b] of intervalos(p, pe, melhor.dow, "T"))
            for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b) cov[melhor.iso][k]--; }
        }
      }
    }
    // 5) garantia final: ninguém com mais de 6 dias seguidos trabalhando
    corrigirSeguidos(p, pessoas, dias, travado, set, hDom);
    // limpa a grade de datas fora do período
    const validas = new Set(dias.map((d) => d.iso));
    for (const pid in p.grade) for (const k in p.grade[pid]) if (!validas.has(k) && !p.travas?.[pid]?.[k]) delete p.grade[pid][k];
  }

  // ---------- nunca mais de 6 dias seguidos ----------
  // Passa pela escala de cada pessoa e, na 1ª sequência de 7+ dias trabalhando, coloca uma folga dentro
  // dela. De preferência TROCA com uma folga da mesma semana que está fora da sequência (as horas da
  // semana não mudam); se não der, entra uma folga a mais na semana (ex.: no 44h/6x1, quem folgou um
  // domingo e trabalha o próximo). Evita terça/sábado, 3 folgas juntas e mexer no rodízio do domingo.
  // Células travadas (ajuste à mão) e ausências não são mexidas.
  const MAX_SEGUIDOS = 6;
  function maiorSequencia(vs, ate) {
    let c = 0, m = 0;
    for (let i = 0; i <= ate; i++) { if (trabalha(vs[i])) { c++; if (c > m) m = c; } else c = 0; }
    return m;
  }
  function corrigirSeguidos(p, pessoas, dias, travado, set, hDom) {
    const bloq = p.diasSemFolga || [], pesos = p.pesos || {}, maxDom = p.domingosSeguidosMax || 2;
    const folga = (v) => v === "F" || v === "X";
    for (const pe of pessoas) {
      for (let volta = 0; volta < dias.length; volta++) {
        const vs = dias.map((d) => valor(p, pe.id, d));
        let c = 0, fim = -1;
        for (let i = 0; i < vs.length; i++) { if (trabalha(vs[i])) { if (++c > MAX_SEGUIDOS) { fim = i; break; } } else c = 0; }
        if (fim < 0) break;
        const ini = fim - MAX_SEGUIDOS;
        let melhor = null, melhorNota = -Infinity;
        for (let j = ini; j <= fim; j++) {
          const d = dias[j];
          if (!trabalha(vs[j]) || travado(pe.id, d)) continue;
          if (d.dow === 0 && pe.domingo === "sempre") continue;
          const trocas = [null];
          for (let k = d.semana * 7; k < d.semana * 7 + 7; k++) {
            if (k === j || (k >= ini && k <= fim) || vs[k] !== "F" || travado(pe.id, dias[k])) continue;
            if (dias[k].dow === 0 && (!hDom || pe.domingo === "nunca")) continue;
            trocas.push(k);
          }
          for (const k of trocas) {
            const t = vs.slice();
            t[j] = "F";
            if (k != null) t[k] = dias[k].dow === 0 ? "D" : "T";
            if (maiorSequencia(t, fim) > MAX_SEGUIDOS) continue;
            let nota = 0;
            if (k == null) nota -= 100;                                 // folga a mais na semana
            if (k != null && dias[k].dow === 0) nota -= 150;            // muda o rodízio do domingo
            if (d.dow === 0) nota -= 400;                               // tirar do domingo derruba o rodízio
            if (bloq.includes(d.dow)) nota -= 60;                       // terça/sábado
            if (k != null && dias[k].dow !== 0 && t[k] === "T" && (pe.folgaFixa === dias[k].dow)) nota -= 20;
            if (+pe.folgaFixa === d.dow || +pe.folgaFixa2 === d.dow) nota += 20;
            nota -= (+pesos[d.dow] || 3) * 2;                           // dia de mais movimento
            let a = 0, b = 0;
            for (let i = j - 1; i >= 0 && folga(t[i]); i--) a++;
            for (let i = j + 1; i < t.length && folga(t[i]); i++) b++;
            if (a + b + 1 >= 3) nota -= 300;                            // 3 folgas juntas
            let ds = 0, mds = 0;
            for (let i = 0; i < t.length; i++) if (dias[i].dow === 0) { if (t[i] === "D") { ds++; mds = Math.max(mds, ds); } else ds = 0; }
            if (mds > maxDom) nota -= 200;
            if (nota > melhorNota) { melhorNota = nota; melhor = { j, k }; }
          }
        }
        if (!melhor) break;   // tudo travado: fica o aviso
        set(pe.id, dias[melhor.j], "F");
        if (melhor.k != null) set(pe.id, dias[melhor.k], dias[melhor.k].dow === 0 ? "D" : "T");
      }
    }
  }

  // ---------- sugerir mínimos pela equipe ----------
  // Simula a escala sem mínimos (folgas só pelo movimento do dia), mede quantas pessoas a equipe
  // consegue deixar no posto em cada horário e propõe faixas um pouco abaixo disso (20% piores dias,
  // arredondado para baixo), em blocos de pelo menos 1h. Assim o mínimo é exigente mas possível.
  function sugerirMinimos(p, pessoas) {
    const q = JSON.parse(JSON.stringify(p));
    q.minimos = { geral: 0, faixas: [] }; q.domingo = { ...q.domingo, minimo: +p.domingo?.minimo || Math.max(1, Math.round(pessoas.length * 0.25)) };   // domingo: mantém a quantidade para o rodízio acontecer q.travas = {}; q.grade = {};
    q.semanas = Math.max(4, Math.min(q.semanas || 4, 8));
    redistribuir(q, pessoas);
    const an = analisar(q, pessoas);
    const jan = an.jan;
    const perc = (arr) => { const v = arr.slice().sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) * 0.2)] : 0; };
    const curva = (dias) => {
      const out = new Array(jan.n).fill(0);
      for (let k = 0; k < jan.n; k++) out[k] = perc(dias.map((x) => x.cov[k]));
      return out;
    };
    // blocos de mesmo valor, juntando os menores que 1h no vizinho de valor menor
    function blocos(v, hor) {
      if (!hor) return [];
      let bs = [];
      for (let k = 0; k < jan.n; k++) {
        const t = jan.ini + k * PASSO;
        if (t < hor[0] || t >= hor[1]) continue;
        const m = Math.max(1, Math.floor(v[k] * 0.9));
        const ult = bs[bs.length - 1];
        if (ult && ult.min === m && ult.ate === t) ult.ate = t + PASSO; else bs.push({ de: t, ate: t + PASSO, min: m });
      }
      for (let volta = 0; volta < 50; volta++) {
        const i = bs.findIndex((x) => x.ate - x.de < 60);
        if (i < 0 || bs.length < 2) break;
        const viz = i === 0 ? 1 : i === bs.length - 1 ? i - 1 : (bs[i - 1].min <= bs[i + 1].min ? i - 1 : i + 1);
        const a = Math.min(i, viz), b = Math.max(i, viz);
        bs.splice(a, 2, { de: bs[a].de, ate: bs[b].ate, min: Math.min(bs[a].min, bs[b].min) });
        // junta vizinhos que ficaram iguais
        bs = bs.reduce((acc, x) => { const u = acc[acc.length - 1]; if (u && u.min === x.min && u.ate === x.de) u.ate = x.ate; else acc.push({ ...x }); return acc; }, []);
      }
      return bs;
    }
    const semana = an.porDia.filter((x) => x.dow !== 0);
    const sabDif = JSON.stringify(horarioDia(p, 6)) !== JSON.stringify(horarioDia(p, 1));
    const faixas = [];
    const add = (dias, bs) => bs.forEach((b) => faixas.push({ dias, de: fmtHM(b.de), ate: fmtHM(b.ate), min: b.min }));
    let geral = 1;
    if (sabDif) {
      const bsx = blocos(curva(semana.filter((x) => x.dow !== 6)), horarioDia(p, 1));
      const bss = blocos(curva(semana.filter((x) => x.dow === 6)), horarioDia(p, 6));
      add("segsex", bsx); add("sab", bss);
      geral = Math.min(...bsx.map((b) => b.min), ...(bss.length ? bss.map((b) => b.min) : [99]));
    } else {
      const bs = blocos(curva(semana), horarioDia(p, 1));
      add("segsab", bs);
      geral = bs.length ? Math.min(...bs.map((b) => b.min)) : 1;
    }
    let dom = 0;
    if (horarioDia(p, 0)) {
      const bd = blocos(curva(an.porDia.filter((x) => x.dow === 0)), horarioDia(p, 0));
      add("dom", bd);
      dom = bd.length ? Math.min(...bd.map((b) => b.min)) : 0;
    }
    return { geral: geral === 99 ? 1 : geral, domingo: dom, faixas };
  }

  // ---------- escalonar almoços ----------
  // Para cada pessoa, testa o almoço do turno de 1h antes até 1h depois (de 15 em 15 min) e fica com
  // o que deixa menos gente abaixo do mínimo (falta maior pesa mais). Empate: o mais perto do horário do turno.
  function custoCobertura(p, pessoas) {
    const an = analisar(p, pessoas);
    let c = 0;
    for (const x of an.porDia) for (let k = 0; k < x.cov.length; k++) { const f = x.min[k] - x.cov[k]; if (f > 0) c += f * f; }
    return c;
  }
  function escalonarAlmocos(p, pessoas) {
    const antes = custoCobertura(p, pessoas);
    // simulação com 2 semanas basta (o padrão se repete) e deixa o cálculo rápido
    const q = { ...p, semanas: Math.min(p.semanas, 2) };
    const ordem = [...pessoas].sort((a, b) => String(a.turno).localeCompare(String(b.turno)));
    ordem.forEach((pe) => { pe.almocoAjuste = 0; });
    for (let rodada = 0; rodada < 2; rodada++) {
      for (const pe of ordem) {
        const t = turnoDe(p, pe);
        if (!t || !t.almocoMin) continue;
        const lim = limitesAlmoco(t);
        let melhor = pe.almocoAjuste || 0, melhorC = Infinity;
        for (let aj = -60; aj <= 60; aj += 15) {
          const ini = hm(t.almoco) + aj;
          if (ini < lim.min || ini > lim.max) continue;
          pe.almocoAjuste = aj;
          const c = custoCobertura(q, pessoas) + Math.abs(aj) / 1000;
          if (c < melhorC) { melhorC = c; melhor = aj; }
        }
        pe.almocoAjuste = melhor;
      }
    }
    return { antes, depois: custoCobertura(p, pessoas) };
  }

  // ---------- horário do Senior → entrada / almoço ----------
  // "SG-SB 12:00-15:00 17:00-21:20" ou "SEG/SB 13:10 15:00 16:50 22:20"
  // "SG-SX 7:00-17:00 SB 7:00-11:00" (seg a sex corrido + sábado curto) → usa o horário de seg a sex,
  // com almoço de 1h no meio do dia
  function lerEscalaSenior(txt) {
    const hs = (String(txt || "").match(/\d{1,2}:\d{2}/g) || []).map(hm);
    if (hs.length >= 4) {
      const [a, b, c, d] = hs;
      if (a < b && b < c && c < d) return { entrada: fmtHM(a), almoco: fmtHM(b), almocoMin: c - b, jornadaMin: (b - a) + (d - c), saida: fmtHM(d) };
    }
    if (hs.length >= 2 && hs[0] < hs[1] && hs[1] - hs[0] >= 360) {
      const [a, d] = hs;
      const meio = Math.round(((a + d) / 2 - 30) / 15) * 15;
      return { entrada: fmtHM(a), almoco: fmtHM(meio), almocoMin: 60, jornadaMin: d - a - 60, saida: fmtHM(d) };
    }
    return null;
  }

  window.Motor = {
    DOW, DOW_LONGO, PASSO, GRUPOS_DIAS, CENARIOS, folgasSemana, jornadaCenario, ajustarCenario,
    hm, fmtHM, fmtDur, lerISO, iso, somaDias, dataCurta, dataBR, domingoDe,
    datasDoPlano, turnoDe, saidaTurno, intervalos, horarioDia, abertaNoDia, horarioPessoa, almocoDe, limitesAlmoco, escalonarAlmocos, minutosTrabalho, valor, trabalha,
    janela, minimoNoSlot, analisar, redistribuir, lerEscalaSenior, sugerirMinimos,
  };
})();
