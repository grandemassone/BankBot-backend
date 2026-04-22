# BankBot Backend – Documento Tecnico
## Stack Tecnologico
| Layer | Tecnologia |
|-------|-----------|
| Runtime | Node.js 20 |
| Framework HTTP | Fastify 5 |
| Validazione schema | Zod + fastify-type-provider-zod |
| ORM / Query Builder | Knex 3 |
| Database | PostgreSQL 15 |
| Autenticazione | JWT via @fastify/jwt + cookie firmati |
| AI | OpenAI API (gpt-4.1-nano) |
| Protocollo real-time | WebSocket via @fastify/websocket |
| Hashing password | Argon2 |
| Linguaggio | TypeScript |
---
## Architettura generale
```
Client (Browser / WebSocket)
        │
        ▼
  Fastify Server (src/server.ts)
        │
        ├─ Plugin: knexPlugin        → connessione PostgreSQL
        ├─ Plugin: userRepository    → CRUD utenti
        ├─ Plugin: accountRepository → CRUD conti bancari
        ├─ Plugin: transactionRepository → CRUD transazioni
        ├─ Plugin: conversationRepository → CRUD conversazioni
        ├─ Plugin: messageRepository → CRUD messaggi
        ├─ Plugin: llmPlugin         → client OpenAI
        ├─ Plugin: mcpBankPlugin     → tool definitions + handlers
        └─ Plugin: agentPlugin       → agent loop (runAgent)
```
---
## Database Schema
### Tabella `users`
```sql
id        UUID PRIMARY KEY
firstname VARCHAR NOT NULL
lastname  VARCHAR NOT NULL
email     VARCHAR NOT NULL UNIQUE
password  VARCHAR NOT NULL          -- hash Argon2
role      VARCHAR NOT NULL DEFAULT 'USER'  -- 'USER' | 'ADMIN'
```
### Tabella `accounts`
```sql
id       UUID PRIMARY KEY DEFAULT gen_random_uuid()
userid   UUID REFERENCES users(id)
iban     VARCHAR NOT NULL
currency VARCHAR NOT NULL DEFAULT 'EUR'  -- 'EUR' | 'CHF'
balance  DECIMAL(14,2) NOT NULL DEFAULT 0
```
### Tabella `transactions`
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
accountid   UUID REFERENCES accounts(id)
amount      DECIMAL(14,2) NOT NULL
type        VARCHAR NOT NULL   -- 'INCOME' | 'EXPENSE'
description VARCHAR
date        TIMESTAMP DEFAULT now()
```
### Tabella `conversations`
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id      UUID REFERENCES users(id)
title        VARCHAR(120)
title_source VARCHAR   -- 'auto' | 'manual'
preview      TEXT
created_at   TIMESTAMP DEFAULT now()
updated_at   TIMESTAMP DEFAULT now()
```
### Tabella `messages`
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
conversation_id UUID REFERENCES conversations(id)
role            VARCHAR NOT NULL   -- 'user' | 'assistant' | 'tool'
content         TEXT
created_at      TIMESTAMP DEFAULT now()
```
---
## Flusso di Autenticazione
### Login
```
POST /login  { email, password }
      │
      ├─ userRepository.findByEmail(email)
      ├─ argon2.verify(hash, password)
      ├─ jwt.sign({ id, email, role })  → accessToken (15 min)
      ├─ jwt.sign({ id, email, role })  → refreshToken (7 giorni)
      └─ setCookie('accessToken', signed, httpOnly)
         setCookie('refreshToken', signed, httpOnly)
```
#### Esempio codice (da `server.ts`):
```typescript
const accessToken = app.jwt.sign(existingUserWithoutPassword)
reply.setCookie('accessToken', accessToken, {
    signed: true,
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,   // 15 minuti
})
```
### Middleware `authenticate`
```typescript
fastify.decorate('authenticate', async (request, reply) => {
    const token = request.cookies['accessToken']
    const unsignedToken = request.unsignCookie(token)
    const decoded = fastify.jwt.verify(unsignedToken.value)
    request.user = decoded as User
})
```
Ogni route protetta passa `{ onRequest: app.authenticate }` come opzione.
---
## Flusso WebSocket (Chat in tempo reale)
### Handshake
1. Il client chiama `GET /ws-token` → riceve un token JWT con scadenza 2 minuti.
2. Il client apre `WS /:accessToken` usando il token come path parameter.
3. Il backend verifica il token nell'hook `onRequest` e popola `request.user`.
```typescript
app.get('/:accessToken', {
    websocket: true,
    onRequest: async (request, reply) => {
        const token = (request.params as { accessToken: string }).accessToken
        const decoded = app.jwt.verify(token)
        request.user = decoded as User
    },
}, async (socket, req) => { ... })
```
### Protocollo messaggi (WebSocket)
#### Evento client → server
```typescript
// ClientEvent (parseClientEvent)
{
    type: 'send_message',
    conversationId: string,
    content: string
}
// oppure
{
    type: 'new_conversation'
}
```
#### Evento server → client
```typescript
{ type: 'conversation_started', conversationId: string }
{ type: 'typing', active: boolean }
{ type: 'message', role: 'assistant', content: string }
{ type: 'tool_call', toolName: string, result: string }
{ type: 'error', message: string }
```
### Flusso elaborazione messaggio
```
socket.on('message', raw)
    │
    ├─ parseClientEvent(raw)
    ├─ getOwnedConversation(conversationId, userId)  → verifica ownership
    ├─ messageRepository.create({ role: 'user', content })
    ├─ conversationRepository.setAutoTitleIfMissing(conversationId, title)
    ├─ messageRepository.getHistory(conversationId, { limit: 50 })
    ├─ send(socket, { type: 'typing', active: true })
    ├─ runAgent(content, history, user, onToolCall)  → LLM agent loop
    ├─ messageRepository.create({ role: 'assistant', content: response })
    ├─ conversationRepository.touch(conversationId)
    └─ send(socket, { type: 'message', role: 'assistant', content })
       send(socket, { type: 'typing', active: false })
```
---
## Agent Loop (AI)
Il plugin `agentPlugin` esegue un loop iterativo fino a `MAX_ITERATIONS = 10`.
```typescript
async function runAgent(message, history, user, onToolCall): Promise<string> {
    // 1. Seleziona system prompt in base al ruolo (USER / ADMIN)
    const systemPrompt = SYSTEM_PROMPTS[user.role]
    // 2. Filtra i tool disponibili per ruolo
    const allowedTools = toolDefinitions.filter(t =>
        TOOL_ROLES[t.function.name].includes(user.role)
    )
    // 3. Costruisce input con history + nuovo messaggio
    const input = [ systemPrompt, ...history, newMessage ]
    // 4. Loop
    while (iterations < MAX_ITERATIONS) {
        const response = await fastify.openai.responses.create({
            model: 'gpt-4.1-nano',
            tools: allowedTools,
            input: currentInput,
        })
        if (/* nessun tool call */) {
            return response.text  // risposta finale
        }
        // 5. Esegue i tool call e aggiunge i risultati all'input
        for (const toolCall of toolCalls) {
            const handler = toolHandlers.get(toolCall.name)
            const result = await handler({ userId, callerRole, ...args })
            onToolCall(toolCall.name, result)
            currentInput.push(toolCallOutput)
        }
    }
}
```
---
## MCP Tools – Autorizzazione e Handlers
### Matrice ruoli / tool
| Tool | USER | ADMIN |
|------|------|-------|
| `get_balance` | ✅ | ✅ |
| `get_last_transactions` | ✅ | ✅ |
| `get_exchange_rate` | ✅ | ✅ |
| `get_account_info` | ✅ | ✅ |
| `create_account` | ✅ | ❌ |
| `add_transaction` | ✅ | ✅ |
| `check_risk` | ❌ | ✅ |
| `accounts_summary` | ❌ | ✅ |
### Esempio handler `get_balance`
```typescript
const getBalanceHandler: ToolHandlerFn = async (params) => {
    if (!checkAuthorization('get_balance', params.callerRole)) {
        return errorResult('Unauthorized')
    }
    const account = await fastify.accountRepository.findByUserId(params.userId)
    if (!account) return errorResult('Account not found')
    return successResult({ balance: account.balance, currency: account.currency })
}
```
---
## REST API – Endpoint principali
| Metodo | Path | Auth | Descrizione |
|--------|------|------|-------------|
| POST | `/signup` | No | Registrazione nuovo utente |
| POST | `/login` | No | Login, imposta cookie JWT |
| POST | `/logout` | No | Cancella cookie JWT |
| GET | `/me` | ✅ | Dati utente corrente |
| GET | `/ws-token` | ✅ | Token JWT short-lived per WebSocket |
| GET | `/conversations` | ✅ | Lista conversazioni dell'utente |
| POST | `/conversations` | ✅ | Crea nuova conversazione |
| GET | `/conversations/:id/messages` | ✅ | Messaggi paginati |
| PATCH | `/conversations/:id/title` | ✅ | Aggiorna titolo conversazione |
| WS | `/:accessToken` | token in path | WebSocket chat |
---
## Plugin Pattern (Fastify)
Tutti i plugin seguono il pattern `fastify-plugin` per condividere decoratori nello stesso scope:
```typescript
import fp from 'fastify-plugin'
async function myPlugin(fastify: FastifyInstance) {
    fastify.decorate('myService', { ... })
}
export default fp(myPlugin)
```
---
## Struttura cartelle `src/`
```
src/
├── server.ts              # Entry point, registrazione plugin, routes
├── knexfile.ts            # Configurazione Knex (letta da .env)
├── types.d.ts             # Augmentation tipi Fastify
├── plugins/
│   ├── knex.ts            # Plugin connessione DB
│   ├── llm.ts             # Plugin client OpenAI
│   ├── mcp.ts             # Tool definitions + handlers bancari
│   └── agent.ts           # Agent loop OpenAI
├── repositories/
│   ├── userRepository.ts
│   ├── accountRepository.ts
│   ├── transactionRepository.ts
│   ├── conversationRepository.ts
│   └── messageRepository.ts
├── schemas/
│   ├── loginSchema.ts
│   └── signupSchema.ts
├── migrations/            # File Knex migration
├── seeds/                 # File Knex seed
├── utils/
│   ├── conversationTitle.ts
│   └── conversationOwnership.ts
└── websocket/
    └── protocol.ts        # Parsing eventi WS
```