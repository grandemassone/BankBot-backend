const FALLBACK_TITLE = 'Nuova conversazione'
const MAX_AUTO_TITLE_LENGTH = 70
const MAX_AUTO_TITLE_WORDS = 10

function normalizeWhitespace(input: string): string {
    return input.replace(/\s+/g, ' ').trim()
}

export function buildAutoConversationTitle(content: string): string {
    const normalized = normalizeWhitespace(content)
    if (!normalized) {
        return FALLBACK_TITLE
    }

    const words = normalized.split(' ').slice(0, MAX_AUTO_TITLE_WORDS)
    let title = words.join(' ')

    if (title.length > MAX_AUTO_TITLE_LENGTH) {
        title = `${title.slice(0, MAX_AUTO_TITLE_LENGTH - 1).trimEnd()}…`
    }

    return title || FALLBACK_TITLE
}

export function sanitizeManualConversationTitle(title: string): string {
    const normalized = normalizeWhitespace(title)
    if (!normalized) {
        throw new Error('Title cannot be empty')
    }

    return normalized.length > MAX_AUTO_TITLE_LENGTH
        ? `${normalized.slice(0, MAX_AUTO_TITLE_LENGTH - 1).trimEnd()}…`
        : normalized
}

export { FALLBACK_TITLE }

