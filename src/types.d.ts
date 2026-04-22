import { Knex } from 'knex';
import {UserRepository} from './repositories/userRepository';
import AccountRepository from "./repositories/accountRepository";
import TransactionRepository from "./repositories/transactionRepository";
import {ConversationRepository} from "./repositories/conversationRepository";
import {MessageRepository} from "./repositories/messageRepository";

export interface Message {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface Conversation {
  id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_call_id: string | null;
  tool_name: string | null;
  tool_args: Record<string, any> | null;
  created_at: Date;
}

declare module 'fastify' {
  export interface FastifyInstance {
    knex: Knex;
    userRepository: UserRepository;
    accountRepository: AccountRepository;
    transactionRepository: TransactionRepository;
    conversationRepository: ConversationRepository;
    messageRepository: MessageRepository;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => void;
    fastifyJwt: FastifyJWT;
    openai: import('openai').OpenAI;
    runAgent: (message: string, history: Message[], user: { id: string; role: string }, onToolCall?: (toolName: string, result: string) => void) => Promise<string>;
  }
  export interface FastifyRequest {
    user: User;
  }
}

export interface User {
  id: string;
  email: string;
  role: string;
  iat: number;
}