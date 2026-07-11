import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../constants.js';

export const ChatRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});
export type ChatHistoryMessage = z.infer<typeof ChatHistoryMessageSchema>;

export const ChatRequestSchema = z.object({
  session_id: z.string().min(1),
  message: z.string().min(1).max(2000),
  history: z.array(ChatHistoryMessageSchema).optional(),
  lang: z.enum(SUPPORTED_LOCALES).optional(),
  image_b64: z.string().optional(),
  location_node_id: z.string().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), text: z.string(), index: z.number().int() }),
  z.object({
    type: z.literal('toolCall'),
    name: z.string(),
    args: z.record(z.unknown()),
    id: z.string(),
  }),
  z.object({
    type: z.literal('toolResult'),
    name: z.string(),
    id: z.string(),
    ok: z.boolean(),
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal('done'),
    usage: z.object({
      input_tokens: z.number().int(),
      output_tokens: z.number().int(),
    }),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
  z.object({ type: z.literal('heartbeat') }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;
