# Escala 5x2 · Molicenter — app web

Simulador e controle da escala 5x2 de todos os setores das 8 lojas.
App estático (HTML/CSS/JS) servido pelo GitHub Pages a partir da pasta `docs/`, no mesmo modelo do QL web.

- **Login:** próprio da escala (não usa mais os usuários do QL): Analista, Departamento Pessoal, Loja 01 a Loja 08 e Loja 30 (CD). Analista e DP veem as 8 lojas e o CD; cada loja vê só a sua. As senhas são cadastradas por um SQL separado que **não** fica neste repositório.
- **Colaboradores:** vêm do mesmo Banco QL.xlsx importado no QL (`ql_web_quadro_senior`), todos os departamentos, sem os demitidos. A coluna "Descrição (Escala)" é o horário atual de cada pessoa e vira a sugestão de turno. Cada departamento pode ser montado inteiro ou por função. ART 62 CLT e aprendiz/curso ficam fora da escala por padrão. Atualizou o Excel no QL → clique em "Atualizar do QL" aqui.
- **Gravação:** cada loja + setor tem um plano em `escala_planos` (com as 30 versões anteriores em `escala_planos_historico`). Se duas pessoas mexerem ao mesmo tempo, o app avisa antes de gravar por cima.

## O que tem
- Aba **Painel da mudança** (para reunião): quadro de hoje x orçado x 44h/42h/40h, pontos de atenção gerados dos dados, custo estimado (custo médio digitado), loja a loja, por departamento, horário de hoje (abertura/intermediário/fechamento), situação do quadro (férias, afastados, admitidos/desligados 90 dias) e andamento das escalas. Seletor do topo com Lojas TT e Lojas c/ CD. Imprime em PDF (A4 paisagem).
- Aba **QL Orçado x 5x2**: o organograma do QL Orçado (mesmos números do QL) com o Real (Ativos + Férias) e quantas pessoas cada jornada pede para manter as mesmas horas de hoje (pessoas × 44 ÷ nova jornada), por loja e Total Lojas. Gestão e aprendiz ficam iguais; arredondamento por departamento. Cada setor da escala mostra uma faixa com o orçado dele.
- Cenários 44h / 42h / 40h, jornada por turno, saída calculada (entrada + jornada + almoço)
- Escala de 1 a 8 semanas a partir de um domingo, com T (trabalha), F (folga), D (domingo, meio período) e X (ausente)
- Redistribuição automática: domingo em rodízio (só o mínimo necessário, respeitando o máximo de domingos seguidos) e as folgas de seg a sáb nos dias de menos movimento sem furar o mínimo; ajustes feitos à mão ficam travados
- Mapa de cobertura de 15 em 15 minutos, descontando almoço (vermelho / verde-claro / verde forte)
- "O que precisa de atenção": dias com falta de gente, semanas sem 2 folgas, acima das horas, mais de 6 dias seguidos, domingos seguidos
- Mínimo geral, faixas de reforço por dia/horário e mínimo do domingo
- Pessoas extras (coringa, vaga em aberto), folga fixa e regra de domingo por pessoa
- Imprimir / PDF e baixar planilha (CSV que abre no Excel)

## Publicar
1. Rodar no Supabase (SQL Editor), nesta ordem: `sql/01_escala_web.sql`, `sql/02_escala_logins.sql`, o arquivo de senhas (02b, guardado fora do GitHub) , `sql/03_escala_orcado.sql` e `sql/04_escala_dsr.sql` (DSR1/DSR2 do Banco QL.xlsx → folga fixa). Só cria tabelas e funções com prefixo `escala_`; não mexe nas do QL.
2. Subir a pasta `docs/` e o `sql/` neste repositório (pode apagar o `index.html`, `app.js` e `style.css` antigos da raiz).
3. Settings → Pages → Branch `main`, pasta **/docs** → Save.

**Este repositório não guarda dados de colaboradores** — eles só ficam no Supabase.
