import fp from 'fastify-plugin'
import {FastifyInstance, FastifyPluginOptions} from "fastify";

// --- IBAN generator (fake IT IBAN for demo purposes) ---
function generateIBAN(): string {
    const bban = Array.from({length: 23}, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('')
    return `IT${String(Math.floor(Math.random() * 90) + 10).padStart(2, '0')}${bban}`
}

// --- Role-based tool access mapping ---
export const TOOL_ROLES: Record<string, string[]> = {
    'get_balance': ['USER', 'ADMIN'],
    'get_last_transactions': ['USER', 'ADMIN'],
    'get_exchange_rate': ['USER', 'ADMIN'],
    'get_account_info': ['USER', 'ADMIN'],
    'check_risk': ['ADMIN'],
    'create_account': ['USER'],
    'add_transaction': ['USER', 'ADMIN'],
    'accounts_summary': ['ADMIN'],
}

// --- Authorization helper ---
export function checkAuthorization(toolName: string, callerRole: string): boolean {
    const allowedRoles = TOOL_ROLES[toolName]
    if (!allowedRoles) return false
    return allowedRoles.includes(callerRole)
}

// --- Tool handler type (for internal agent use) ---
export type ToolHandlerFn = (params: { userId: string; callerRole: string; [key: string]: any }) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>

// --- Tool handlers map (populated during plugin registration) ---
export const toolHandlers = new Map<string, ToolHandlerFn>()

// --- OpenAI-compatible tool definitions (for agent loop) ---
export interface OpenAIToolDefinition {
    type: 'function'
    function: {
        name: string
        description: string
        parameters: Record<string, any>
    }
}

export const toolDefinitions: OpenAIToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'get_balance',
            description: 'Returns the account balance and currency for the authenticated user',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_last_transactions',
            description: 'Returns the most recent transactions for the authenticated user',
            parameters: {
                type: 'object',
                properties: {
                    limit: {type: 'number', description: 'Maximum number of transactions to return (default 5)'}
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_exchange_rate',
            description: 'Returns the authenticated user balance and currency for exchange rate calculation',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_account_info',
            description: 'Returns full account details including IBAN, currency, and balance for the authenticated user',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'check_risk',
            description: 'Checks for high-risk transactions (amount > 200000) for fraud detection. Admin only.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_account',
            description: 'Creates a new bank account for the authenticated user. Each user can only have one account.',
            parameters: {
                type: 'object',
                properties: {
                    currency: {type: 'string', enum: ['EUR', 'CHF'], description: 'Account currency (default: EUR)'}
                },
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'accounts_summary',
            description: 'Returns a summary of all accounts in the system with owner identity (firstname, lastname, IBAN), per-currency balance totals, and an EUR-equivalent grand total. Admin only.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_transaction',
            description: 'Adds a new INCOME or EXPENSE transaction for the user account and updates the balance accordingly. ADMIN must provide accountId to target a specific account.',
            parameters: {
                type: 'object',
                properties: {
                    amount: {type: 'number', description: 'Transaction amount (must be positive)'},
                    type: {type: 'string', enum: ['INCOME', 'EXPENSE'], description: 'Type of transaction'},
                    description: {type: 'string', description: 'Optional description for the transaction'},
                    accountId: {type: 'string', description: 'Target account ID (required for ADMIN)'}
                },
                required: ['amount', 'type']
            }
        }
    }
]

async function mcpPluginInternal(fastify: FastifyInstance, options: FastifyPluginOptions) {
    // Dynamic import for ESM package
    const {mcpPlugin} = await import('@platformatic/mcp')

    // Register the MCP transport plugin (adds fastify.mcpAddTool etc. to child scope)
    fastify.register(mcpPlugin, {
        serverInfo: {
            name: 'bankbot-mcp',
            version: '1.0.0'
        },
        capabilities: {
            tools: {listChanged: true}
        },
        instructions: 'BankBot MCP server providing banking tools for balance, transactions, exchange rates, account info, and risk analysis.'
    })

    // --- Helper to build error/success results ---
    function errorResult(message: string) {
        return {content: [{type: 'text' as const, text: message}], isError: true}
    }

    function successResult(data: any) {
        return {content: [{type: 'text' as const, text: JSON.stringify(data)}]}
    }

    // --- Tool handler functions (defined here, registered below after mcpPlugin is ready) ---

    const getBalanceHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('get_balance', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const account = await fastify.accountRepository.findByUserId(params.userId)
        if (!account) {
            return errorResult('Account not found')
        }
        return successResult({balance: (account as any).balance, currency: (account as any).currency})
    }

    const getLastTransactionsHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('get_last_transactions', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const account = await fastify.accountRepository.findByUserId(params.userId)
        if (!account) {
            return errorResult('Account not found')
        }
        const limit = params.limit || 5
        const transactions = await fastify.transactionRepository.findAllTransactionsByAccountId(account.id)
        const limited = transactions ? transactions.slice(0, limit) : []
        return successResult(limited)
    }

    const getExchangeRateHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('get_exchange_rate', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const account = await fastify.accountRepository.findByUserId(params.userId)
        if (!account) {
            return errorResult('Account not found')
        }
        return successResult({
            balance: (account as any).balance,
            currency: (account as any).currency,
            note: 'Use a reasonable current exchange rate for CHF/EUR conversion.'
        })
    }

    const getAccountInfoHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('get_account_info', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const account = await fastify.accountRepository.findByUserId(params.userId)
        if (!account) {
            return errorResult('Account not found')
        }
        return successResult(account)
    }

    const createAccountHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('create_account', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const existing = await fastify.accountRepository.findByUserId(params.userId)
        if (existing) {
            return errorResult('Hai già un conto bancario attivo.')
        }
        const currency = params.currency && ['EUR', 'CHF'].includes(params.currency) ? params.currency : 'EUR'
        const iban = generateIBAN()
        const account = await fastify.accountRepository.create({userid: params.userId, iban, currency})
        return successResult({id: account.id, iban: account.iban, currency: account.currency, balance: account.balance})
    }

    const addTransactionHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('add_transaction', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const { amount, type, description, accountId } = params
        if (!amount || amount <= 0) {
            return errorResult('L\'importo deve essere un numero positivo.')
        }
        if (!['INCOME', 'EXPENSE'].includes(type)) {
            return errorResult('Il tipo di transazione deve essere INCOME o EXPENSE.')
        }
        let account
        if (params.callerRole === 'ADMIN') {
            if (!accountId) {
                return errorResult('Gli amministratori devono specificare un accountId per operare su un conto.')
            }
            account = await fastify.accountRepository.findById(accountId)
        } else {
            account = await fastify.accountRepository.findByUserId(params.userId)
        }
        if (!account) {
            return errorResult('Conto non trovato.')
        }
        const delta = type === 'INCOME' ? amount : -amount
        if (type === 'EXPENSE' && (account as any).balance + delta < 0) {
            return errorResult('Fondi insufficienti per completare la transazione.')
        }
        const transaction = await fastify.transactionRepository.create({
            accountid: account.id,
            amount,
            type: type as 'INCOME' | 'EXPENSE',
            description: description || null
        })
        await fastify.accountRepository.updateBalance(account.id, delta)
        return successResult({id: transaction.id, amount: transaction.amount, type: transaction.type, description: transaction.description, date: transaction.date})
    }

    const accountsSummaryHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('accounts_summary', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const accounts = await fastify.accountRepository.findAllWithUsers()
        if (!accounts || accounts.length === 0) {
            return successResult({total_accounts: 0, totals_by_currency: {}, total_eur_equivalent: 0, accounts: []})
        }
        const totals_by_currency: Record<string, number> = {}
        for (const acc of accounts) {
            const cur = (acc as any).currency
            totals_by_currency[cur] = (totals_by_currency[cur] || 0) + Number((acc as any).balance)
        }
        const CHF_TO_EUR = 1.05
        let total_eur_equivalent = 0
        for (const [cur, total] of Object.entries(totals_by_currency)) {
            total_eur_equivalent += cur === 'CHF' ? total * CHF_TO_EUR : total
        }
        return successResult({
            total_accounts: accounts.length,
            totals_by_currency: Object.fromEntries(Object.entries(totals_by_currency).map(([k, v]) => [k, Math.round(v * 100) / 100])),
            total_eur_equivalent: Math.round(total_eur_equivalent * 100) / 100,
            accounts: accounts.map((acc: any) => ({
                id: acc.id,
                iban: acc.iban,
                currency: acc.currency,
                balance: acc.balance,
                firstname: acc.firstname,
                lastname: acc.lastname
            }))
        })
    }

    const checkRiskHandler: ToolHandlerFn = async (params) => {
        if (!checkAuthorization('check_risk', params.callerRole)) {
            return errorResult('Unauthorized')
        }
        const account = await fastify.accountRepository.findByUserId(params.userId)
        if (!account) {
            return errorResult('Account not found')
        }
        const transactions = await fastify.transactionRepository.findAllTransactionsByAccountId(account.id)
        const highRisk = transactions ? transactions.filter((t: any) => t.amount > 200000) : []
        if (highRisk.length === 0) {
            return successResult({message: 'Nessuna anomalia rilevata. Tutte le transazioni sono sotto la soglia di rischio.'})
        }
        return successResult(highRisk.map((t: any) => ({
            risk: 'HIGH',
            id: t.id,
            amount: t.amount,
            date: t.date
        })))
    }

    // --- Populate toolHandlers map for direct agent use (no MCP roundtrip needed) ---
    toolHandlers.set('accounts_summary', accountsSummaryHandler)
    toolHandlers.set('get_balance', getBalanceHandler)
    toolHandlers.set('get_last_transactions', getLastTransactionsHandler)
    toolHandlers.set('get_exchange_rate', getExchangeRateHandler)
    toolHandlers.set('get_account_info', getAccountInfoHandler)
    toolHandlers.set('check_risk', checkRiskHandler)
    toolHandlers.set('create_account', createAccountHandler)
    toolHandlers.set('add_transaction', addTransactionHandler)

    // --- Register tools with MCP transport after mcpPlugin child scope is ready ---
    fastify.after(() => {
        fastify.mcpAddTool({
            name: 'get_balance',
            description: 'Returns the account balance and currency for the authenticated user',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, async (params: any) => {
            return getBalanceHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'get_last_transactions',
            description: 'Returns the most recent transactions for the authenticated user',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: {type: 'number', description: 'Maximum number of transactions to return (default 5)'}
                },
                required: []
            }
        }, async (params: any) => {
            return getLastTransactionsHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'get_exchange_rate',
            description: 'Returns the authenticated user balance and currency for exchange rate calculation',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, async (params: any) => {
            return getExchangeRateHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'get_account_info',
            description: 'Returns full account details including IBAN, currency, and balance for the authenticated user',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, async (params: any) => {
            return getAccountInfoHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'check_risk',
            description: 'Checks for high-risk transactions (amount > 200000) for fraud detection. Admin only.',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, async (params: any) => {
            return checkRiskHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'create_account',
            description: 'Creates a new bank account for the authenticated user. Each user can only have one account.',
            inputSchema: {
                type: 'object',
                properties: {
                    currency: {type: 'string', enum: ['EUR', 'CHF'], description: 'Account currency (default: EUR)'}
                },
                required: []
            }
        }, async (params: any) => {
            return createAccountHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'accounts_summary',
            description: 'Returns a summary of all accounts in the system with owner identity (firstname, lastname, IBAN), per-currency balance totals, and an EUR-equivalent grand total. Admin only.',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }, async (params: any) => {
            return accountsSummaryHandler(params) as any
        })

        fastify.mcpAddTool({
            name: 'add_transaction',
            description: 'Adds a new INCOME or EXPENSE transaction for the user account and updates the balance accordingly. ADMIN must provide accountId to target a specific account.',
            inputSchema: {
                type: 'object',
                properties: {
                    amount: {type: 'number', description: 'Transaction amount (must be positive)'},
                    type: {type: 'string', enum: ['INCOME', 'EXPENSE'], description: 'Type of transaction'},
                    description: {type: 'string', description: 'Optional description for the transaction'},
                    accountId: {type: 'string', description: 'Target account ID (required for ADMIN)'}
                },
                required: ['amount', 'type']
            }
        }, async (params: any) => {
            return addTransactionHandler(params) as any
        })
    })
}

export const mcpBankPlugin = fp(mcpPluginInternal, {
    name: 'mcp',
    dependencies: ['knex', 'accountRepository', 'transactionRepository']
})
