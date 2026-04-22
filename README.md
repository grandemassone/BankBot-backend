# BankBot – Backend

API REST + WebSocket per l'assistente bancario BankBot, costruito con **Fastify**, **Knex**, **PostgreSQL** e **OpenAI**.

---

## Requisiti

| Tool | Versione minima |
|------|----------------|
| Node.js | 20.x |
| npm | 9.x |
| Docker + Docker Compose | qualsiasi versione recente |

---

## 1. Clonazione del repository

```bash
git clone <url-del-repository>
cd BankBot-backend
```

---

## 2. Variabili d'ambiente

Crea un file `.env` nella root del progetto copiando il seguente template:

```env
# Database
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres
DB_DATABASE=bankbot

# Auth
JWT_SECRET=supersecretjwtkey
COOKIE_SECRET=supersecretcookiekey

# OpenAI
OPENAI_API_KEY=sk-...
```

> **Nota:** `COOKIE_SECRET` deve essere una stringa di almeno 32 caratteri.

---

## 3. Avvio del database con Docker

Il progetto include un `docker-compose.yml` che avvia PostgreSQL 15.

```bash
docker compose up -d
```

Verifica che il container sia in esecuzione:

```bash
docker ps
# Deve comparire: bankbot-database  (0.0.0.0:5432->5432/tcp)
```

---

## 4. Installazione delle dipendenze

```bash
npm install
```

---

## 5. Esecuzione delle migrazioni

Le migrazioni creano tutte le tabelle necessarie nel database.

```bash
npx knex migrate:latest --knexfile src/knexfile.ts
```

Le migrazioni vengono eseguite nell'ordine seguente:

| File | Tabelle create |
|------|---------------|
| `20260327130000_create_base_tables` | `users`, `accounts`, `transactions`, `chats` |
| `20260327140000_create_conversations` | `conversations` |
| `20260327140001_create_messages` | `messages` |
| `20260327140002_add_indexes` | Indici di performance |
| `20260422101000_add_conversation_metadata` | Colonne `title`, `title_source`, `preview` |

Per eseguire il rollback dell'ultima migrazione:

```bash
npx knex migrate:rollback --knexfile src/knexfile.ts
```

---

## 6. Esecuzione dei seed

I seed popolano il database con dati di esempio (10 utenti con ruolo ADMIN, conti e transazioni).

```bash
npx knex seed:run --knexfile src/knexfile.ts
```

> **Attenzione:** i seed cancellano i dati esistenti in `transactions`, `accounts` e gli utenti ADMIN prima di reinserirli.

---

## 7. Avvio dell'applicazione

### Modalità sviluppo (con ts-node)

```bash
npm run start:dev
```

### Modalità produzione

```bash
npm run build
npm start
```

Il server è disponibile su `http://localhost:3000`.

---

## 8. Test

```bash
npm test
```

---

## Riepilogo comandi

```bash
# 1. Clona
git clone <url> && cd BankBot-backend

# 2. Crea .env (vedi sezione 2)

# 3. Avvia database
docker compose up -d

# 4. Installa dipendenze
npm install

# 5. Migrazioni
npx knex migrate:latest --knexfile src/knexfile.ts

# 6. Seed
npx knex seed:run --knexfile src/knexfile.ts

# 7. Avvia server
npm run start:dev
```