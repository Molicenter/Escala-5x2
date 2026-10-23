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
        horas[pe.id].push({ min, folgas, aus, acima: min > limite, poucaFolga: aus === 0 && folgas < 2, muitaFolga: aus === 0 && folgas > 2 });
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
      const risco3 = (pe) => (folgaEm(pe, dom.i - 1) && +pe.folgaFixa === 1 ? 1 : 0);
      livres.sort((a, b) =>
        ((domSeguidos[a.pe.id] >= maxDomSeg) - (domSeguidos[b.pe.id] >= maxDomSeg)) ||
        (risco3(b.pe) - risco3(a.pe)) ||
        (domContagem[a.pe.id] - domContagem[b.pe.id]) ||
        (((a.idx - w) % n + n) % n - (((b.idx - w) % n + n) % n)));
      for (const { pe } of livres) { if (escalados >= reqDom) break; set(pe.id, dom, "D"); escalados++; }
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
        if (semana.filter((x) => ["F", "X"].includes(valor(p, pe.id, x))).length >= 2) continue;
        set(pe.id, d, "F");
        for (const [a, b] of intervalos(p, pe, d.dow, "T"))
          for (let k = 0; k < jan.n; k++) { const t = jan.ini + k * PASSO; if (t >= a && t < b) cov[d.iso][k]--; }
      }

      // 4b) demais folgas de seg a sáb, em 2 rodadas (1ª folga de todo mundo, depois a 2ª)
      const ordem = pessoas.map((pe, idx) => ({ pe, idx })).sort((a, b) => ((a.idx + w) % n) - ((b.idx + w) % n));
      for (let rodada = 0; rodada < 2; rodada++) {
        for (const { pe } of ordem) {
          const vs = semana.map((d) => valor(p, pe.id, d));
          const folgas = vs.filter((v) => v === "F" || v === "X").length;
          if (folgas >= 2) continue;
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
            if (pe.folgaFixa && +pe.folgaFixa === d.dow) nota += 400;
            if (pe.folgaFixa2 && +pe.folgaFixa2 === d.dow) nota += 300;   // 2ª folga preferida (DSR2)
            // mesma folga da semana passada = escala mais previsível
            if (w > 0 && valor(p, pe.id, dias[d.i - 7]) === "F") nota += 4;
            // não deixar passar de 6 dias seguidos trabalhando
            if (diasSeguidosAntes(pe, d) > 6) nota -= 600;
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
    // limpa a grade de datas fora do período
    const validas = new Set(dias.map((d) => d.iso));
    for (const pid in p.grade) for (const k in p.grade[pid]) if (!validas.has(k) && !p.travas?.[pid]?.[k]) delete p.grade[pid][k];
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
    DOW, DOW_LONGO, PASSO, GRUPOS_DIAS, CENARIOS,
    hm, fmtHM, fmtDur, lerISO, iso, somaDias, dataCurta, dataBR, domingoDe,
    datasDoPlano, turnoDe, saidaTurno, intervalos, horarioDia, abertaNoDia, horarioPessoa, almocoDe, limitesAlmoco, escalonarAlmocos, minutosTrabalho, valor, trabalha,
    janela, minimoNoSlot, analisar, redistribuir, lerEscalaSenior,
  };
})();
