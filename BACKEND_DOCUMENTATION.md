# BankBot Backend - Documentazione di Business

## Panoramica del prodotto

BankBot e' un sistema di assistente bancario conversazionale. Il backend espone le API che consentono agli utenti di interagire con il proprio conto bancario tramite linguaggio naturale, delegando l'esecuzione di operazioni bancarie a un agente AI.

---

## Profili utente

### Cliente (ruolo USER)
Il cliente e' un correntista registrato che puo' accedere al proprio conto, visualizzare il saldo, consultare le transazioni e aprire un nuovo conto. Interagisce esclusivamente con i propri dati.

### Amministratore (ruolo ADMIN)
L'amministratore ha visibilita' sull'intero sistema bancario. Puo' eseguire operazioni su conti specifici, analizzare transazioni sospette e ottenere riepiloghi aggregati di tutti i conti.

---

## Funzionalita' principali

### 1. Registrazione e Login

- **Registrazione:** un nuovo utente puo' creare un account fornendo nome, cognome, email e password. La password viene conservata in forma cifrata tramite hash Argon2.
- **Login:** l'utente accede con email e password. In caso di successo riceve due cookie sicuri (accessToken, refreshToken) che consentono l'accesso alle aree protette senza dover reinserire le credenziali.
- **Logout:** cancella i cookie di sessione, terminando la sessione in modo sicuro.

---

### 2. Chat con l'Assistente AI

L'assistente bancario e' il cuore del prodotto. L'utente puo' porre domande e richiedere operazioni in linguaggio naturale attraverso una chat in tempo reale.

**Capacita' dell'assistente per i clienti:**

| Richiesta utente | Azione eseguita |
|-----------------|----------------|
| Qual e' il mio saldo? | Recupera il saldo dal database |
| Mostrami le ultime transazioni | Elenca le ultime 5 transazioni del conto |
| Qual e' il tasso di cambio? | Fornisce informazioni sulla valuta del conto |
| Voglio i dettagli del mio conto | Mostra IBAN, valuta e saldo |
| Apri un conto in CHF | Crea un nuovo conto bancario in CHF |
| Aggiungi una spesa di 50 euro | Registra una transazione di tipo EXPENSE |

**Capacita' aggiuntive per gli amministratori:**

| Richiesta admin | Azione eseguita |
|----------------|----------------|
| Mostra tutti i conti del sistema | Riepilogo completo con totali per valuta |
| Controlla transazioni sospette | Identifica movimenti superiori a 200.000 |
| Aggiungi entrata sul conto X | Registra una transazione su un conto specifico |

**Comportamento intelligente dell'assistente:**
- Se l'utente non ha ancora un conto, l'assistente lo rileva automaticamente e propone di aprirne uno.
- L'assistente risponde sempre in italiano, con tono formale e professionale.
- Non inventa mai dati: si basa esclusivamente sulle informazioni restituite dai sistemi bancari.

---

### 3. Gestione delle Conversazioni

Ogni sessione di chat viene salvata come conversazione e puo' essere recuperata in un secondo momento.

- **Titolo automatico:** quando viene inviato il primo messaggio, il sistema genera automaticamente un titolo basato sul contenuto.
- **Titolo manuale:** l'utente puo' rinominare una conversazione in qualsiasi momento.
- **Storico messaggi:** tutti i messaggi sono persistenti e recuperabili con paginazione a cursore temporale.
- **Isolamento:** ogni utente vede solo le proprie conversazioni; non e' possibile accedere alle conversazioni altrui.

---

### 4. Sicurezza

- **Cookie httpOnly:** i token JWT non sono accessibili da JavaScript lato client, proteggendo da attacchi XSS.
- **Cookie firmati:** ogni cookie e' firmato con un segreto server-side per prevenire manomissioni.
- **Token WebSocket short-lived:** per la connessione WebSocket viene emesso un token JWT valido solo 2 minuti, riducendo il rischio di intercettazione.
- **Ownership delle conversazioni:** prima di eseguire qualsiasi operazione su una conversazione, il sistema verifica che appartenga all'utente autenticato.
- **Autorizzazione per tool:** ogni funzione dell'agente AI e' vincolata al ruolo dell'utente; un cliente non puo' mai invocare funzioni riservate agli amministratori.

---

### 5. Valute supportate

| Valuta | Codice |
|--------|--------|
| Euro | EUR |
| Franco svizzero | CHF |

---

## Limiti e regole di business

- Ogni utente puo' avere **un solo conto bancario**.
- Le transazioni devono avere un importo **strettamente positivo**.
- I titoli delle conversazioni hanno una lunghezza massima di **120 caratteri**.
- La cronologia messaggi per ogni richiesta all'AI e' limitata agli ultimi **50 messaggi**.
- L'agente AI esegue al massimo **10 iterazioni** per risposta per prevenire loop infiniti.
- Le transazioni con importo superiore a 200.000 sono considerate ad alto rischio e rilevabili dall'amministratore.

---

## Dati di esempio (Seed)

Il sistema include dati precaricati per ambienti di sviluppo e test:
- 10 utenti con ruolo ADMIN, con email e nome realistici generati casualmente.
- Password uniforme per tutti gli utenti seed: **demodemo**.
- Conti e transazioni associate generate automaticamente.