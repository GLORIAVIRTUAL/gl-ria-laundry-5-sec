# Notas de validação

## Prévia sem credenciais

A prévia local foi iniciada sem `VITE_BASE44_APP_BASE_URL` e sem identificador da aplicação. O servidor Vite iniciou normalmente, mas o cliente permaneceu em branco porque o projeto original depende do backend e da autenticação Base44 para montar as rotas protegidas. Não houve conteúdo sensível, token, resposta simulada ou erro de JavaScript exposto no console do navegador.

Essa limitação é esperada no repositório duplicado descrito como “somente código”. A verificação visual autenticada da página **Gestão** deverá ser repetida depois da associação do repositório a uma aplicação Base44 de homologação e da aplicação dos schemas/funções.

## Verificações locais concluídas

O build Vite concluiu sem erro. O lint dos arquivos novos e modificados concluiu sem erro. A validação estrutural confirmou 56 schemas, 16 novas funções autenticadas e os invariantes críticos de pagamentos, comprovantes, uploads, despesas recorrentes e características individuais do orçamento manual. Todas as funções TypeScript modificadas ou novas passaram pelo parser/empacotador `esbuild`. O orçamento manual deixou de criar pagamentos diretamente no navegador e agora usa uma função autenticada que recalcula o saldo do pedido no servidor, aplica idempotência e mantém Pix pendente até conciliação.

A correção do orçamento manual foi validada com criação de uma linha de orçamento por peça (`qty: 1`), marcadores obrigatórios de conferência da condição, ciência do cliente quando existem avarias ou riscos e transferência desses campos pela função `approve_quote`. A compatibilidade de orçamentos legados foi preservada por uma marca explícita em `metadata.characteristic_capture`.

O `typecheck` global continua inviável por erros amplos e preexistentes de tipagem dos componentes UI em todo o projeto. A auditoria on-line do `npm` não respondeu no ambiente após duas janelas de espera e foi interrompida; nenhuma correção automática de dependências foi aplicada.
