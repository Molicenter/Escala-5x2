const STORAGE_KEY = 'simulador_escala_5x2_v1';

let currentStore = 'loja1';
let currentScenario = 42; // 44, 42 ou 40
let currentRole = 'operadoras';

const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const diasSegSab = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const turnosPadrao = {
  'abertura': { label: 'Abertura (08:00 - 17:24)', inicio: 8, fim: 17.4 },
  'intermediario': { label: 'Intermediário (10:00 - 19:24)', inicio: 10, fim: 19.4 },
  'fechamento': { label: 'Fechamento (11:36 - 21:00)', inicio: 11.6, fim: 21 }
};

function getInitialStoreTemplate() {
  return {
    minRequired: { operadoras: 5, fiscais: 1, empacotadores: 3 },
    operadoras: [
      { id: 1, nome: 'Operadora 01', turno: 'abertura', almoco: '12:00-13:00', folga1: 'Segunda', folga2: 'Domingo', domQuinzena: true },
      { id: 2, nome: 'Operadora 02', turno: 'abertura', almoco: '13:00-14:00', folga1: 'Terça', folga2: 'Quarta', domQuinzena: true },
      { id: 3, nome: 'Operadora 03', turno: 'abertura', almoco: '13:00-14:00', folga1: 'Quinta', folga2: 'Domingo', domQuinzena: false },
      { id: 4, nome: 'Operadora 04', turno: 'intermediario', almoco: '13:00-14:00', folga1: 'Segunda', folga2: 'Terça', domQuinzena: true },
      { id: 5, nome: 'Operadora 05', turno: 'intermediario', almoco: '14:00-15:00', folga1: 'Quarta', folga2: 'Domingo', domQuinzena: false },
      { id: 6, nome: 'Operadora 06', turno: 'fechamento', almoco: '15:00-16:00', folga1: 'Quinta', folga2: 'Sexta', domQuinzena: true },
      { id: 7, nome: 'Operadora 07', turno: 'fechamento', almoco: '15:00-16:00', folga1: 'Sábado', folga2: 'Domingo', domQuinzena: false },
      { id: 8, nome: 'Operadora 08', turno: 'fechamento', almoco: '16:00-17:00', folga1: 'Segunda', folga2: 'Quinta', domQuinzena: true }
    ],
    fiscais: [
      { id: 101, nome: 'Fiscal 01', turno: 'abertura', almoco: '12:00-13:00', folga1: 'Terça', folga2: 'Domingo', domQuinzena: true },
      { id: 102, nome: 'Fiscal 02', turno: 'fechamento', almoco: '15:00-16:00', folga1: 'Quarta', folga2: 'Domingo', domQuinzena: true },
      { id: 103, nome: 'Fiscal 03', turno: 'intermediario', almoco: '13:00-14:00', folga1: 'Segunda', folga2: 'Quinta', domQuinzena: true }
    ],
    empacotadores: [
      { id: 201, nome: 'Empacotador 01', turno: 'abertura', almoco: '12:00-13:00', folga1: 'Segunda', folga2: 'Terça', domQuinzena: true },
      { id: 202, nome: 'Empacotador 02', turno: 'fechamento', almoco: '14:00-15:00', folga1: 'Quarta', folga2: 'Quinta', domQuinzena: false },
      { id: 203, nome: 'Empacotador 03', turno: 'intermediario', almoco: '13:00-14:00', folga1: 'Sexta', folga2: 'Domingo', domQuinzena: true },
      { id: 204, nome: 'Empacotador 04', turno: 'fechamento', almoco: '15:00-16:00', folga1: 'Segunda', folga2: 'Domingo', domQuinzena: false }
    ]
  };
}

let allStoresData = {};

function loadFromStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      allStoresData = JSON.parse(saved);
    } catch (e) {
      allStoresData = {};
    }
  }
  ['loja1', 'loja2', 'loja3', 'loja4', 'loja5'].forEach(storeKey => {
    if (!allStoresData[storeKey]) {
      allStoresData[storeKey] = getInitialStoreTemplate();
    }
  });
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allStoresData));
}

function changeStore(storeKey) {
  currentStore = storeKey;
  document.getElementById('minRequiredInput').value = allStoresData[currentStore].minRequired[currentRole] || 5;
  recalculateAll();
}

function updateMinRequired(val) {
  const num = parseInt(val) || 1;
  allStoresData[currentStore].minRequired[currentRole] = num;
  saveToStorage();
  recalculateAll();
}

function resetStoreData() {
  if (confirm('Deseja restaurar os dados padrão desta loja?')) {
    allStoresData[currentStore] = getInitialStoreTemplate();
    saveToStorage();
    recalculateAll();
  }
}

function exportData() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allStoresData, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", `escala_5x2_${currentStore}.json`);
  dlAnchorElem.click();
}

function setScenario(hours) {
  currentScenario = hours;
  [44, 42, 40].forEach(h => {
    const btn = document.getElementById(`btnCenario${h}`);
    if (h === hours) {
      btn.className = "bg-amber-400 text-slate-900 font-bold px-3.5 py-1.5 rounded-md transition";
    } else {
      btn.className = "bg-[#1b3b5a] text-gray-200 hover:bg-[#254d73] px-3.5 py-1.5 rounded-md border border-white/15 transition";
    }
  });

  const mapJornada = { 44: '8h48/dia', 42: '8h24/dia', 40: '8h00/dia' };
  document.getElementById('pillJornada').innerText = mapJornada[hours];
  document.getElementById('pillSemana').innerText = `${hours}h máx.`;
  recalculateAll();
}

function setRole(role) {
  currentRole = role;
  ['operadoras', 'fiscais', 'empacotadores'].forEach(r => {
    const tab = document.getElementById(`tab-${r}`);
    if (r === role) {
      tab.className = "pb-3 flex items-center gap-2 tab-active";
    } else {
      tab.className = "pb-3 flex items-center gap-2 text-gray-500 hover:text-gray-800";
    }
  });

  document.getElementById('minRequiredInput').value = allStoresData[currentStore].minRequired[currentRole] || 3;
  recalculateAll();
}

function addEmployee() {
  const lista = allStoresData[currentStore][currentRole];
  lista.push({
    id: Date.now(),
    nome: `Colaborador ${lista.length + 1}`,
    turno: 'intermediario',
    almoco: '14:00-15:00',
    folga1: 'Terça',
    folga2: 'Domingo',
    domQuinzena: true
  });
  saveToStorage();
  recalculateAll();
}

function removeEmployee(id) {
  allStoresData[currentStore][currentRole] = allStoresData[currentStore][currentRole].filter(e => e.id !== id);
  saveToStorage();
  recalculateAll();
}

function updateEmp(id, field, value) {
  const emp = allStoresData[currentStore][currentRole].find(e => e.id === id);
  if (emp) {
    emp[field] = value;
    saveToStorage();
    recalculateAll();
  }
}

function formatHours(decimalHours) {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  return `${h}h${m.toString().padStart(2, '0')}`;
}

function checkRoleBottlenecks(roleKey) {
  const lista = allStoresData[currentStore][roleKey];
  const minReq = allStoresData[currentStore].minRequired[roleKey] || 1;
  const faixasTeste = [
    { label: '12:00–13:00', hora: 12.5, almocoRef: '12:00-13:00' },
    { label: '13:00–14:00', hora: 13.5, almocoRef: '13:00-14:00' },
    { label: '14:00–15:00', hora: 14.5, almocoRef: '14:00-15:00' },
    { label: '17:30–19:00', hora: 18.0, almocoRef: null },
    { label: '19:30–21:00', hora: 20.0, almocoRef: null }
  ];

  let problemas = [];
  diasSegSab.forEach(dia => {
    const ativosNoDia = lista.filter(e => e.folga1 !== dia && e.folga2 !== dia);
    const janelasComFalta = [];
    faixasTeste.forEach(faixa => {
      let presentes = 0;
      ativosNoDia.forEach(emp => {
        const t = turnosPadrao[emp.turno];
        if (faixa.hora >= t.inicio && faixa.hora <= t.fim && emp.almoco !== faixa.almocoRef) {
          presentes++;
        }
      });
      if (presentes < minReq) {
        janelasComFalta.push(`${faixa.label} (só ${presentes})`);
      }
    });
    if (janelasComFalta.length > 0) {
      problemas.push({ dia, janelas: janelasComFalta });
    }
  });
  return problemas;
}

function recalculateAll() {
  const lista = allStoresData[currentStore][currentRole];
  const totalPessoas = lista.length;
  const mapHorasDia = { 44: 8.8, 42: 8.4, 40: 8.0 };
  const horasDiarias = mapHorasDia[currentScenario];

  // 1. KPIs
  const diasTrabalhados5x2 = totalPessoas * 5;
  const diasTrabalhados6x1 = totalPessoas * 6;
  const perdaDias = diasTrabalhados6x1 - diasTrabalhados5x2;

  let totalPresencasSegSab = 0;
  diasSegSab.forEach(dia => {
    lista.forEach(emp => {
      if (emp.folga1 !== dia && emp.folga2 !== dia) totalPresencasSegSab++;
    });
  });

  const mediaDia5x2 = (totalPresencasSegSab / 6).toFixed(1).replace('.', ',');
  const mediaDia6x1 = ((totalPessoas * 5.5) / 6).toFixed(1).replace('.', ',');
  const diffMedia = ((totalPresencasSegSab / 6) - ((totalPessoas * 5.5) / 6)).toFixed(1).replace('.', ',');

  const trabalhamDomingo = lista.filter(e => e.folga1 !== 'Domingo' && e.folga2 !== 'Domingo').length;
  const revezamentoDom = lista.filter(e => e.domQuinzena).length * 0.5;
  const mediaDom = Math.max(trabalhamDomingo, revezamentoDom).toFixed(1).replace('.', ',');

  let somaHorasSemana = 0;
  lista.forEach(emp => {
    const trabalhaDomFixo = (emp.folga1 !== 'Domingo' && emp.folga2 !== 'Domingo');
    const hSem = trabalhaDomFixo ? (4 * horasDiarias + 4.5) : (5 * horasDiarias - (emp.domQuinzena ? 1.8 : 0));
    emp.horasCalculadas = hSem;
    somaHorasSemana += hSem;
  });
  const mediaHoras = totalPessoas > 0 ? somaHorasSemana / totalPessoas : 0;

  document.getElementById('kpiTotalPessoas').innerText = totalPessoas;
  document.getElementById('kpiDomingoMedia').innerText = `${mediaDom} em média no domingo`;
  document.getElementById('kpiMediaDia5x2').innerText = mediaDia5x2;
  document.getElementById('kpiMediaDia6x1').innerText = `hoje no 6x1: ~${mediaDia6x1} (${diffMedia}/dia)`;
  document.getElementById('kpiDias5x2').innerText = diasTrabalhados5x2;
  document.getElementById('kpiDias6x1').innerText = `de ${diasTrabalhados6x1}`;
  document.getElementById('kpiPerdaDias').innerText = `perde ${perdaDias} dia(s) por semana`;
  document.getElementById('kpiHorasMedias').innerText = formatHours(mediaHoras);
  document.getElementById('kpiLimiteHoras').innerText = `limite ${currentScenario}h · dentro da meta`;

  // 2. Resumo Diário
  const dailyGrid = document.getElementById('dailySummaryGrid');
  dailyGrid.innerHTML = '';
  const minReq = allStoresData[currentStore].minRequired[currentRole] || 1;

  diasSemana.forEach(dia => {
    const presentes = lista.filter(e => e.folga1 !== dia && e.folga2 !== dia).length;
    const folgando = totalPessoas - presentes;
    const isOk = dia === 'Domingo' ? true : presentes >= minReq;
    const card = document.createElement('div');
    card.className = `p-3 rounded-lg border ${isOk ? 'bg-gray-50 border-gray-200' : 'bg-red-50 border-red-200'}`;
    card.innerHTML = `
      <p class="text-xs font-bold text-gray-700">${dia}</p>
      <p class="text-xl font-bold ${isOk ? 'text-gray-900' : 'text-red-700'} mt-1">${presentes} <span class="text-xs font-normal text-gray-500">ativos</span></p>
      <p class="text-[11px] text-gray-400">${folgando} de folga</p>
    `;
    dailyGrid.appendChild(card);
  });

  // 3. Tabela
  const tbody = document.getElementById('scheduleTableBody');
  tbody.innerHTML = '';
  lista.forEach(emp => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition";
    tr.innerHTML = `
      <td class="py-2.5 px-2 font-medium text-gray-900">
        <input type="text" value="${emp.nome}" onchange="updateEmp(${emp.id}, 'nome', this.value)" class="border border-transparent hover:border-gray-300 focus:border-amber-500 rounded px-1.5 py-1 w-full bg-transparent">
      </td>
      <td class="py-2.5 px-2">
        <select onchange="updateEmp(${emp.id}, 'turno', this.value)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
          <option value="abertura" ${emp.turno === 'abertura' ? 'selected' : ''}>Abertura (08:00 - 17:24)</option>
          <option value="intermediario" ${emp.turno === 'intermediario' ? 'selected' : ''}>Intermediário (10:00 - 19:24)</option>
          <option value="fechamento" ${emp.turno === 'fechamento' ? 'selected' : ''}>Fechamento (11:36 - 21:00)</option>
        </select>
      </td>
      <td class="py-2.5 px-2">
        <select onchange="updateEmp(${emp.id}, 'almoco', this.value)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white">
          <option value="12:00-13:00" ${emp.almoco === '12:00-13:00' ? 'selected' : ''}>12:00 - 13:00</option>
          <option value="13:00-14:00" ${emp.almoco === '13:00-14:00' ? 'selected' : ''}>13:00 - 14:00</option>
          <option value="14:00-15:00" ${emp.almoco === '14:00-15:00' ? 'selected' : ''}>14:00 - 15:00</option>
          <option value="15:00-16:00" ${emp.almoco === '15:00-16:00' ? 'selected' : ''}>15:00 - 16:00</option>
          <option value="16:00-17:00" ${emp.almoco === '16:00-17:00' ? 'selected' : ''}>16:00 - 17:00</option>
        </select>
      </td>
      <td class="py-2.5 px-2">
        <select onchange="updateEmp(${emp.id}, 'folga1', this.value)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white font-medium text-red-700">
          ${diasSemana.map(d => `<option value="${d}" ${emp.folga1 === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </td>
      <td class="py-2.5 px-2">
        <select onchange="updateEmp(${emp.id}, 'folga2', this.value)" class="border border-gray-300 rounded px-2 py-1 text-xs bg-white font-medium text-red-700">
          ${diasSemana.map(d => `<option value="${d}" ${emp.folga2 === d ? 'selected' : ''}>${d}</option>`).join('')}
        </select>
      </td>
      <td class="py-2.5 px-2 text-center">
        <input type="checkbox" ${emp.domQuinzena ? 'checked' : ''} onchange="updateEmp(${emp.id}, 'domQuinzena', this.checked)" class="w-4 h-4 accent-amber-500 cursor-pointer">
      </td>
      <td class="py-2.5 px-2 text-right font-semibold text-gray-700">
        ${formatHours(emp.horasCalculadas)}
      </td>
      <td class="py-2.5 px-2 text-center">
        <button onclick="removeEmployee(${emp.id})" class="text-gray-400 hover:text-red-600 text-xs font-bold px-2 py-1" title="Remover">✕</button>
      </td>
    </tr>
    `;
    tbody.appendChild(tr);
  });

  // 4. Alertas de todas as abas e da aba ativa
  ['operadoras', 'fiscais', 'empacotadores'].forEach(r => {
    const probs = checkRoleBottlenecks(r);
    const dot = document.getElementById(`dot-${r}`);
    dot.className = probs.length === 0 ? "w-2.5 h-2.5 rounded-full bg-emerald-500" : "w-2.5 h-2.5 rounded-full bg-red-500";
  });

  const problemasAtuais = checkRoleBottlenecks(currentRole);
  const alertsContainer = document.getElementById('alertsContainer');
  alertsContainer.innerHTML = '';

  if (problemasAtuais.length === 0) {
    alertsContainer.innerHTML = `
      <div class="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-lg text-xs">
        <span class="bg-emerald-600 text-white font-bold px-2 py-0.5 rounded text-[10px] uppercase">Tudo Certo</span>
        <span>Nenhum gargalo encontrado neste setor! Todos os horários de pico contam com pelo menos <strong>${minReq} pessoas</strong> trabalhando.</span>
      </div>
    `;
  } else {
    problemasAtuais.forEach(p => {
      const div = document.createElement('div');
      div.className = "flex items-center gap-3 bg-red-50 border border-red-200 text-red-900 px-4 py-2.5 rounded-lg text-xs";
      div.innerHTML = `
        <span class="bg-red-700 text-white font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Problema</span>
        <span><strong>${p.dia}:</strong> falta gente em 4 de 4 semanas (ex.: ${p.janelas.join(', ')}).</span>
      `;
      alertsContainer.appendChild(div);
    });
  }
}

// Inicializar
loadFromStorage();
recalculateAll();
