# Guia de Construção — Support Desk

Este arquivo é um tutorial "ponto a ponto": cada seção explica **o que** foi construído, **por que** foi construído daquele jeito (as alternativas que existiam e por que escolhemos essa), e **para que** aquilo serve no sistema como um todo. A ideia é que você consiga ler isso meses depois — ou explicar em uma entrevista — sem precisar redescobrir o raciocínio.

O projeto: um sistema de tickets de suporte com 3 papéis (cliente, agente, admin), inspirado em ferramentas como Zendesk/Freshdesk, só que simplificado. É o tipo de sistema interno que empresas de verdade usam e mantêm — por isso serve bem de portfólio para vaga júnior.

## Roadmap (o que vamos construir, em ordem)

- [x] **Fase 0** — Estrutura do projeto e decisões de stack
- [x] **Fase 1** — Modelagem de dados (schema do banco)
- [x] **Fase 2** — Autenticação (registro, login, JWT)
- [x] **Fase 3** — Autorização por papel (RBAC) — middleware que decide quem pode fazer o quê
- [x] **Fase 4** — CRUD de tickets com visibilidade por papel
- [x] **Fase 5** — Fila de atendimento do agente (assumir ticket, mudar status)
- [x] **Fase 6** — Métricas do admin (agregações SQL)
- [x] **Fase 7** — Frontend (React + TypeScript)
- [x] **Fase 8** — Testes automatizados
- [x] **Fase 9** — Containerização com Docker (deploy em nuvem fica para uma fase futura, por decisão deliberada — ver seção da Fase 9)
- [x] **Fase 10** — Tags e histórico de atividade (o projeto já publicado, evoluído com uma melhoria concreta)

Cada fase abaixo detalha as decisões da fase já feita.

---

## Fase 0 — Estrutura do projeto

### O que foi feito
Criamos dois diretórios na raiz: `backend/` e (mais adiante) `frontend/`. Dentro do backend, a estrutura é:

```
backend/
  prisma/
    schema.prisma       -- definição do banco de dados
  src/
    lib/                -- código de infraestrutura reutilizável (conexão com banco, JWT)
    middleware/         -- funções que interceptam requisições (autenticação, autorização)
    controllers/        -- lógica de cada rota (o que fazer quando a requisição chega)
    routes/             -- mapeamento de URL -> controller
    app.ts              -- monta o Express e conecta tudo
    server.ts           -- só liga o servidor na porta
```

### Por que essa separação
Isso é a base do padrão **MVC adaptado para API** (sem "View", já que quem renderiza é o frontend separado). A separação entre `routes` (o "endereço") e `controllers` (a "lógica") existe porque, conforme o projeto cresce, você não quer um arquivo de 2000 linhas misturando definição de URL com regra de negócio. Times reais organizam código assim justamente para que duas pessoas possam mexer em partes diferentes sem conflito constante.

`app.ts` separado de `server.ts` é um detalhe pequeno mas importante para testes: você consegue importar o `app` (o Express configurado) em um teste automatizado **sem** precisar realmente abrir uma porta de rede. Isso facilita testes de integração mais rápidos e sem efeitos colaterais.

### Para que serve
Essa organização é o que faz o projeto parecer "profissional" e não um script de curso — é literalmente a estrutura que você vai encontrar (com variações) em projetos Node de produção.

### Stack escolhida
- **Node.js + TypeScript**: tipagem estática pega erros antes de rodar, e é o que a maioria das vagas júnior de backend JS pede hoje.
- **Express**: framework minimalista, ótimo para ensinar os conceitos sem esconder o que está acontecendo (diferente de um framework mais "mágico").
- **Prisma ORM**: gera tipos TypeScript automaticamente a partir do schema do banco, então erros de "coluna não existe" viram erro de compilação, não erro em produção.
- **PostgreSQL**: banco relacional — faz sentido aqui porque os dados têm relações claras (um ticket pertence a um cliente, tem várias mensagens, etc.) e porque vamos fazer agregações (métricas) que SQL faz muito bem.

---

## Fase 1 — Modelagem de dados

### O que foi feito
Arquivo `backend/prisma/schema.prisma` com 5 modelos: `User`, `Ticket`, `TicketMessage`, `Tag` e `ActivityLog`.

### Decisões importantes e por quê

**Um único modelo `User` com campo `role`, em vez de tabelas separadas (`Customer`, `Agent`, `Admin`).**
Alternativa que existia: três tabelas diferentes. Rejeitamos porque criaria duplicação (email, senha, nome em 3 lugares) e complicaria login (qual tabela checar primeiro?). Um enum `Role` é mais simples e é o padrão do mercado para RBAC básico.

**`Ticket` tem `customerId` e `assignedAgentId` como campos separados, ambos apontando para `User`.**
Isso são duas relações diferentes com a mesma tabela. É um padrão comum que costuma confundir quem está aprendendo Prisma/SQL: precisamos nomear as relações explicitamente (`@relation("TicketCustomer")` e `@relation("TicketAgent")`) porque, sem isso, o Prisma não sabe qual chave estrangeira corresponde a qual relação.

**`TicketMessage` é uma tabela separada, não um campo de texto dentro de `Ticket`.**
Um ticket precisa suportar uma conversa (cliente escreve, agente responde, cliente responde de novo). Se fosse um campo único, você perderia o histórico. Isso é modelar "um-para-muitos" corretamente: um ticket tem muitas mensagens.

**`ActivityLog` guarda um registro de cada mudança de status.**
Por quê: em qualquer sistema de suporte real, "quem mudou o quê e quando" é uma pergunta que sempre aparece (auditoria, disputas, entender gargalos). Em vez de tentar adivinhar isso a partir de outros dados, gravamos explicitamente. Isso também é o que alimenta métricas como "tempo médio até primeira resposta".

**Enums para `Role`, `TicketStatus` e `TicketPriority` em vez de strings livres.**
Com string livre, nada impede alguém de salvar `"aberto"` numa linha e `"Aberto"` em outra — bug silencioso. Enum faz o banco (e o TypeScript) recusarem valores inválidos.

### Para que serve
Esse schema é o contrato de dados que tudo mais no sistema respeita. Entender a modelagem é, na prática, entender o sistema inteiro — por isso vale a pena ler o `schema.prisma` com calma antes de seguir para as próximas fases.

---

## Fase 2 — Autenticação

### O que foi feito
- `POST /api/auth/register` — cria usuário (senha nunca salva em texto puro)
- `POST /api/auth/login` — valida credenciais e devolve um token JWT
- Senhas com hash usando `bcrypt`
- Token JWT contendo `userId` e `role`, assinado com uma chave secreta (`JWT_SECRET` no `.env`)

### Por que JWT e não sessão em banco/cookie de sessão
Existem duas abordagens clássicas: **sessão com estado** (o servidor guarda quem está logado, geralmente em Redis ou no banco, e manda um cookie de ID de sessão) ou **token sem estado** (JWT: o próprio token carrega a informação, assinada criptograficamente, e o servidor não precisa guardar nada).

Escolhemos JWT aqui por ser mais simples de implementar sem infraestrutura extra (não precisa de Redis) e porque é o que mais aparece em vagas júnior e testes técnicos. A desvantagem real do JWT — não dá para "invalidar" um token antes dele expirar — é aceitável para um projeto de portfólio, mas vale mencionar isso numa entrevista para mostrar que você entende o trade-off, não só a implementação.

### Por que bcrypt para senha
Nunca se guarda senha em texto puro — se o banco vazar, todas as senhas vazam também. `bcrypt` aplica um algoritmo de hash lento **de propósito** (com "salt" embutido), o que torna ataques de força bruta muito mais caros. Isso não é sobre gosto, é o mínimo aceitável de segurança — qualquer projeto sem isso deveria ser reprovado em code review.

### Para que serve
Autenticação responde "quem é você?". Ela sozinha **não** responde "o que você pode fazer?" — essa é a próxima fase (autorização), e é um erro comum de quem está aprendendo confundir as duas.

---

## Fase 3 — Autorização por papel (RBAC)

### O que foi feito
Dois middlewares em `backend/src/middleware/auth.ts`:
- `authenticate`: lê o token JWT do header `Authorization`, valida, e anexa `req.user = { id, role }`. Se o token for inválido ou ausente, corta a requisição com 401 antes mesmo dela chegar ao controller.
- `authorize(...roles)`: recebe uma lista de papéis permitidos (ex.: `authorize("admin")` ou `authorize("agent", "admin")`) e devolve 403 se o `req.user.role` não estiver na lista.

### Por que separar em dois middlewares, e não um só
`authenticate` responde "você é alguém válido?". `authorize` responde "você, especificamente, pode fazer *isso*?". Separar os dois permite compor: uma rota pode exigir só estar logado (`authenticate`), enquanto outra exige estar logado **e** ser admin (`authenticate` + `authorize("admin")`). Se fosse um middleware só, cada rota teria que reimplementar a checagem de papel na mão — muito mais fácil de esquecer e criar brecha de segurança.

### Por que isso é o "diferencial" mencionado antes
A maioria dos projetos de portfólio júnior tem no máximo "está logado ou não". Ter 3 papéis com permissões diferentes de verdade — e a autorização sendo reaproveitável via middleware, não copiada e colada em cada rota — é o tipo de detalhe que muda a conversa numa entrevista técnica: você consegue explicar *por que* estruturou assim, não só *que* estruturou.

### Para que serve
A partir daqui, toda rota nova (tickets, mensagens, métricas) só precisa declarar `authenticate, authorize("agent", "admin")` e a regra já está garantida — sem duplicar lógica de segurança em cada controller.

### Adendo: por que existe `middleware/asyncHandler.ts`
Ao testar esta fase sem um banco de dados disponível, descobrimos um problema real: o Express 4 **não captura** erros lançados dentro de um `async` handler. O erro vira uma "unhandled promise rejection" e, a partir do Node 15+, isso **derruba o processo inteiro** — não só a requisição que falhou, o servidor todo para de responder.

A correção tem duas partes:
1. `asyncHandler(handler)` — um wrapper que envolve qualquer controller async e encaminha erros para `next(err)` em vez de deixá-los "escapar" como rejeição não tratada.
2. Um middleware de erro global no fim de `app.ts` (função com 4 parâmetros — é assim que o Express reconhece um error handler) que transforma qualquer erro capturado numa resposta HTTP 500 com JSON, em vez de crashar.

Isso não é frescura de "boas práticas" abstrata: sem essa rede de segurança, um único ticket criado com dado inesperado, ou uma queda momentânea do banco, tiraria a API inteira do ar até alguém reiniciar o processo manualmente. Em produção real, isso é a diferença entre "um usuário viu um erro" e "todo mundo ficou sem conseguir usar o sistema".

---

## Fase 4 — CRUD de tickets com visibilidade por papel

### O que foi feito
Quatro rotas em `backend/src/routes/ticket.routes.ts`, todas atrás de `authenticate`:

- `POST /api/tickets` — só `CUSTOMER` pode criar (`authorize("CUSTOMER")`)
- `GET /api/tickets` — lista tickets, mas **o conjunto retornado muda conforme o papel**
- `GET /api/tickets/:id` — detalhe de um ticket, com suas mensagens
- `POST /api/tickets/:id/messages` — responder/comentar em um ticket

### Por que `GET /api/tickets` não tem `authorize()`
As três primeiras fases ensinaram RBAC como "essa rota é só pra esse papel". Mas listar tickets não é assim: **todo mundo pode chamar essa rota**, só que cada papel recebe um recorte diferente dos dados:

- `CUSTOMER` → só os próprios tickets (`where: { customerId: user.id }`)
- `AGENT` → a "fila": tickets ainda sem agente designado, mais os que já são dele (`assignedAgentId: null OR assignedAgentId: user.id`)
- `ADMIN` → todos

Isso é filtrado **na cláusula `where` da query ao banco**, não depois de buscar tudo e filtrar em memória. Duas razões: performance (o banco só lê o que interessa) e segurança (não existe, em nenhum momento, uma lista completa de tickets de outros clientes passando pela memória do processo — então um bug de serialização na resposta não tem o que vazar).

### O problema que `GET /api/tickets/:id` resolve (e que a Fase 3 sozinha não resolve)
Aqui está o ponto mais importante desta fase. RBAC (Fase 3) responde "um `CUSTOMER` pode chamar `GET /api/tickets/:id`?" — e a resposta é sim, qualquer cliente pode. Mas isso não significa que o cliente A possa ver o ticket do cliente B só trocando o `:id` na URL.

Faltar essa segunda checagem — comparar o **dono do registro específico** com quem está pedindo — é a vulnerabilidade nº 1 do [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0x11-t10/): **Broken Object Level Authorization (BOLA)**. É a falha mais comum em APIs reais, porque é fácil implementar autorização por papel e esquecer que isso não cobre autorização por *instância do recurso*.

A correção está em `backend/src/lib/ticketAccess.ts`, na função `canAccessTicket(user, ticket)`:
- `ADMIN` sempre pode
- `CUSTOMER` só se `ticket.customerId === user.id`
- `AGENT` só se o ticket está na fila (`assignedAgentId === null`) ou é dele

Essa função roda **depois** que o ticket já foi carregado do banco — só nesse momento existe algo para comparar. Ela é reaproveitada em `getTicket` e em `addMessage`, então a regra de negócio "quem pode tocar em qual ticket" existe em um único lugar, não duplicada em cada controller.

### Por que `addMessage` usa `$transaction`
Cada mensagem nova também gera uma linha em `ActivityLog` (ação `MESSAGE_ADDED`) — é o que vai alimentar métricas na Fase 6 (ex: tempo até a primeira resposta de um agente). As duas escritas (mensagem + log) precisam ser atômicas: se o log falhasse silenciosamente, teríamos uma mensagem real sem nenhum rastro de auditoria. `prisma.$transaction` garante que ou as duas linhas são gravadas, ou nenhuma é.

### Para que serve
Esta fase é o que transforma o RBAC de "conceito" em comportamento real e testável: dois clientes diferentes, logados, batendo na mesma rota, recebem dados diferentes — e um tentando acessar o ticket do outro recebe 403, não um erro de servidor nem, pior, os dados de outra pessoa.

---

## Fase 5 — Fila de atendimento do agente

### O que foi feito
Duas rotas novas em `ticket.routes.ts`, restritas a `AGENT`/`ADMIN` via `authorize("AGENT", "ADMIN")`:

- `POST /api/tickets/:id/assign` — um agente reivindica um ticket da fila para si (ou, se for admin, atribui a um agente específico via `agentId` no corpo)
- `PATCH /api/tickets/:id/status` — muda o status do ticket (ex: `IN_PROGRESS` → `RESOLVED`)

### "Posso ver" não é o mesmo que "posso agir" — duas checagens de autorização diferentes para o mesmo ticket
Na Fase 4, `canAccessTicket` deixa qualquer agente **ver** qualquer ticket da fila (ainda sem dono) — faz sentido, porque um agente precisa poder olhar a fila inteira para escolher o que atender. Mas essa mesma regra permissiva **não pode** valer para ações: se um agente já reivindicou um ticket, outro agente não pode simplesmente chamar `/assign` e "roubá-lo", nem mudar o status de um ticket que não é dele.

Por isso `assignTicket` e `updateTicketStatus` não reusam `canAccessTicket` — implementam uma checagem própria, mais restrita:
- `assignTicket`: um `AGENT` só consegue reivindicar um ticket se ele estiver livre (`assignedAgentId === null`) ou já for dele. Um `ADMIN` pode atribuir a qualquer agente, mas o `agentId` enviado é validado contra o banco (tem que existir e ter `role === "AGENT"` — sem isso, seria possível "atribuir" um ticket a um cliente por engano ou má-fé).
- `updateTicketStatus`: um `AGENT` só muda o status se `ticket.assignedAgentId === user.id`. `ADMIN` sempre pode.

O aprendizado geral aqui: **autorização não é uma checagem única por recurso** — o mesmo ticket pode ter regras diferentes para ler, responder, reivindicar e mudar status. Modelar isso como funções pequenas e específicas (em vez de um único `canAccess` genérico tentando cobrir tudo) é o que mantém cada regra fácil de entender e de testar isoladamente.

### Por que reivindicar um ticket `OPEN` já muda o status para `IN_PROGRESS`
É um atalho de UX deliberado: sem isso, o agente precisaria chamar `/assign` e depois `/status` manualmente para o caso mais comum (pegar um ticket novo da fila). Tickets que já estavam `IN_PROGRESS`, `RESOLVED` ou `CLOSED` não têm o status alterado por uma reatribuição — só o dono muda.

### Para que serve
Junto com a Fase 4, isso fecha o ciclo de vida completo de um ticket do ponto de vista operacional: cliente abre → aparece na fila → agente reivindica → conversa acontece → agente resolve. Cada uma dessas transições fica registrada em `ActivityLog` (`ASSIGNED`, `STATUS_CHANGED`, `MESSAGE_ADDED`), que é exatamente o que a Fase 6 vai agregar em métricas (tempo até primeira resposta, tempo até resolução, tickets por agente).

---

## Fase 6 — Métricas do admin

### O que foi feito
Uma rota, `GET /api/admin/stats`, atrás de `authenticate` + `authorize("ADMIN")` — sem recorte por papel aqui: ou é admin, ou não entra. Ela devolve:
- tickets por status (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`)
- tickets por prioridade
- tickets por agente (quantos cada um tem atribuídos)
- tempo médio, em minutos, até a primeira resposta de um agente
- tempo médio, em horas, até um ticket ser resolvido

### Por que as contagens simples usam `groupBy` do Prisma, mas os tempos médios usam `$queryRaw`
`prisma.ticket.groupBy({ by: ["status"], _count: { _all: true } })` é o `GROUP BY status, COUNT(*)` de sempre — o Prisma expressa isso de forma type-safe sem precisar escrever SQL na mão, e é a escolha certa sempre que o agregado é direto (uma tabela, sem juntar com outra).

Os tempos médios são outra categoria de problema: para cada ticket, é preciso achar **a primeira linha de outra tabela** que satisfaz uma condição (a primeira mensagem escrita por um `AGENT`; a primeira mudança de status para `RESOLVED`) e só então calcular a diferença de tempo em relação à criação do ticket. Isso é uma **subquery correlacionada** — o `groupBy` do Prisma não tem como expressar isso. As alternativas seriam:
1. Trazer todas as mensagens e todos os logs de atividade para o Node e calcular ali — funciona, mas significa ler do banco muito mais dado do que o necessário só para descartar quase tudo em seguida.
2. Escrever o SQL agregado direto, via `prisma.$queryRaw`.

Fomos de (2). É mais código SQL, mas é o tipo de query que aparece o tempo todo em entrevista técnica de backend — e resolve o problema em uma única viagem ao banco, processando só o resultado final (uma média), nunca as linhas brutas.

### Por que `EXISTS` aparece nas duas queries de tempo médio
Sem o `WHERE EXISTS (...)`, um ticket que **ainda não teve resposta** entraria no cálculo com um valor nulo/zero, puxando a média para baixo de forma enganosa — pareceria que a equipe responde mais rápido do que responde de fato. `EXISTS` garante que só entram no cálculo os tickets que já tiveram o evento em questão.

### Por que `metadata->>'to'` (acessando um campo dentro de uma coluna JSON)
`ActivityLog.metadata` é `Json` no schema (Fase 1) porque o formato de cada evento varia (`ASSIGNED` carrega `{ agentId }`, `STATUS_CHANGED` carrega `{ from, to }`). Não faz sentido criar uma coluna própria para cada formato possível. O Postgres deixa consultar dentro desse JSON diretamente com `->>'chave'` — aqui, filtrando eventos de `STATUS_CHANGED` cujo `to` foi `'RESOLVED'`. É uma habilidade que separa quem só sabe SQL de tabela "achatada" de quem sabe lidar com dado semiestruturado dentro de um banco relacional.

### Por que o nome do agente é buscado numa segunda query, em vez de um JOIN só
O `groupBy` do Prisma não permite trazer campos de uma tabela relacionada junto do agregado. A alternativa mais simples — e mais barata — é rodar uma segunda query pequena (`findMany` filtrando só os `id`s de agente que já apareceram no agregado) e juntar os nomes em memória com um `Map`. Isso ainda é muito mais barato do que buscar a tabela de usuários inteira, e evita a complexidade de escrever o `GROUP BY` inteiro em SQL cru só por causa de um nome.

### Sobre a conversão `Number(...)` no fim
O driver do Postgres (`node-postgres`, por baixo do Prisma) devolve colunas `NUMERIC`/`DECIMAL` como **string**, não como `number` — de propósito, para não arriscar perda de precisão silenciosa em valores muito grandes ou muito precisos. Como aqui trabalhamos com médias de tempo (não dinheiro, não precisa de precisão arbitrária), convertemos explicitamente para `Number` num único lugar (`toNumberOrNull`), documentando por que a conversão existe em vez de deixar essa pegadinha implícita.

### Para que serve
Essa rota é o "produto final" de tudo que o `ActivityLog` vem registrando desde a Fase 4 — cada mensagem e cada mudança de status gravada ali não era burocracia, era a matéria-prima para estas métricas. É também, de longe, a parte mais fácil de defender numa entrevista técnica: "eu escrevi uma subquery correlacionada para achar tempo médio até a primeira resposta, evitando trazer dado bruto para a aplicação" é uma frase que qualquer entrevistador de backend júnior reconhece como sinal de maturidade.

---

## Fase 7 — Frontend

### O que foi feito
Uma SPA em React + TypeScript + Vite, em `frontend/`, consumindo a API construída nas Fases 0-6. Estrutura:

```
frontend/src/
  api/client.ts        -- wrapper único em volta de fetch
  auth/                -- AuthContext (estado de quem está logado) e ProtectedRoute (guarda de rota)
  components/          -- Layout (navbar) e Badges (status/prioridade)
  pages/                -- uma página por rota
  types.ts             -- tipos espelhando o schema do backend
  styles.css
```

Páginas: login, registro, lista de tickets (conteúdo muda por papel), detalhe de ticket (conversa + ações de agente), e um dashboard de métricas exclusivo do admin.

### Por que existe `api/client.ts` em vez de chamar `fetch` direto em cada página
Duas responsabilidades que toda chamada à API precisa e que não deviam ser reimplementadas em cada componente: anexar o header `Authorization: Bearer <token>`, e transformar uma resposta de erro do backend (`{ error: "mensagem" }`, formato definido lá em `app.ts`) numa exceção JavaScript de verdade (`ApiError`) que os componentes conseguem capturar com `try/catch`. Sem esse wrapper, toda tela reimplementaria as duas coisas — e um dia alguém esqueceria de anexar o token em algum lugar.

### Por que o token JWT fica em `localStorage`
É a implementação mais simples (sem precisar configurar cookie `httpOnly` + CORS com credenciais). O trade-off real: um token em `localStorage` é acessível a qualquer script rodando na página — uma vulnerabilidade de XSS no frontend poderia roubá-lo. Um cookie `httpOnly` não teria esse problema específico, mas fica mais exposto a CSRF e exige mais configuração dos dois lados. Para um projeto de portfólio, `localStorage` é uma escolha aceitável — mas é o tipo de trade-off que vale mencionar ativamente numa entrevista, não usar sem saber por quê (ver comentário em `auth/AuthContext.tsx`).

### `ProtectedRoute` esconde telas — mas isso NÃO é a autorização de verdade
Este é o ponto mais importante desta fase, e está documentado como comentário direto no código (`auth/ProtectedRoute.tsx`): esconder o link "Métricas" da navbar para quem não é admin, ou redirecionar quem tenta acessar `/admin` sem ser admin, é **conveniência de interface**. Um usuário com conhecimento técnico pode ler o JavaScript da página, descobrir a URL da API e chamar `GET /api/admin/stats` diretamente com o token dele. Se o backend não recusasse essa chamada (o que ele faz, via `authorize("ADMIN")`, Fase 6), esconder o botão no frontend não protegeria nada.

Essa distinção — **autorização de UI é sobre experiência de uso; autorização de API é sobre segurança** — é um erro comum de quem está aprendendo, e uma pergunta clássica de entrevista ("o front esconde o botão, tá seguro?"). A resposta certa é sempre "não, só está seguro se o backend também recusar".

### Por que `TicketDetailPage` decide `canClaim`/`canChangeStatus` no frontend, se o backend já valida tudo isso
Redundância deliberada, não desnecessária: o frontend usa essas condições só para decidir **o que mostrar** (esconder o botão "Assumir ticket" se o usuário não é agente, por exemplo) — pura ergonomia, evita que o usuário clique em algo que sabidamente vai falhar. A ação em si sempre passa pelo backend, que é quem decide de verdade (`canAccessTicket`, e as checagens específicas em `assignTicket`/`updateTicketStatus`, Fase 5). Se as duas regras (frontend e backend) algum dia saírem de sincronia, o pior cenário é uma tela mostrar um botão que o backend recusa com 403 — nunca uma ação indevida sendo aceita.

### Por que `types.ts` duplica manualmente os tipos do Prisma em vez de importar do backend
Frontend e backend são dois projetos Node separados (cada um com seu próprio `package.json`), então não há import direto de tipos TypeScript entre eles sem configurar um monorepo (workspaces) ou gerar um contrato (ex: OpenAPI + codegen). Para o tamanho deste projeto, manter os tipos em sincronia manualmente é simples o suficiente e evita acoplar o frontend a detalhes internos do backend — o preço é lembrar de atualizar os dois lados quando o schema mudar, o que vale a pena mencionar como limitação conhecida (e como algo que cresceria para um contrato gerado num projeto maior).

### Para que serve
Esta fase é o que torna todo o RBAC e a modelagem de dados das fases anteriores **visíveis e demonstráveis**: logar como cliente, agente e admin em três abas do navegador e mostrar que cada um vê e pode fazer coisas diferentes é o tipo de demo de 60 segundos que fixa na cabeça de quem está entrevistando, muito mais do que descrever isso em texto.

### Confirmado com teste manual real
Depois de instalar um PostgreSQL local (ver seção "Como rodar" abaixo), o fluxo completo foi testado de ponta a ponta contra dados reais: pela API diretamente (registro, login, criação de ticket, fila do agente, BOLA-check retornando 403, troca de mensagens, resolução do ticket, métricas do admin — tudo confirmado com `curl`) e, por cima disso, no navegador de verdade: login como agente, listagem de tickets, e o dashboard de métricas do admin renderizando os números corretos em `/admin`. Não é mais suposição — é o comportamento observado.

---

## Fase 8 — Testes automatizados

### O que foi feito
Testes no backend, usando **Vitest** (test runner) + **Supertest** (faz requisições HTTP contra o Express sem precisar abrir uma porta de rede de verdade):

- `src/lib/ticketAccess.test.ts` — **teste unitário puro**, sem banco: chama `canAccessTicket` direto com objetos simples.
- `src/tests/auth.test.ts` — **teste de integração**: registro, login, e duas regressões de segurança específicas (ver abaixo).
- `src/tests/tickets.test.ts` — **teste de integração**: CRUD de tickets, visibilidade por papel, e — o mais importante — o BOLA-check e as regras de fila/atribuição da Fase 5.
- `src/tests/admin.test.ts` — **teste de integração**: a rota de métricas só responde para `ADMIN`.

### Por que dois tipos de teste diferentes, e não só um
Um teste **unitário** (sem banco, sem HTTP) roda em milissegundos e não pode falhar por causa de infraestrutura — só testa a lógica em si. É ótimo para regras de negócio isoladas, como `canAccessTicket`, mas não prova que a rota realmente aplica essa regra. Um teste de **integração** bate na API de verdade (Express + Prisma + Postgres reais) e prova o comportamento fim-a-fim, mas é mais lento e precisa de infraestrutura (um banco rodando). Um projeto maduro tem os dois: unitários para lógica pura, de integração para os fluxos que importam de verdade.

### Por que os testes de integração importam `app` de `app.ts`, e nunca ligam a porta
Esse é o retorno direto da decisão tomada lá na **Fase 0**: separar `app.ts` (o Express configurado) de `server.ts` (que só chama `app.listen`) existe justamente para isto — o Supertest consegue fazer requisições diretamente contra o objeto `app` em memória, sem abrir `localhost:PORTA` de verdade. Mais rápido, e sem risco de conflito de porta entre execuções de teste em paralelo.

### Por que existe um banco de teste separado (`.env.test`, `support_desk_test`)
Cada teste de integração começa chamando `cleanDatabase()` (em `src/tests/helpers.ts`), que apaga **todas as linhas de todas as tabelas** — de propósito, para que cada teste comece de um estado conhecido e não dependa de dado deixado por outro teste rodado antes (isso é o que evita testes "flaky": passam ou falham dependendo da ordem de execução). Rodar isso contra o mesmo banco do `npm run dev` apagaria qualquer dado que você tenha criado testando manualmente pela UI. Por isso `src/tests/setup.ts` carrega `.env.test` (apontando para um banco `support_desk_test` separado) em vez do `.env` de desenvolvimento — e isso precisa acontecer antes de qualquer teste importar `lib/prisma.ts`, daí estar em `setupFiles` do `vitest.config.ts` (que roda antes dos arquivos de teste serem carregados).

### Por que `createTestUser` cria o usuário direto no Prisma, e não chamando a API de registro
O endpoint `POST /api/auth/register` só cria `CUSTOMER` — de propósito, desde a Fase 2. Não haveria como usar esse endpoint para preparar um `AGENT` ou `ADMIN` de teste. `createTestUser` contorna isso criando o usuário direto no banco (do mesmo jeito que o script de seed faz para desenvolvimento). O comportamento do endpoint de registro em si — incluindo essa restrição — continua sendo testado à sério em `auth.test.ts`, batendo na rota HTTP de verdade.

### Os dois testes que são regressões de segurança deliberadas
Vale destacar dois casos em `auth.test.ts` que não testam "o caminho feliz", testam decisões de segurança específicas tomadas antes:
1. **"ignora um campo 'role' enviado no corpo do registro"** — prova que mesmo alguém tentando se registrar como `ADMIN` manualmente continua virando `CUSTOMER`. Se algum dia alguém adicionar `role` ao schema de validação "para facilitar", este teste quebra na hora.
2. **"recusa senha errada e email inexistente com a MESMA mensagem"** — prova que a defesa contra enumeração de email (ver comentário em `auth.controller.ts`) continua valendo. Se alguém "melhorar" a mensagem de erro diferenciando os dois casos, este teste avisa.

Esse é o valor real de teste automatizado num projeto de portfólio: não é sobre "ter testes" para parecer profissional, é sobre travar em código uma decisão de segurança que, sem isso, poderia ser silenciosamente desfeita numa mudança futura sem ninguém perceber.

### Como rodar (precisa de um Postgres de teste — ver seção abaixo)
```bash
npm test          # roda a suíte inteira uma vez
npm run test:watch  # modo interativo, reroda ao salvar
```

### O que foi verificado nesta sessão
Com um PostgreSQL real disponível (ver Fase "instalação local" abaixo), os 22 testes rodaram de verdade — e a primeira execução **encontrou um bug real**: 3 dos 22 casos falhavam de forma intermitente (registro duplicado "passando" quando devia dar 409; criação de ticket falhando com violação de chave estrangeira). A causa: o Vitest roda **arquivos** de teste em paralelo por padrão, em workers separados — ótimo para testes unitários isolados, mas quebra testes de integração que compartilham o mesmo banco. O `cleanDatabase()` de um arquivo (`admin.test.ts`, por exemplo) apagava, no meio da execução, usuários e tickets que outro arquivo (`auth.test.ts` ou `tickets.test.ts`, rodando ao mesmo tempo num worker diferente) tinha acabado de criar e ainda estava usando.

A correção foi uma linha em `vitest.config.ts`: `fileParallelism: false`, forçando os arquivos de teste a rodarem em sequência — então só existe um estado do banco por vez. Depois disso, os 22 testes passaram de forma consistente e repetida.

Esse é o tipo de coisa que só um teste de integração contra banco real revela — um teste unitário, ou testes de integração com bancos isolados por arquivo (uma alternativa mais sofisticada, fora do escopo aqui), nunca teriam pego isso. Vale mencionar isso numa entrevista: não é sobre "ter testes", é sobre eles pegarem exatamente esse tipo de bug de concorrência que só aparece contra infraestrutura real.

---

## Fase 9 — Containerização com Docker

### Escopo desta fase (e o que fica de fora, de propósito)
Esta fase cobre **containerizar a aplicação inteira** — backend, frontend e banco, cada um no seu próprio container, subindo com um único comando, em qualquer máquina que tenha Docker instalado. Ela **não** cobre deploy num provedor de nuvem específico (Render, Railway, Fly.io, um VPS, etc.) — isso foi uma decisão deliberada para manter esta fase focada e testável localmente, e fica como próximo passo natural quando fizer sentido escolher uma plataforma.

### O que foi feito
- `backend/Dockerfile` — build multi-stage: um estágio instala dependências e compila TypeScript, o estágio final só carrega o JavaScript compilado e as dependências de produção.
- `frontend/Dockerfile` — build multi-stage: um estágio compila a SPA com Vite, o estágio final serve os arquivos estáticos resultantes com Nginx (nenhum Node.js sobrevive até a imagem final do frontend).
- `frontend/nginx.conf` — configuração mínima do Nginx com fallback de SPA.
- `docker-compose.prod.yml` (raiz) — orquestra os três serviços (banco, migration, backend, frontend) junto.

### Por que multi-stage build, e não um único `FROM node` fazendo tudo
Sem separar em estágios, a imagem final carregaria o compilador TypeScript, os arquivos `.ts` fonte, e todas as `devDependencies` (Vitest, Supertest, etc.) — nada disso é necessário para *rodar* a aplicação em produção, só para *construí-la*. O Docker permite copiar só o resultado de um estágio (`COPY --from=build ...`) para o próximo, descartando tudo que ficou para trás. O resultado é uma imagem final consideravelmente menor e com uma superfície de ataque menor (menos ferramentas instaladas = menos coisa que pode ser explorada se o container for comprometido).

### Por que o `backend/.dockerignore` exclui os arquivos de teste
Os arquivos `*.test.ts` e `src/tests/` (Fase 8) nunca precisam existir dentro da imagem de produção — são código que só roda em CI/desenvolvimento. Excluí-los do contexto de build via `.dockerignore` significa que nem chegam a ser copiados para dentro do container antes da compilação, então nem o `tsc` nem o resultado final os enxergam. É mais simples do que manter um `tsconfig` separado só para excluir testes do build (o `tsconfig.json` de desenvolvimento continua incluindo os testes normalmente, para que `tsc --noEmit` e o Vitest continuem funcionando localmente).

### Por que a migration do banco é um serviço `migrate` separado, e não parte do `CMD` do `backend`
Este é o detalhe mais importante desta fase, e o tipo de decisão que aparece em entrevista de backend/infra. Se `npx prisma migrate deploy` rodasse dentro do `CMD` do container `backend`, toda vez que esse container reiniciasse — ou toda vez que você escalasse `backend` para múltiplas réplicas atrás de um load balancer — múltiplas instâncias tentariam rodar a mesma migration ao mesmo tempo. O Prisma não foi desenhado para arbitrar essa corrida com segurança.

A solução padrão da indústria é o padrão **"migration como job"**: um container que sobe, roda a migration, termina, e nunca mais existe. `docker-compose.prod.yml` expressa isso com `depends_on: migrate: condition: service_completed_successfully` no serviço `backend` — o backend só inicia depois que o job de migration já terminou com sucesso, exatamente uma vez, e nunca corre em paralelo com ele mesmo.

### Por que `prisma` virou uma dependência de produção (não só de desenvolvimento)
Até a Fase 8, `prisma` (a CLI) só era usada localmente durante o desenvolvimento (`npx prisma migrate dev`, `npx prisma studio`). Mas o serviço `migrate` do compose roda `npx prisma migrate deploy` dentro da imagem de produção do backend — e sem a CLI instalada ali (ela estava em `devDependencies`, que a imagem de produção descarta com `npm ci --omit=dev`), esse comando não existiria dentro do container. Por isso `prisma` foi movido para `dependencies` no `package.json`: é um caso legítimo onde uma ferramenta de "desenvolvimento" também é necessária em produção, e vale a pena reconhecer isso explicitamente em vez de duplicar a lógica de migration em outro lugar.

### Por que o frontend usa Nginx em vez de continuar servido pelo Vite ou por um servidor Node
`vite dev`/`vite preview` são pensados para desenvolvimento, não para servir tráfego de produção de verdade. Depois do `npm run build`, o resultado é só HTML/CSS/JS estático — não precisa de um runtime JavaScript para ser servido, só de um servidor web. Nginx é o padrão da indústria para isso: rápido, leve, e testado em produção há décadas. Servir estático com Nginx (em vez de, por exemplo, um servidor Express só para isso) também deixa a imagem final do frontend sem nenhuma dependência de Node.js.

### Por que o `nginx.conf` precisa de `try_files $uri /index.html`
React Router faz roteamento **no navegador** — rotas como `/tickets/abc123` só existem como JavaScript rodando no cliente, nunca como um arquivo real no disco do servidor. Sem o fallback, acessar essa URL diretamente (ou atualizar a página nela) faria o Nginx procurar um arquivo literal chamado `tickets/abc123`, não encontrar, e devolver 404. `try_files $uri /index.html` diz: "tente servir o arquivo pedido; se não existir, sirva `index.html` de qualquer forma" — e é o próprio React Router, já carregado, que decide o que renderizar a partir da URL atual. Esse é um erro clássico de quem containeriza uma SPA pela primeira vez (funciona perfeito navegando pelos links, quebra ao atualizar a página).

### Por que `VITE_API_URL` é um `ARG` de build, e não uma variável de ambiente de execução
Isso é sutil e vale entender bem: no backend, variáveis de ambiente (`DATABASE_URL`, `JWT_SECRET`) são lidas em tempo de **execução** (`process.env`, quando o container já está rodando) — por isso aparecem em `environment:` no compose. No frontend, o Vite substitui `import.meta.env.VITE_API_URL` pelo valor literal **dentro do JavaScript compilado**, durante o `npm run build` — depois de compilado, esse valor está gravado nos arquivos estáticos, não pode mais mudar sem recompilar. Por isso `docker-compose.prod.yml` passa isso como `args:` (disponível só durante o `docker build`), não como `environment:` (que só afetaria um processo Node.js que, na imagem final do frontend, nem existe mais — é tudo Nginx servindo arquivo estático).

### Por que a URL usada é `http://localhost:3333`, e não `http://backend:3333`
Dentro da rede interna do Docker Compose, os containers conseguem se chamar pelo nome do serviço (`backend`, `postgres`) — mas quem executa o código do frontend não é outro container, é o **navegador rodando na sua máquina**, fora da rede do Docker. Do ponto de vista do navegador, a API está em `localhost:3333` porque essa é a porta que o compose publicou (`ports: "3333:3333"`) no host. Confundir essas duas perspectivas — rede interna do Docker vs. máquina do usuário — é um erro comum ao containerizar um frontend pela primeira vez.

### Para que serve
Isso prova que a aplicação inteira roda de ponta a ponta fora do ambiente de desenvolvimento — sem Node, sem Postgres, sem `npm install` instalados na máquina, só Docker. É o que separa "roda na minha máquina" de "roda em qualquer lugar", e é exatamente o que um time contratando júnior espera ver quando pede "sobe isso pra eu ver rodando".

### Limitação conhecida desta sessão
Não há Docker instalado nesta máquina, então **não foi possível testar o build das imagens nem subir os containers de verdade**. Os `Dockerfile`s e o `docker-compose.prod.yml` foram revisados com cuidado e o YAML foi validado sintaticamente, mas o primeiro teste real — `docker compose -f docker-compose.prod.yml up --build` — ainda precisa ser feito na sua máquina (ou em qualquer uma com Docker) antes de considerar esta fase 100% confirmada.

---

## Fase 10 — Tags e histórico de atividade

### Contexto: por que essa fase existe
As Fases 0-9 deixaram o projeto publicado e funcional. Ao revisar o que ficou "pela metade", dois pontos chamaram atenção: o schema do banco (Fase 1) já modelava `Tag`/`TicketTag` desde o início, mas nenhuma rota ou tela jamais usava isso; e `ActivityLog` (Fase 4) registrava toda ação relevante desde o começo, mas só era consumido pelas métricas agregadas do admin (Fase 6) — nunca virava uma timeline visível num ticket individual. Esta fase termina os dois.

### O que foi feito
- **Tags**: `POST /api/tickets/:id/tags` (cria a tag se não existir, e a anexa ao ticket), `DELETE /api/tickets/:id/tags/:tagId` (remove a associação), `GET /api/tags` (lista todas as tags já criadas, para sugestão). Restritas a `AGENT`/`ADMIN`.
- **Histórico de atividade**: `GET /api/tickets/:id` agora inclui `activityLogs`, e o frontend renderiza isso como uma timeline (`<details>` recolhível) na tela de detalhe, com cada evento traduzido para uma frase em português.
- 7 testes novos (`tags.test.ts` + 1 caso em `tickets.test.ts` para a timeline), todos rodando contra Postgres real: 29 no total.

### Por que a checagem de acesso de tags reusa `canAccessTicket` (a mais permissiva), não a mais restrita de `assignTicket`
Isso é uma decisão deliberada, documentada como comentário no código (`ticket.controller.ts`): um agente pode querer rotular um ticket ainda na fila — "bug", "urgente" — antes mesmo de decidir se vai reivindicá-lo para si, para ajudar a triagem de todo mundo. Se a regra fosse "só o agente responsável pode gerenciar tags" (a mesma de `updateTicketStatus`), um ticket sem dono nunca poderia ser rotulado por ninguém. Reusar `canAccessTicket` aqui, em vez de inventar uma terceira variação, é o que mantém a matriz de permissões do projeto pequena e fácil de explicar: "ver" é uma regra, "agir sobre o ciclo de vida" (assign/status) é outra mais restrita, e "colaborar em triagem" (tags) é a mesma regra de "ver".

### Por que adicionar a mesma tag duas vezes não dá erro (upsert, não create)
`POST /tickets/:id/tags` upserta tanto a `Tag` (por nome único) quanto a linha de junção `TicketTag` (pela chave composta `ticketId_tagId`). Do ponto de vista de quem chama a API — inclusive o próprio frontend, que só sabe "o usuário digitou um nome e apertou Enter" — isso deveria ser uma operação idempotente: pedir para adicionar uma tag que já está lá não é um erro, é um "sim, já está" silencioso. Modelar isso como `create` faria a segunda tentativa estourar uma violação de chave única, que o frontend teria que capturar e ignorar — mais complexidade nos dois lados para o mesmo resultado.

### Por que o nome do agente é gravado dentro do `metadata` do evento `ASSIGNED` (denormalização deliberada)
Até a Fase 10, `metadata: { agentId }` bastava, porque nada exibia essa informação para humanos. Agora que existe uma timeline visível, `agentId` sozinho obrigaria uma consulta extra (buscar o nome atual do usuário) só para renderizar uma frase. Mas o motivo mais importante não é performance, é correção de auditoria: um log de atividade deveria congelar o que aconteceu **no momento do evento** — se o agente mudar de nome depois, a entrada antiga da timeline não deveria mudar retroativamente junto (isso seria reescrever história). Por isso `metadata` agora grava `{ agentId, agentName }` explicitamente, como um snapshot, em vez de depender de um JOIN ao vivo com a tabela `User` (que é exatamente o que os campos `customer`/`assignedAgent` do próprio ticket fazem — esses sim devem sempre refletir o estado atual, porque respondem "quem é hoje", não "quem era quando").

### Por que `metadata` no frontend é `unknown`, não um tipo fixo por `action`
`ActivityLogEntry.metadata` está tipado como `unknown` em `types.ts`, e `formatActivity` (em `ActivityTimeline.tsx`) faz um cast explícito e local dentro de cada `case` do `switch`, checando os campos com `?.` antes de usar. A alternativa óbvia — um tipo `union` fortemente tipado por `action` — seria mais "correta" no papel, mas exigiria manter essa união sincronizada manualmente com o que o backend realmente grava em cada `activityLog.create(...)`, espalhado em três controllers diferentes. Como não há geração automática de tipos entre backend e frontend neste projeto (limitação já registrada na Fase 7), um `unknown` com validação defensiva por `case` é mais honesto sobre a garantia real que existe: se o formato mudar num controller e alguém esquecer de atualizar aqui, a tela cai num fallback genérico em vez de quebrar com `undefined.algumCampo`.

### Para que serve
Isso fecha um "loose end" que só quem olhasse o schema do banco com atenção notaria — e é exatamente esse tipo de acabamento que separa um projeto de portfólio "funcional" de um "completo". Tags dão contexto de triagem que a listagem sozinha não dava; a timeline responde, para qualquer pessoa olhando um ticket, "o que já aconteceu aqui" sem precisar perguntar a ninguém.

---

## Como rodar o projeto até aqui

```bash
# 1. Suba um Postgres local (só o banco — a aplicação roda fora do container por enquanto)
docker compose up -d

# 2. Configure e rode o backend
cd backend
cp .env.example .env      # os valores padrão já batem com o docker-compose.yml
npm install
npx prisma migrate dev --name init   # cria as tabelas no banco
npm run prisma:seed                  # cria uma conta admin e uma agent para testar RBAC
npm run dev
```

O seed cria `admin@example.com` e `agent@example.com`, ambos com senha `password123` (ver `backend/prisma/seed.ts` — contas de agente/admin não têm rota pública de criação, de propósito, então precisam existir de outra forma em desenvolvimento).

Sem Docker instalado, funciona igual com qualquer PostgreSQL local — só ajuste `DATABASE_URL` no `.env`.

Teste rápido com `curl` (ou importe numa coleção do Postman/Insomnia):
```bash
curl -X POST http://localhost:3333/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana","email":"ana@example.com","password":"senha1234"}'

curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ana@example.com","password":"senha1234"}'

# copie o "token" da resposta do login e use no header abaixo
curl http://localhost:3333/api/me -H "Authorization: Bearer SEU_TOKEN_AQUI"

# criar um ticket (o usuário registrado acima já nasce como CUSTOMER)
curl -X POST http://localhost:3333/api/tickets \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" -H "Content-Type: application/json" \
  -d '{"title":"Não consigo fazer login","description":"Recebo erro 500 ao tentar entrar no app."}'

# listar tickets (como CUSTOMER, só verá os próprios)
curl http://localhost:3333/api/tickets -H "Authorization: Bearer SEU_TOKEN_AQUI"

# ver o detalhe de um ticket (troque TICKET_ID pelo id retornado na criação)
curl http://localhost:3333/api/tickets/TICKET_ID -H "Authorization: Bearer SEU_TOKEN_AQUI"

# responder no ticket
curl -X POST http://localhost:3333/api/tickets/TICKET_ID/messages \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" -H "Content-Type: application/json" \
  -d '{"body":"Alguma atualização?"}'
```

Para ver o BOLA-check em ação (Fase 4), registre um **segundo** usuário, pegue o token dele, e tente `GET /api/tickets/TICKET_ID` usando o ticket do primeiro usuário — deve voltar `403`.

Para testar a fila (Fase 5), faça login como `agent@example.com` (senha `password123`, criado pelo seed) e:
```bash
# ver a fila (tickets sem dono + os que já são do agente)
curl http://localhost:3333/api/tickets -H "Authorization: Bearer TOKEN_DO_AGENTE"

# reivindicar o ticket para si — também move o status de OPEN para IN_PROGRESS
curl -X POST http://localhost:3333/api/tickets/TICKET_ID/assign -H "Authorization: Bearer TOKEN_DO_AGENTE"

# resolver o ticket
curl -X PATCH http://localhost:3333/api/tickets/TICKET_ID/status \
  -H "Authorization: Bearer TOKEN_DO_AGENTE" -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED"}'
```

Para ver as métricas (Fase 6), faça login como `admin@example.com` (senha `password123`) e:
```bash
curl http://localhost:3333/api/admin/stats -H "Authorization: Bearer TOKEN_DO_ADMIN"
```
Tente também com o token do agente ou do cliente — deve voltar `403`, já que a rota inteira é exclusiva de `ADMIN`.

### Rodando os testes automatizados (Fase 8)

Os testes de integração precisam de um banco **separado** do de desenvolvimento (ver Fase 8 acima para o porquê):

```bash
# 1. cria o banco de teste no Postgres que já está rodando via docker-compose
docker compose exec postgres createdb -U postgres support_desk_test

# 2. configura o backend para apontar para ele
cd backend
cp .env.test.example .env.test

# 3. aplica as migrations no banco de teste (bash)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/support_desk_test" npx prisma migrate deploy
```

No PowerShell, o passo 3 fica:
```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/support_desk_test"
npx prisma migrate deploy
```

Depois disso, `npm test` já funciona (o `src/tests/setup.ts` carrega `.env.test` automaticamente).

### Rodando tudo containerizado (Fase 9)

Numa máquina com Docker instalado, a aplicação inteira sobe com um único comando, sem precisar de Node/Postgres instalados localmente:

```bash
docker compose -f docker-compose.prod.yml up --build
```

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3333`

Isso builda as três imagens, roda as migrations uma única vez (serviço `migrate`) e só então sobe o backend e o frontend. Use `docker compose -f docker-compose.prod.yml down -v` para derrubar tudo e apagar o volume do banco (recomeçar do zero).

A Fase 9 vai containerizar a aplicação inteira (backend + frontend) para deploy — o `docker-compose.yml` atual é só conveniência de desenvolvimento.

## Próximos passos
Fase 4 vai construir o CRUD de tickets já usando esses middlewares, e é onde a regra "cliente só vê os próprios tickets, agente vê a fila, admin vê tudo" ganha vida em código (filtro de query, não só bloqueio de rota).
