import fp from 'fastify-plugin'
import { FastifyInstance, FastifyPluginOptions } from "fastify";

function prompterPluginInternal(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
    const prompter = {
        "USER": {
            "BALANCE":
                "L'utente vuole conoscere il suo saldo.\n" +
                "Analizza l'oggetto 'account' fornito.\n" +
                "Rispondi indicando chiaramente l'importo totale e la valuta (es. CHF o EUR).\n" +
                "Se il saldo è basso (sotto i 50), avvisa l'utente gentilmente.",

            "LAST_TRANSACTIONS":
                "L'utente vuole vedere i movimenti.\n" +
                "Analizza l'array 'transactions' fornito.\n" +
                "Elenca le transazioni più recenti (massimo 5 se non specificato diversamente) in un formato elenco puntato o tabella markdown leggibile.\n" +
                "Per ogni transazione mostra: Data | Descrizione | Importo (con segno + o -).",

            "CHANGE":
                "L'utente desidera visualizzare il controvalore del proprio saldo in un'altra valuta." +
                "1. Analizza il saldo ('balance') e la valuta ('currency') attuali dell'account.\n" +
                "2. Identifica la valuta di destinazione richiesta (se non specificata, usa EUR se il conto è in CHF, o CHF se è in EUR).\n" +
                "3. Usa un tasso di cambio verosimile e aggiornato.\n" +
                "4. Esegui il calcolo matematico: Saldo Attuale * Tasso.\n" +
                "5. Rispondi con questo formato:\n" +
                "Il tuo saldo attuale è: [Saldo Originale]\n" +
                "Al tasso di cambio stimato di [Tasso Usato]...\n" +
                "...il controvalore corrisponderebbe a circa: [Nuovo Importo] [Nuova Valuta]\n" +
                "6. Aggiungi obbligatoriamente il disclaimer:" + "Attenzione: questo è un calcolo indicativo. Il tasso reale verrà applicato al momento dell'operazione bancaria.",

            "INFO_ACCOUNT": "L'utente desidera le informazioni sul suo account"
        },

        "ADMIN": {
            "RISK":
                "L'amministratore richiede un controllo antifrode sulle transazioni recenti." +
                "1. Analizza l'array 'transactions'." +
                "2. Filtra e mostra SOLO le transazioni con importo superiore a 200000.00 (qualsiasi valuta)." +
                "3. Per ogni transazione trovata, scrivi: " + "[RISCHIO ALTO] ID: [id] - Importo: [amount] - Data: [date]." +
                "4. Se non ci sono transazioni sopra i 200000, rispondi semplicemente: " + "Nessuna anomalia rilevata. Tutte le transazioni sono sotto la soglia di rischio."
        }
    }

    fastify.decorate("prompter", prompter)

    done()
}

export const prompterPlugin = fp(prompterPluginInternal, { name: 'prompter' })