# GL-RIA Laundry 5àSec

Aplicação de gestão de lavanderia construída sobre **React, Vite e Base44**, com CRM, atendimento, coletas, financeiro e operação multiunidade. Esta branch acrescenta uma central operacional moderna na página **Gestão**, mantendo os fluxos existentes e introduzindo rastreabilidade por peça, orçamento assistido por imagens, leitura de documentos, estoque, contas, caixa, qualidade, terceiros e revisão humana.

> A inteligência artificial prepara rascunhos e sugestões. Criação de pedido, movimentação de estoque, lançamento financeiro e confirmação de pagamento permanecem ações explícitas, autenticadas e auditadas.

## Recursos principais

| Área | Recursos implementados |
|---|---|
| Atendimento | Orçamento manual preservado e novo orçamento por múltiplas fotos, com correspondência ao catálogo e revisão por confiança. |
| Operação | Peça individual, código, atributos, avarias, fotos, estado, localização, SLA e histórico imutável de eventos. |
| Produção | Quadro por peça, transições controladas, qualidade, retrabalho, posições físicas, lotes e serviços terceirizados. |
| Compras e estoque | Fornecedores, insumos, custo médio, estoque mínimo, movimentos, inventário, fichas de consumo e leitura de notas. |
| Financeiro | Contas a pagar e receber, documentos financeiros, caixa por operador, alocações, conciliação e despesas recorrentes pendentes. |
| Segurança | Papéis, permissões, escopo por unidade, uploads validados, idempotência, auditoria ampliada e cancelamento sem exclusão destrutiva. |
| Integrações | Configuração exclusivamente por ambiente e painel que informa apenas a presença dos segredos, nunca os seus valores. |

## Execução local

É necessário ter Node.js e npm disponíveis. Depois de clonar o repositório, execute:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Preencha somente as variáveis do ambiente de desenvolvimento autorizado. Os valores reais **não devem ser adicionados ao Git**. Sem `VITE_BASE44_APP_ID` e `VITE_BASE44_APP_BASE_URL`, o build pode ser validado, mas as rotas autenticadas não terão backend para carregar dados.

## Validação

O frontend pode ser compilado e os invariantes da evolução podem ser verificados com:

```bash
npm run build
python3 scripts/validate-laundry-evolution.py
```

O script valida schemas, entidades obrigatórias, autenticação explícita das funções novas, ausência de segredos no modelo de ambiente e controles críticos de orçamento, pagamentos, comprovantes, uploads e despesas recorrentes. Para validar também o núcleo operacional de balcão, execute:

```bash
npm run validate:counter-core
```

## Configuração e implantação

| Documento | Finalidade |
|---|---|
| [`docs/setup-integrations.md`](docs/setup-integrations.md) | Segredos, integrações, hosts permitidos e configuração por ambiente. |
| [`docs/operations-guide.md`](docs/operations-guide.md) | Uso dos novos fluxos de Gestão. |
| [`docs/manual-garment-characteristics.md`](docs/manual-garment-characteristics.md) | Características e conferência individual das peças no orçamento manual. |
| [`docs/operational-counter-core.md`](docs/operational-counter-core.md) | Serviços por peça, etiquetas, leitura, localização e entrega parcial. |
| [`docs/migration-rollout.md`](docs/migration-rollout.md) | Sequência segura para homologação e ativação gradual. |
| [`docs/security-architecture.md`](docs/security-architecture.md) | Papéis, unidades, auditoria, documentos, pagamentos e revisão humana. |
| [`docs/validation-notes.md`](docs/validation-notes.md) | Testes executados e limitações atuais do repositório sem backend. |

Mudanças enviadas ao repositório podem ser refletidas no Base44 Builder. A publicação deve ser realizada em uma aplicação de **homologação**, seguida da execução da migração e dos testes de aceite antes da promoção para produção.

## Referências da plataforma

A documentação de integração do Base44 com GitHub está disponível em [docs.base44.com/Integrations/Using-GitHub](https://docs.base44.com/Integrations/Using-GitHub). O suporte da plataforma permanece acessível em [app.base44.com/support](https://app.base44.com/support).
