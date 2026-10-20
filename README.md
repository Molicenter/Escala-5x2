# Simulador de Escala 5x2 - Gestão de Lojas

Aplicação web interativa em JavaScript puro (HTML5 + Tailwind CSS + Vanilla JS) para simulação, planejamento e transição gradativa da escala **6x1 para 5x2** nas lojas da rede.

## Como rodar pelo GitHub (GitHub Pages)

1. Crie um novo repositório no seu GitHub (ex: `simulador-escala-5x2`).
2. Faça o upload dos arquivos deste pacote (`index.html`, `app.js`, `style.css` e `README.md`) na raiz do repositório.
3. No repositório do GitHub, acesse a aba **Settings** (Configurações) > **Pages** (no menu lateral esquerdo).
4. Em **Build and deployment** > **Branch**, selecione a branch `main` (ou `master`), mantenha a pasta `/ (root)` e clique em **Save**.
5. Aguarde cerca de 1 minuto e seu sistema estará online no link gerado pelo próprio GitHub!

## Funcionalidades incluídas
- **Multi-lojas:** alterne entre as lojas da rede no topo da página.
- **3 Cenários de Transição:** 44h (compensado), 42h (transição) e 40h (meta final).
- **Detector de Gargalos em Tempo Real:** identifica automaticamente faixas de horário e intervalos de almoço descobertos.
- **Salvamento Automático Local (`localStorage`):** os testes feitos no navegador não são perdidos ao atualizar a página, com opção de exportar em `.json`.
