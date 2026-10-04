import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProductResponse } from '@/lib/api'
import { refreshDecisionReport } from '@/features/shopping/evidenceFreshness'
import {
  deriveBrief,
  newShoppingTask,
  productKey,
  type DecisionReport,
  type RequestIdentity,
  type ShoppingBrief,
  type ShoppingTask,
} from '@/features/shopping/model'

export type { RequestIdentity } from '@/features/shopping/model'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: ProductResponse[]
  decision?: DecisionReport
  kind?: 'reply' | 'comparison' | 'error'
  recommendation_paging?: {
    query: string
    page: number
    limit: number
    hasMore: boolean
    isLoadingMore?: boolean
    noGrowthCount?: number
  }
  timestamp: Date
}

export interface Conversation {
  id: string
  title: string
  lastMessage: string
  timestamp: Date
  messages: Message[]
}

type MessagePatch = Partial<Omit<Message, 'id' | 'role' | 'timestamp'>>

interface ChatStore {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  ownerEmail: string | null
  ownerEpoch: string
  tasks: Record<string, ShoppingTask>
  draftTask: ShoppingTask
  addMessage: (message: Omit<Message, 'timestamp'>) => void
  updateMessage: (id: string, patch: MessagePatch) => void
  updateMessageForConversation: (conversationId: string, id: string, patch: MessagePatch) => void
  createConversation: (firstMessage: string) => void
  switchConversation: (id: string) => void
  clearMessages: () => void
  resetForGuest: () => void
  setOwnerEmail: (email: string | null) => void
  beginRequest: (query: string, brief: ShoppingBrief) => RequestIdentity
  completeRequest: (
    identity: RequestIdentity,
    message: Omit<Message, 'timestamp'>,
    taskPatch?: Partial<ShoppingTask>,
  ) => boolean
  updateTask: (patch: Partial<ShoppingTask>, conversationId?: string | null) => void
  toggleSaved: (product: ProductResponse) => void
}

const STORAGE_KEY = 'pivota-chat-storage'
const MAX_HISTORY = 20
const uid = () => typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`
const greeting = (): Message[] => [{
  id: '0',
  role: 'assistant',
  content: "Hi! I'm your Pivota shopping assistant. What are you looking for today?",
  timestamp: new Date(),
}]
const sortConversations = (conversations: Conversation[]) => [...conversations].sort(
  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
)
const titleFor = (query: string) => query.length > 30 ? `${query.slice(0, 30)}...` : query || 'Shopping task'
const pruneTasks = (conversations: Conversation[], tasks: Record<string, ShoppingTask>) =>
  Object.fromEntries(conversations.map(({ id }) => [id, Object.hasOwn(tasks, id) ? tasks[id] : newShoppingTask()]))
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {}
const date = (value: unknown) => {
  const parsed = typeof value === 'string' || typeof value === 'number' || value instanceof Date ? new Date(value) : new Date()
  return Number.isFinite(parsed.getTime()) ? parsed : new Date()
}
const products = (value: unknown): ProductResponse[] => Array.isArray(value)
  ? value.filter((item): item is ProductResponse => {
    const product = object(item)
    return typeof product.product_id === 'string' && typeof product.title === 'string'
  })
  : []

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string')
  : []

function restoreDecision(value: unknown): DecisionReport | undefined {
  const report = object(value)
  if (typeof report.summary !== 'string' || !Array.isArray(report.items)) return undefined
  return refreshDecisionReport({
    summary: report.summary,
    compared: report.compared === true,
    ...(typeof report.fragranceRequired === 'boolean' ? { fragranceRequired: report.fragranceRequired } : {}),
    ...(typeof report.includeIngredients === 'boolean' ? { includeIngredients: report.includeIngredients } : {}),
    items: report.items.flatMap((entry): DecisionReport['items'] => {
      const item = object(entry)
      const product = products([item.product])[0]
      if (!product) return []
      return [{
        product,
        ...(item.verification && typeof item.verification === 'object' ? { verification: item.verification as DecisionReport['items'][number]['verification'] } : {}),
        ...(item.eligibility === 'rejected' || item.eligibility === 'candidate' || item.eligibility === 'unverified' ? { eligibility: item.eligibility } : {}),
        fragrance: item.fragrance === 'verified' || item.fragrance === 'conflict' ? item.fragrance : 'unverified',
        ingredientEvidence: typeof item.ingredientEvidence === 'string' ? item.ingredientEvidence : '',
        size: typeof item.size === 'string' ? item.size : '',
        price: typeof item.price === 'string' ? item.price : '',
        retailer: typeof item.retailer === 'string' ? item.retailer : '',
        ...(typeof item.variantId === 'string' ? { variantId: item.variantId } : {}),
        alternatives: strings(item.alternatives),
        tradeoffs: strings(item.tradeoffs),
        missing: strings(item.missing),
        sources: (Array.isArray(item.sources) ? item.sources : []).flatMap((entry) => {
          const source = object(entry)
          return typeof source.label === 'string' && typeof source.url === 'string' ? [{
            label: source.label,
            url: source.url,
            ...(typeof source.observedAt === 'string' ? { observedAt: source.observedAt } : {}),
            ...(typeof source.stale === 'boolean' ? { stale: source.stale } : {}),
          }] : []
        }),
      }]
    }),
  })
}

function restoreMessages(value: unknown): Message[] {
  if (!Array.isArray(value)) return greeting()
  const restored = value.flatMap((entry): Message[] => {
    const message = object(entry)
    if (typeof message.id !== 'string' || typeof message.content !== 'string' ||
      (message.role !== 'user' && message.role !== 'assistant')) return []
    const paging = object(message.recommendation_paging)
    const decision = restoreDecision(message.decision)
    return [{
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: date(message.timestamp),
      ...(Array.isArray(message.products) ? { products: products(message.products) } : {}),
      ...(decision ? { decision } : {}),
      ...(message.kind === 'reply' || message.kind === 'comparison' || message.kind === 'error' ? { kind: message.kind } : {}),
      ...(message.recommendation_paging ? { recommendation_paging: {
        query: typeof paging.query === 'string' ? paging.query : '',
        page: typeof paging.page === 'number' && paging.page > 0 ? paging.page : 1,
        limit: typeof paging.limit === 'number' && paging.limit > 0 ? paging.limit : 12,
        hasMore: paging.hasMore === true,
        isLoadingMore: false,
        noGrowthCount: typeof paging.noGrowthCount === 'number' && paging.noGrowthCount >= 0 ? paging.noGrowthCount : 0,
      } } : {}),
    }]
  })
  return restored.length ? restored : greeting()
}

function restoreTask(value: unknown, messages: Message[] = []): ShoppingTask {
  const raw = object(value)
  const inferred = messages.reduce<ShoppingBrief>(
    (brief, message) => message.role === 'user' ? deriveBrief(message.content, brief) : brief,
    newShoppingTask().brief,
  )
  const rawBrief = object(raw.brief)
  const budget = object(rawBrief.budget)
  const brief: ShoppingBrief = Object.hasOwn(raw, 'brief') ? {
    intent: typeof rawBrief.intent === 'string' ? rawBrief.intent : inferred.intent,
    ...(typeof rawBrief.category === 'string' ? { category: rawBrief.category } : {}),
    ...(typeof rawBrief.fragranceFree === 'boolean' ? { fragranceFree: rawBrief.fragranceFree } : {}),
    ...(typeof budget.amount === 'number' && Number.isFinite(budget.amount) && budget.amount > 0 &&
      typeof budget.currency === 'string' && /^[A-Z]{3}$/.test(budget.currency)
      ? { budget: { amount: budget.amount, currency: budget.currency, exclusive: budget.exclusive === true } } : {}),
    ...(typeof rawBrief.requestedCount === 'number' && Number.isInteger(rawBrief.requestedCount) && rawBrief.requestedCount > 0
      ? { requestedCount: rawBrief.requestedCount } : {}),
  } : inferred
  const lastProductReply = [...messages].reverse().find((message) => message.role === 'assistant' && message.products?.length)
  const request = object(raw.request)
  const validRequest = typeof request.id === 'string' && typeof request.query === 'string' &&
    (request.status === 'pending' || request.status === 'complete' || request.status === 'error' || request.status === 'interrupted')
  return {
    ...newShoppingTask(),
    brief,
    draft: typeof raw.draft === 'string' ? raw.draft : '',
    displayedProducts: Array.isArray(raw.displayedProducts) ? products(raw.displayedProducts) : lastProductReply?.products || [],
    savedProducts: products(raw.savedProducts),
    ...(validRequest ? { request: {
      id: request.id as string,
      query: request.query as string,
      status: request.status as NonNullable<ShoppingTask['request']>['status'],
    } } : {}),
  }
}

/** Hydrate both legacy history and task state without reviving network requests. */
export function migrateChatState(input: unknown) {
  const value = object(input)
  const seen = new Set<string>()
  const conversations = sortConversations((Array.isArray(value.conversations) ? value.conversations : []).flatMap((entry): Conversation[] => {
    const conversation = object(entry)
    if (typeof conversation.id !== 'string' || !conversation.id || seen.has(conversation.id)) return []
    seen.add(conversation.id)
    const messages = restoreMessages(conversation.messages)
    const query = messages.find((message) => message.role === 'user')?.content || ''
    return [{
      id: conversation.id,
      title: typeof conversation.title === 'string' ? conversation.title : titleFor(query),
      lastMessage: messages[messages.length - 1]?.content.slice(0, 50) || '',
      timestamp: date(conversation.timestamp),
      messages,
    }]
  })).slice(0, MAX_HISTORY)
  const rawTasks = object(value.tasks)
  const tasks: Record<string, ShoppingTask> = Object.fromEntries(conversations.map((conversation) => {
    const task = restoreTask(Object.hasOwn(rawTasks, conversation.id) ? rawTasks[conversation.id] : undefined, conversation.messages)
    if (task.request?.status === 'pending') {
      const interruptionId = `interrupted-${task.request.id}`
      task.request = { ...task.request, status: 'interrupted' }
      if (!conversation.messages.some((message) => message.id === interruptionId)) {
        conversation.messages = [...conversation.messages, {
          id: interruptionId,
          role: 'assistant',
          kind: 'error',
          content: 'This search was interrupted when the page reloaded. Your brief is saved. Send your request again to retry.',
          timestamp: new Date(),
        }]
        conversation.lastMessage = conversation.messages[conversation.messages.length - 1].content.slice(0, 50)
      }
    }
    return [conversation.id, task]
  }))
  const current = conversations.find((conversation) => conversation.id === value.currentConversationId)
  const draftTask = restoreTask(value.draftTask)
  // A draft cannot own an in-flight request: requests always create a conversation.
  delete draftTask.request
  return {
    conversations,
    currentConversationId: current?.id || null,
    messages: current?.messages || greeting(),
    ownerEmail: typeof value.ownerEmail === 'string' ? value.ownerEmail : null,
    tasks,
    draftTask,
  }
}

const emptyChat = () => ({
  conversations: [] as Conversation[],
  currentConversationId: null,
  messages: greeting(),
  ownerEmail: null,
  ownerEpoch: uid(),
  tasks: {} as Record<string, ShoppingTask>,
  draftTask: newShoppingTask(),
})

export const useChatStore = create<ChatStore>()(persist((set, get) => ({
  ...emptyChat(),

  addMessage: (message) => {
    if (message.role === 'user' && !get().currentConversationId) get().createConversation(message.content)
    const newMessage = { ...message, timestamp: new Date() }
    set((state) => {
      const messages = [...state.messages, newMessage]
      const id = state.currentConversationId
      if (!id) return { messages }
      const task = state.tasks[id] || newShoppingTask()
      return {
        messages,
        conversations: sortConversations(state.conversations.map((conversation) => conversation.id === id
          ? { ...conversation, messages, lastMessage: message.content.slice(0, 50), timestamp: newMessage.timestamp }
          : conversation)),
        tasks: { ...state.tasks, [id]: {
          ...task,
          ...(message.role === 'user' ? { brief: deriveBrief(message.content, task.brief) } : {}),
          ...(message.role === 'assistant' && message.products ? { displayedProducts: message.products } : {}),
        } },
      }
    })
  },

  updateMessage: (id, patch) => {
    const conversationId = get().currentConversationId
    if (conversationId) get().updateMessageForConversation(conversationId, id, patch)
    else set((state) => ({ messages: state.messages.map((message) => message.id === id ? { ...message, ...patch } : message) }))
  },

  updateMessageForConversation: (conversationId, id, patch) => set((state) => {
    const conversation = state.conversations.find((item) => item.id === conversationId)
    if (!conversation || !conversation.messages.some((message) => message.id === id)) return state
    const messages = conversation.messages.map((message) => message.id === id ? { ...message, ...patch } : message)
    const latestProductReply = [...messages].reverse().find((message) => message.role === 'assistant' && message.products)
    const task = state.tasks[conversationId]
    return {
      ...(state.currentConversationId === conversationId ? { messages } : {}),
      conversations: state.conversations.map((item) => item.id === conversationId
        ? { ...item, messages, lastMessage: messages[messages.length - 1]?.content.slice(0, 50) || '' }
        : item),
      ...(patch.products && task && latestProductReply?.id === id
        ? { tasks: { ...state.tasks, [conversationId]: { ...task, displayedProducts: patch.products } } } : {}),
    }
  }),

  createConversation: (firstMessage) => set((state) => {
    const id = uid()
    const messages = greeting()
    const conversation: Conversation = {
      id, title: titleFor(firstMessage), lastMessage: firstMessage.slice(0, 50), timestamp: new Date(), messages,
    }
    const conversations = sortConversations([conversation, ...state.conversations]).slice(0, MAX_HISTORY)
    const tasks = pruneTasks(conversations, { ...state.tasks, [id]: { ...state.draftTask } })
    return { conversations, currentConversationId: id, messages, tasks, draftTask: newShoppingTask() }
  }),

  switchConversation: (id) => {
    const conversation = get().conversations.find((item) => item.id === id)
    if (conversation) set({ currentConversationId: id, messages: conversation.messages })
  },

  clearMessages: () => set({ currentConversationId: null, messages: greeting(), draftTask: newShoppingTask() }),
  resetForGuest: () => set(emptyChat()),
  setOwnerEmail: (email) => set((state) => {
    if (state.ownerEmail && state.ownerEmail !== email) return { ...emptyChat(), ownerEmail: email }
    return state.ownerEmail === email ? state : { ownerEmail: email }
  }),

  beginRequest: (query, brief) => {
    const requestId = uid()
    let identity!: RequestIdentity
    set((state) => {
      const existing = state.conversations.find((conversation) => conversation.id === state.currentConversationId)
      const conversationId = existing?.id || uid()
      const timestamp = new Date()
      const message: Message = { id: `user-${requestId}`, role: 'user', content: query, timestamp }
      const messages = [...(existing?.messages || greeting()), message]
      const conversation: Conversation = {
        id: conversationId,
        title: existing?.title || titleFor(query),
        lastMessage: query.slice(0, 50),
        timestamp,
        messages,
      }
      const conversations = sortConversations([conversation, ...state.conversations.filter((item) => item.id !== conversationId)]).slice(0, MAX_HISTORY)
      const task = existing ? state.tasks[conversationId] || newShoppingTask() : state.draftTask
      const tasks = pruneTasks(conversations, { ...state.tasks, [conversationId]: {
        ...task,
        brief,
        draft: '',
        request: { id: requestId, query, status: 'pending' },
      } })
      identity = { conversationId, requestId, ownerEpoch: state.ownerEpoch }
      return { conversations, currentConversationId: conversationId, messages, tasks, ...(existing ? {} : { draftTask: newShoppingTask() }) }
    })
    return identity
  },

  completeRequest: (identity, message, taskPatch = {}) => {
    let accepted = false
    set((state) => {
      const task = state.tasks[identity.conversationId]
      const conversation = state.conversations.find((item) => item.id === identity.conversationId)
      if (state.ownerEpoch !== identity.ownerEpoch || !conversation || !task ||
        task.request?.id !== identity.requestId || task.request.status !== 'pending') return state
      accepted = true
      const timestamp = new Date()
      const messages = [...conversation.messages, { ...message, timestamp }]
      return {
        ...(state.currentConversationId === identity.conversationId ? { messages } : {}),
        conversations: sortConversations(state.conversations.map((item) => item.id === identity.conversationId
          ? { ...item, messages, lastMessage: message.content.slice(0, 50), timestamp }
          : item)),
        tasks: { ...state.tasks, [identity.conversationId]: {
          ...task,
          ...(message.products ? { displayedProducts: message.products } : {}),
          ...taskPatch,
          // The completion owns this transition; a patch cannot leave the request pending.
          request: { ...task.request, status: message.kind === 'error' ? 'error' : 'complete' },
        } },
      }
    })
    return accepted
  },

  updateTask: (patch, conversationId) => set((state) => {
    const id = conversationId === undefined ? state.currentConversationId : conversationId
    if (id === null) return { draftTask: { ...state.draftTask, ...patch } }
    if (!state.conversations.some((conversation) => conversation.id === id) || !Object.hasOwn(state.tasks, id)) return state
    return { tasks: { ...state.tasks, [id]: { ...state.tasks[id], ...patch } } }
  }),

  toggleSaved: (product) => {
    const state = get()
    const task = state.currentConversationId ? state.tasks[state.currentConversationId] : state.draftTask
    if (!task) return
    const key = productKey(product)
    const savedProducts = task.savedProducts.some((item) => productKey(item) === key)
      ? task.savedProducts.filter((item) => productKey(item) !== key)
      : [...task.savedProducts, product]
    get().updateTask({ savedProducts })
  },
}), {
  name: STORAGE_KEY,
  version: 2,
  partialize: (state) => ({
    conversations: state.conversations,
    currentConversationId: state.currentConversationId,
    ownerEmail: state.ownerEmail,
    tasks: state.tasks,
    draftTask: state.draftTask,
  }),
  migrate: migrateChatState,
  merge: (persisted, current) => ({ ...current, ...migrateChatState(persisted), ownerEpoch: uid() }),
}))
