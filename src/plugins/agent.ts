import fp from 'fastify-plugin'
import {FastifyInstance, FastifyPluginOptions} from "fastify";
import {TOOL_ROLES, toolDefinitions, toolHandlers} from "./mcp";
import type {ResponseInputItem, ResponseFunctionToolCall} from "openai/resources/responses/responses";

// --- Role-specific Italian system prompts ---
const SYSTEM_PROMPTS: Record<string, string> = {
    USER: `Sei un assistente bancario esperto e professionale. Il tuo compito è fornire supporto operativo ai clienti della banca.

Rispondi sempre in italiano, con un tono formale, cortese e conciso.

Hai accesso ai seguenti strumenti:
- Consultare il saldo del conto
- Visualizzare le ultime transazioni
- Fornire informazioni sul tasso di cambio
- Mostrare i dettagli completi del conto
- Aprire un nuovo conto bancario
- Aggiungere una transazione (entrata o uscita)

Basati esclusivamente sui dati restituiti dagli strumenti. Non inventare mai informazioni non presenti nei dati.
Se non riesci a soddisfare una richiesta, spiega cortesemente il motivo.

IMPORTANTE — Gestione conto inesistente: se uno strumento restituisce un risultato contenente "Account not found", NON dire che non riesci a recuperare le informazioni e NON suggerire di contattare il servizio clienti. Invece, devi OBBLIGATORIAMENTE rispondere in questo modo: informa l'utente che non ha ancora un conto bancario attivo e chiedi se desidera aprirne uno, specificando che può scegliere la valuta EUR o CHF (default EUR). Attendi la conferma esplicita dell'utente prima di invocare lo strumento create_account.`,

    ADMIN: `Sei un assistente bancario esperto e professionale dedicato agli amministratori della banca. Il tuo compito è fornire supporto operativo avanzato e analisi dei rischi.

Rispondi sempre in italiano, con un tono formale, preciso e analitico.

Hai accesso ai seguenti strumenti — usa SEMPRE il nome esatto dello strumento indicato tra parentesi:
- Saldo del tuo conto (get_balance)
- Ultime transazioni del tuo conto (get_last_transactions)
- Tasso di cambio (get_exchange_rate)
- Dettagli del tuo conto (get_account_info)
- Analisi del rischio su transazioni sospette (check_risk)
- Aggiungere una transazione su un conto specifico, richiede accountId (add_transaction)
- Riepilogo di TUTTI i conti del sistema con intestatari, IBAN, saldi, totali per valuta e totale in EUR (accounts_summary)

IMPORTANTE — Quando l'utente chiede un riepilogo, elenco, lista o sommario di tutti i conti, devi OBBLIGATORIAMENTE invocare lo strumento accounts_summary. Non invocare get_balance, get_account_info o altri strumenti per questa richiesta.

Basati esclusivamente sui dati restituiti dagli strumenti. Non inventare mai informazioni non presenti nei dati.
Quando presenti analisi di rischio, sii dettagliato e strutturato nella risposta.`
}

// Conversation history item accepted by runAgent
export interface Message {
    role: string
    content: string
    tool_call_id?: string
    tool_calls?: any[]
}

const MAX_ITERATIONS = 10
const GENERIC_ERROR_MESSAGE = "Mi scuso, si è verificato un errore nell'elaborazione della richiesta. Riprova."

function toResponseInputItem(message: Message): ResponseInputItem {
    if (message.role === 'tool' && message.tool_call_id) {
        return {
            type: 'function_call_output',
            call_id: message.tool_call_id,
            output: message.content
        }
    }

    return {
        type: 'message',
        role: message.role as 'system' | 'user' | 'assistant' | 'developer',
        content: message.content
    }
}

async function agentPluginInternal(fastify: FastifyInstance, _options: FastifyPluginOptions) {

    async function runAgent(
        message: string,
        history: Message[],
        user: { id: string; role: string },
        onToolCall?: (toolName: string, result: string) => void
    ): Promise<string> {

        const systemPrompt = SYSTEM_PROMPTS[user.role] || SYSTEM_PROMPTS.USER

        // Filter tools by user role
        const allowedTools = toolDefinitions
            .filter(t => {
                const allowed = TOOL_ROLES[t.function.name]
                return allowed && allowed.includes(user.role)
            })
            .map(t => ({
                type: 'function' as const,
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
                strict: false
            }))

        const input: ResponseInputItem[] = [
            {
                type: 'message',
                role: 'system',
                content: systemPrompt
            },
            ...history.map(toResponseInputItem),
            {
                type: 'message',
                role: 'user',
                content: message
            }
        ]

        // Agent loop
        let iterations = 0
        let currentInput = input

        while (iterations < MAX_ITERATIONS) {
            iterations++

            let response
            try {
                response = await fastify.openai.responses.create({
                    model: 'gpt-4.1-nano',
                    input: currentInput,
                    tools: allowedTools,
                    temperature: 0.7,
                    store: false
                })
            } catch (error: any) {
                fastify.log.error({err: error}, 'OpenAI API error in agent loop')
                return GENERIC_ERROR_MESSAGE
            }

            // Check for function calls in output
            const functionCalls = response.output.filter(
                (item): item is ResponseFunctionToolCall => item.type === 'function_call'
            )

            // If no function calls, we have a final text response
            if (functionCalls.length === 0) {
                return response.output_text || GENERIC_ERROR_MESSAGE
            }

            // Execute tool calls and feed results back
            const toolOutputs: ResponseInputItem[] = []

            // First, add the function call items themselves to the input
            for (const fc of functionCalls) {
                toolOutputs.push(fc as any)
            }

            // Then execute each and add results
            for (const fc of functionCalls) {
                const handler = toolHandlers.get(fc.name)
                let output: string

                if (!handler) {
                    output = JSON.stringify({isError: true, error: `Tool ${fc.name} not found`})
                } else {
                    try {
                        const args = JSON.parse(fc.arguments || '{}')
                        // Inject userId and callerRole for authorization
                        args.userId = user.id
                        args.callerRole = user.role
                        const result = await handler(args)
                        output = result.content.map(c => c.text).join('\n')
                        onToolCall?.(fc.name, output)
                    } catch (error: any) {
                        fastify.log.error({err: error, tool: fc.name}, 'Tool execution error')
                        output = JSON.stringify({
                            isError: true,
                            error: `Errore nell'esecuzione dello strumento ${fc.name}: ${error?.message || 'errore sconosciuto'}`
                        })
                    }
                }

                toolOutputs.push({
                    type: 'function_call_output',
                    call_id: fc.call_id,
                    output: output
                })
            }

            // Continue loop with the original input + tool call + tool output
            currentInput = [...currentInput, ...toolOutputs]
        }

        // Max iterations reached
        fastify.log.error({maxIterations: MAX_ITERATIONS}, 'Agent loop exceeded maximum iterations')
        return GENERIC_ERROR_MESSAGE
    }

    fastify.decorate('runAgent', runAgent)
}

export const agentPlugin = fp(agentPluginInternal, {
    name: 'agent',
    dependencies: ['llm', 'mcp']
})
