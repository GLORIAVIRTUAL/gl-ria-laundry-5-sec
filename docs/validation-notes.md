# Notas de validação

## Prévia sem credenciais

A prévia local foi iniciada sem `VITE_BASE44_APP_BASE_URL` e sem identificador da aplicação. O servidor Vite iniciou normalmente, mas o cliente permaneceu em branco porque o projeto original depende do backend e da autenticação Base44 para montar as rotas protegidas. Não houve conteúdo sensível, token, resposta simulada ou erro de JavaScript exposto no console do navegador.

Essa limitação é esperada no repositório duplicado descrito como “somente código”. A verificação visual autenticada da página **Gestão** deverá ser repetida depois da associação do repositório a uma aplicação Base44 de homologação e da aplicação dos schemas/funções.

## Verificações locais concluídas

O build Vite concluiu sem erro. O lint dos arquivos novos e modificados concluiu sem erro. A validação estrutural confirmou 56 schemas, 16 novas funções autenticadas e os invariantes críticos de pagamentos, comprovantes, uploads, despesas recorrentes e características individuais do orçamento manual. Todas as funções TypeScript modificadas ou novas passaram pelo parser/empacotador `esbuild`. O orçamento manual deixou de criar pagamentos diretamente no navegador e agora usa uma função autenticada que recalcula o saldo do pedido no servidor, aplica idempotência e mantém Pix pendente até conciliação.

A correção do orçamento manual foi validada com criação de uma linha de orçamento por peça (`qty: 1`), marcadores obrigatórios de conferência da condição, ciência do cliente quando existem avarias ou riscos e transferência desses campos pela função `approve_quote`. A compatibilidade de orçamentos legados foi preservada por uma marca explícita em `metadata.characteristic_capture`.

O `typecheck` global continua inviável por erros amplos e preexistentes de tipagem dos componentes UI em todo o projeto. A auditoria on-line do `npm` não respondeu no ambiente após duas janelas de espera e foi interrompida; nenhuma correção automática de dependências foi aplicada.

## Onda 2 — financeiro, comercial e fiscal

O comando `npm run validate:wave2` concluiu com sucesso. A suíte confirmou 65 schemas, 29 funções autenticadas e invariantes de pagamentos mistos, crédito, convênios, faturados, ciclo do orçamento, caixa e estrutura fiscal. Os testes determinísticos cobrem alocação entre múltiplos títulos, pagamento parcial, troco em dinheiro, meio pendente, bloqueio de sobrepagamento eletrônico e preparação fiscal com transmissão desativada.

As nove funções server-side da Onda 2 passaram pelo `esbuild`, o lint direcionado concluiu sem erro e o build Vite foi aprovado. O typecheck direcionado concluiu com zero erros nos arquivos da Onda 2. A tipagem JSDoc dos componentes compartilhados de botão, input, label, badge, diálogo e abas reduziu o total global de erros do legado; 785 erros preexistentes continuam fora desta entrega e permanecem visíveis no relatório do comando `npm run typecheck`.

A inspeção visual foi executada em uma prévia local com dados controlados. Foram validados o painel financeiro, o modal de recebimento misto, convênios e faturados, ciclo de orçamentos, caixa e estrutura fiscal. Nenhuma operação real foi submetida e nenhum segredo foi usado. Os detalhes estão em [`wave2-visual-validation.md`](wave2-visual-validation.md).

A pesquisa fiscal confirmou que Porto Alegre utiliza o Emissor Nacional para novas emissões desde 1º de novembro de 2025. A implementação prepara e valida RPS, mas bloqueia toda tentativa de transmissão até uma futura etapa específica de homologação com certificado e ambiente restrito.
