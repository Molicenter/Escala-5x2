// Datas no formato brasileiro (dd/mm/aaaa) em todos os campos de data.
// O calendário nativo (<input type="date">) segue o idioma do navegador — num Chrome em inglês
// ele mostra mm/dd/aaaa. Aqui cada campo de data ganha um campo de texto dd/mm/aaaa por cima,
// com o botão de calendário ao lado. O campo original continua existindo (escondido) e guarda
// o valor em AAAA-MM-DD, então o resto do app continua lendo e gravando do mesmo jeito.
(function () {
  const p2 = (n) => String(n).padStart(2, "0");
  const isoParaBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; };
  const brParaISO = (br) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || "");
    if (!m) return null;
    const d = +m[1], mes = +m[2], a = +m[3];
    const x = new Date(Date.UTC(a, mes - 1, d));
    if (x.getUTCFullYear() !== a || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== d) return null;
    return `${a}-${p2(mes)}-${p2(d)}`;
  };
  const mascara = (s) => {
    const n = s.replace(/\D/g, "").slice(0, 8);
    return n.length > 4 ? `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}` : n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
  };
  const avisar = (inp) => { inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); };

  function preparar(inp) {
    if (inp.dataset.br) return;
    inp.dataset.br = "1";
    const caixa = document.createElement("span");
    caixa.className = "data-br";
    const txt = document.createElement("input");
    txt.type = "text";
    txt.className = inp.className;   // mesmo visual do campo original (classe "ent" na escala)
    txt.inputMode = "numeric";
    txt.placeholder = "dd/mm/aaaa";
    txt.maxLength = 10;
    txt.autocomplete = "off";
    txt.value = isoParaBR(inp.value);
    if (inp.id) txt.setAttribute("aria-label", inp.id);
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "data-br-cal";
    bt.title = "Abrir calendário";
    bt.setAttribute("aria-label", "Abrir calendário");
    bt.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    inp.parentNode.insertBefore(caixa, inp);
    caixa.append(txt, inp, bt);
    inp.classList.add("data-br-nativo");
    inp.tabIndex = -1;

    let ultimo = inp.value;
    // digitando dd/mm/aaaa
    txt.addEventListener("input", () => {
      const pos = txt.selectionStart, antes = txt.value.length;
      txt.value = mascara(txt.value);
      if (pos != null && pos < antes) txt.setSelectionRange(pos, pos);
      const iso = txt.value ? brParaISO(txt.value) : "";
      txt.classList.toggle("invalida", txt.value.length === 10 && iso === null);
      if (iso !== null && iso !== inp.value) { inp.value = iso; ultimo = iso; avisar(inp); }
    });
    txt.addEventListener("blur", () => {
      // data incompleta ou inválida: volta para a última válida
      if (txt.value && brParaISO(txt.value) === null) { txt.value = isoParaBR(inp.value); txt.classList.remove("invalida"); }
      if (!txt.value && inp.value) { inp.value = ""; ultimo = ""; avisar(inp); }
    });
    // escolhido no calendário
    inp.addEventListener("change", () => { if (inp.value !== ultimo) { ultimo = inp.value; txt.value = isoParaBR(inp.value); txt.classList.remove("invalida"); } });
    inp.addEventListener("focus", () => txt.focus());
    bt.addEventListener("click", (e) => {
      e.preventDefault();
      try { inp.showPicker(); } catch { txt.focus(); }
    });
  }

  const varrer = (raiz) => { if (raiz.querySelectorAll) raiz.querySelectorAll('input[type="date"]:not([data-br])').forEach(preparar); };
  varrer(document);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    if (n.matches?.('input[type="date"]')) preparar(n); else varrer(n);
  }))).observe(document.body, { childList: true, subtree: true });
})();
