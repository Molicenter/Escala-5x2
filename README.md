# Escala 5x2 · Molicenter — app web

Simulador e controle da escala 5x2 de todos os setores das 8 lojas.
App estático (HTML/CSS/JS) servido pelo GitHub Pages a partir da pasta `docs/`, no mesmo modelo do QL web.

- **Login:** próprio da escala (não usa mais os usuários do QL): Analista, Departamento Pessoal, Loja 01 a Loja 08 e Loja 30 (CD). Analista e DP veem as 8 lojas e o CD; cada loja vê só a sua. As senhas são cadastradas por um SQL separado que **não** fica neste repositório.
- **Colaboradores:** vêm do mesmo Banco QL.xlsx importado no QL (`ql_web_quadro_senior`), todos os departamentos, sem os demitidos. A coluna "Descrição (Escala)" é o horário atual de cada pessoa e vira a sugestão de turno. Cada departamento pode ser montado inteiro ou por função. ART 62 CLT e aprendiz/curso ficam fora da escala por padrão. Atualizou o Excel no QL → clique em "Atualizar do QL" aqui.
- **Gravação:** cada loja + setor tem um plano em `escala_planos` (com as 30 versões anteriores em `escala_planos_historico`). Se duas pessoas mexerem ao mesmo tempo, o app avisa antes de gravar por cima.

## O que tem
- **Aprovações** (só DP e Analista, no menu): status das escalas de todas as lojas, com botão Revisar para abrir e aprovar/devolver.
- **Sugerir mínimos pela equipe** (aba Turnos e mínimos): mede quanta gente a equipe consegue deixar no posto em cada horário e propõe faixas possíveis.
- **Escala por pessoa**: imprime/PDF com um cartão por funcionário (semanas × dias, horário de cada dia e horas da semana).
- **Feriados**: nacionais já marcados (amarelo) e vésperas de Natal/Ano-Novo (rosa) na escala e no mapa; feriados da loja no campo "Feriados da loja".
- **DSR1 e DSR2** de cada pessoa ao lado do cargo, na escala.
- **Menu lateral azul** (igual ao QL, Promotores e Pedidos): Visões (Painel da mudança, QL Orçado x 5x2, Total da loja) e Departamentos, com ✓ salvo, ↑ enviada e ✓✓ aprovada. O botão ☰ esconde o menu.
- **Envio e aprovação**: rascunho → a loja envia → o DP/Analista aprova (ou devolve com o motivo). Aprovada fica travada; só o DP/Analista reabre. Mudou depois de enviar, volta para rascunho.
- **Aviso na hora do clique**: ao trocar uma célula, avisa se ficou 7 dias seguidos, 3 folgas juntas, folga em terça/sábado, semana sem as folgas certas ou cobertura abaixo do mínimo naquele dia.
- **Domingo por horário**: o rodízio do domingo preenche os horários abaixo do mínimo (entra gente da abertura e do fechamento), com teto por turno para o rodízio se sustentar.
- Aba **Painel da mudança** (para reunião): quadro de hoje x orçado x 44h/42h/40h, pontos de atenção gerados dos dados, custo estimado (custo médio digitado), loja a loja, por departamento, horário de hoje (abertura/intermediário/fechamento), situação do quadro (férias, afastados, admitidos/desligados 90 dias) e andamento das escalas. Seletor do topo com Lojas TT e Lojas c/ CD. Imprime em PDF (A4 paisagem).
- Aba **QL Orçado x 5x2**: o organograma do QL Orçado (mesmos números do QL) com o Real (Ativos + Férias) e quantas pessoas cada jornada pede para manter as mesmas horas de hoje (pessoas × 44 ÷ nova jornada), por loja e Total Lojas. Gestão e aprendiz ficam iguais; arredondamento por departamento. Cada setor da escala mostra uma faixa com o orçado dele.
- Cenários 44h / 42h / 40h: 44h = como hoje (6x1, jornada do Excel, 1 folga); 42h e 40h = 5x2 com a jornada do dia maior (horas da semana de hoje ÷ 5, até o limite: 7h20 → 8h24 / 8h), mesma entrada e almoço e saída mais tarde. A linha cinza embaixo do nome mostra o horário no cenário; o Excel não muda. Saída calculada (entrada + jornada + almoço)
- Escala de 1 a 8 semanas a partir de um domingo, com T (trabalha), F (folga), D (domingo, meio período) e X (ausente)
- Nunca mais de 6 dias seguidos: no fim da redistribuição, quem passaria de 6 dias ganha a folga dentro da sequência (troca com outra folga da semana; se não der, folga a mais — ex.: no 44h, quem folgou um domingo e trabalha o próximo)
- Redistribuição automática: domingo em rodízio (só o mínimo necessário, respeitando o máximo de domingos seguidos) e as folgas de seg a sáb nos dias de menos movimento sem furar o mínimo; ajustes feitos à mão ficam travados
- Mapa de cobertura de 15 em 15 minutos, descontando almoço (vermelho / verde-claro / verde forte)
- "O que precisa de atenção": dias com falta de gente, semanas sem 2 folgas, acima das horas, mais de 6 dias seguidos, domingos seguidos
- Mínimo geral, faixas de reforço por dia/horário e mínimo do domingo
- Pessoas extras (coringa, vaga em aberto), folga fixa e regra de domingo por pessoa
- Imprimir / PDF e baixar planilha (CSV que abre no Excel)

## Publicar
1. Rodar no Supabase (SQL Editor), nesta ordem: `sql/01_escala_web.sql`, `sql/02_escala_logins.sql`, o arquivo de senhas (02b, guardado fora do GitHub) , `sql/03_escala_orcado.sql`, `sql/04_escala_dsr.sql` (DSR1/DSR2 do Banco QL.xlsx → folga fixa) e `sql/05_escala_status.sql` (envio/aprovação: loja não aprova nem grava por cima de escala aprovada) e `sql/06_escala_aprovacoes.sql` (painel de aprovações do DP). Só cria tabelas e funções com prefixo `escala_`; não mexe nas do QL.
2. Subir a pasta `docs/` e o `sql/` neste repositório (pode apagar o `index.html`, `app.js` e `style.css` antigos da raiz).
3. Settings → Pages → Branch `main`, pasta **/docs** → Save.

**Este repositório não guarda dados de colaboradores** — eles só ficam no Supabase.
