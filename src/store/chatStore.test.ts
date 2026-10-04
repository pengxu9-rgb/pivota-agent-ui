import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductResponse } from '@/lib/api'
import type { ShoppingBrief } from '@/features/shopping/model'
import type { Message } from './chatStore'

type Store = typeof import('./chatStore')['useChatStore']
let store: Store
const brief: ShoppingBrief = { intent: 'moisturizer', category: 'moisturizer', fragranceFree: true, budget: { amount: 30, currency: 'USD', exclusive: true } }
const product = (id: string, extra: Partial<ProductResponse> = {}): ProductResponse => ({
  product_id: id,
  title: `Product ${id}`,
  description: 'Product description',
  price: 20,
  currency: 'USD',
  in_stock: true,
  ...extra,
})
const reply = (id: string, extra: Partial<Omit<Message, 'timestamp'>> = {}): Omit<Message, 'timestamp'> => ({
  id, role: 'assistant', content: `Reply ${id}`, ...extra,
})
async function reload() {
  vi.resetModules()
  store = (await import('./chatStore')).useChatStore
  return store.getState()
}

beforeEach(async () => {
  window.localStorage.clear()
  await reload()
})

describe('originating request ownership', () => {
  it('atomically starts a conversation, records its query, and keeps its draft and saves scoped', () => {
    const observed: ReturnType<Store['getState']>[] = []
    store.getState().updateTask({ draft: 'original draft', savedProducts: [product('saved')] })
    const stop = store.subscribe((state) => observed.push(state))
    const identity = store.getState().beginRequest('Find a moisturizer', brief)
    stop()
    expect(observed).toHaveLength(1)
    const state = store.getState()
    expect(identity).toEqual({ conversationId: state.currentConversationId, requestId: state.tasks[identity.conversationId].request?.id, ownerEpoch: state.ownerEpoch })
    expect(state.messages.map((message) => message.role)).toEqual(['assistant', 'user'])
    expect(state.messages[1].content).toBe('Find a moisturizer')
    expect(state.conversations[0].messages).toBe(state.messages)
    expect(state.tasks[identity.conversationId]).toMatchObject({ brief, draft: '', savedProducts: [product('saved')], request: { status: 'pending', query: 'Find a moisturizer' } })
    expect(state.draftTask.savedProducts).toEqual([])
    expect(state.draftTask.draft).toBe('')
  })

  it('finishes the originating task after New Chat without populating the new draft', () => {
    const request = store.getState().beginRequest('Original query', brief)
    store.getState().clearMessages()
    store.getState().updateTask({ draft: 'A new query' })
    expect(store.getState().tasks[request.conversationId].request?.status).toBe('pending')
    expect(store.getState().completeRequest(request, reply('late', { products: [product('a')] }))).toBe(true)
    const state = store.getState()
    expect(state.currentConversationId).toBeNull()
    expect(state.messages).toHaveLength(1)
    expect(state.draftTask.draft).toBe('A new query')
    expect(state.tasks[request.conversationId]).toMatchObject({ request: { status: 'complete' }, displayedProducts: [product('a')] })
    state.switchConversation(request.conversationId)
    expect(store.getState().messages.at(-1)?.id).toBe('late')
  })

  it('keeps concurrent task loading and completion independent across history switches', () => {
    const first = store.getState().beginRequest('First query', brief)
    store.getState().clearMessages()
    const second = store.getState().beginRequest('Second query', { intent: 'shoes' })
    store.getState().switchConversation(first.conversationId)
    expect(store.getState().tasks[first.conversationId].request?.status).toBe('pending')
    expect(store.getState().tasks[second.conversationId].request?.status).toBe('pending')
    expect(store.getState().completeRequest(second, reply('second-done'))).toBe(true)
    expect(store.getState().currentConversationId).toBe(first.conversationId)
    expect(store.getState().messages.some((message) => message.id === 'second-done')).toBe(false)
    expect(store.getState().tasks[first.conversationId].request?.status).toBe('pending')
    expect(store.getState().completeRequest(first, reply('first-done'))).toBe(true)
    expect(store.getState().messages.at(-1)?.id).toBe('first-done')
    store.getState().switchConversation(second.conversationId)
    expect(store.getState().messages.at(-1)?.id).toBe('second-done')
  })

  it('records an error on its originating task and allows a retry without losing the brief', () => {
    const request = store.getState().beginRequest('Find options', brief)
    expect(store.getState().completeRequest(request, reply('failed', { kind: 'error', content: 'Please retry' }))).toBe(true)
    expect(store.getState().tasks[request.conversationId].request?.status).toBe('error')
    expect(store.getState().tasks[request.conversationId].brief).toEqual(brief)
    const retry = store.getState().beginRequest('Try again', brief)
    expect(retry.conversationId).toBe(request.conversationId)
    expect(retry.requestId).not.toBe(request.requestId)
    expect(store.getState().completeRequest(request, reply('old-retry'))).toBe(false)
    expect(store.getState().completeRequest(retry, reply('retry-success'))).toBe(true)
  })

  it('rejects superseded, duplicate, and wrong-owner completions', () => {
    const first = store.getState().beginRequest('First query', brief)
    const second = store.getState().beginRequest('Newer query', { ...brief, fragranceFree: false })
    expect(first.conversationId).toBe(second.conversationId)
    expect(store.getState().completeRequest(first, reply('superseded'))).toBe(false)
    expect(store.getState().completeRequest({ ...second, ownerEpoch: 'other' }, reply('wrong-owner'))).toBe(false)
    expect(store.getState().completeRequest(second, reply('accepted'))).toBe(true)
    expect(store.getState().completeRequest(second, reply('duplicate'))).toBe(false)
    expect(store.getState().messages.filter((message) => message.role === 'assistant').map((message) => message.id)).toEqual(['0', 'accepted'])
  })

  it('does not resurrect an evicted task and prunes its associated task state', () => {
    const old = store.getState().beginRequest('Old task', brief)
    for (let index = 0; index < 21; index += 1) store.getState().createConversation(`Task ${index}`)
    expect(store.getState().conversations).toHaveLength(20)
    expect(Object.keys(store.getState().tasks)).toHaveLength(20)
    expect(store.getState().tasks[old.conversationId]).toBeUndefined()
    const before = store.getState()
    expect(before.completeRequest(old, reply('evicted'))).toBe(false)
    store.getState().updateTask({ draft: 'Do not resurrect' }, old.conversationId)
    store.getState().updateMessageForConversation(old.conversationId, '0', { content: 'Do not resurrect' })
    expect(store.getState()).toBe(before)
  })

  it('rejects completion when the conversation is gone even if an orphan task remains', () => {
    const identity = store.getState().beginRequest('Query', brief)
    store.setState({ conversations: [], currentConversationId: null, messages: [] })
    expect(store.getState().completeRequest(identity, reply('deleted'))).toBe(false)
    expect(store.getState().conversations).toEqual([])
  })
})

describe('conversation state and legacy methods', () => {
  it('routes a pagination update to its captured conversation without changing the selected one', () => {
    const first = store.getState().beginRequest('First query', brief)
    store.getState().completeRequest(first, reply('rail', {
      products: [product('a')],
      recommendation_paging: { query: 'First query', page: 1, limit: 6, hasMore: true, isLoadingMore: true },
    }))
    store.getState().clearMessages()
    const second = store.getState().beginRequest('Second query', { intent: 'shoes' })
    store.getState().updateMessageForConversation(first.conversationId, 'rail', {
      products: [product('a'), product('b')],
      recommendation_paging: { query: 'First query', page: 2, limit: 6, hasMore: false, isLoadingMore: false },
    })
    expect(store.getState().currentConversationId).toBe(second.conversationId)
    expect(store.getState().messages.some((message) => message.id === 'rail')).toBe(false)
    expect(store.getState().tasks[first.conversationId].displayedProducts).toHaveLength(2)
    store.getState().switchConversation(first.conversationId)
    expect(store.getState().messages.at(-1)?.recommendation_paging?.page).toBe(2)
  })

  it('does not let pagination on an older rail replace the current displayed products', () => {
    const first = store.getState().beginRequest('First query', brief)
    store.getState().completeRequest(first, reply('older', { products: [product('old')] }))
    const newer = store.getState().beginRequest('New query', brief)
    store.getState().completeRequest(newer, reply('newer', { products: [product('new')] }))
    store.getState().updateMessageForConversation(first.conversationId, 'older', { products: [product('old'), product('extra')] })
    expect(store.getState().tasks[first.conversationId].displayedProducts.map((item) => item.product_id)).toEqual(['new'])
  })

  it('keeps brief, draft, displayed and saved products isolated between conversations', () => {
    const first = store.getState().beginRequest('First query', brief)
    store.getState().completeRequest(first, reply('first-products', { products: [product('a')] }))
    store.getState().toggleSaved(product('a'))
    store.getState().updateTask({ draft: 'First draft' })
    store.getState().clearMessages()
    const second = store.getState().beginRequest('Shoes', { intent: 'shoes' })
    expect(store.getState().tasks[second.conversationId].savedProducts).toEqual([])
    expect(store.getState().tasks[second.conversationId].displayedProducts).toEqual([])
    store.getState().updateTask({ draft: 'Second draft' })
    store.getState().switchConversation(first.conversationId)
    expect(store.getState().tasks[first.conversationId]).toMatchObject({ brief, draft: 'First draft', displayedProducts: [product('a')], savedProducts: [product('a')] })
    store.getState().toggleSaved(product('a'))
    expect(store.getState().tasks[first.conversationId].savedProducts).toEqual([])
    expect(store.getState().tasks[second.conversationId].draft).toBe('Second draft')
  })

  it('preserves distinct variants when saving and removes the exact variant', () => {
    const a = product('p', { variant_id: 'a' })
    const b = product('p', { variant_id: 'b' })
    store.getState().toggleSaved(a)
    store.getState().toggleSaved(b)
    expect(store.getState().draftTask.savedProducts).toEqual([a, b])
    store.getState().toggleSaved(a)
    expect(store.getState().draftTask.savedProducts).toEqual([b])
  })

  it('keeps the legacy add, update, create, switch and clear methods usable', () => {
    store.getState().addMessage({ id: 'user', role: 'user', content: 'Find fragrance-free moisturizers under $30' })
    const firstId = store.getState().currentConversationId!
    expect(firstId).toBeTruthy()
    store.getState().addMessage(reply('answer', { products: [product('legacy')] }))
    store.getState().updateMessage('answer', { content: 'Updated answer' })
    expect(store.getState().conversations[0].messages.at(-1)?.content).toBe('Updated answer')
    expect(store.getState().tasks[firstId].brief.fragranceFree).toBe(true)
    store.getState().createConversation('Other conversation')
    expect(store.getState().messages).toHaveLength(1)
    expect(store.getState().currentConversationId).not.toBe(firstId)
    store.getState().switchConversation(firstId)
    expect(store.getState().messages.at(-1)?.content).toBe('Updated answer')
    store.getState().clearMessages()
    expect(store.getState().currentConversationId).toBeNull()
    expect(store.getState().conversations).toHaveLength(2)
  })
})

describe('account boundaries', () => {
  it('invalidates old completions and clears saved data on reset', () => {
    store.getState().setOwnerEmail('first@example.test')
    const old = store.getState().beginRequest('Private query', brief)
    store.getState().toggleSaved(product('private'))
    store.getState().resetForGuest()
    const state = store.getState()
    expect(state.ownerEpoch).not.toBe(old.ownerEpoch)
    expect(state.ownerEmail).toBeNull()
    expect(state.conversations).toEqual([])
    expect(state.tasks).toEqual({})
    expect(state.draftTask.savedProducts).toEqual([])
    expect(state.completeRequest(old, reply('private-response'))).toBe(false)
    expect(JSON.parse(window.localStorage.getItem('pivota-chat-storage')!).state.conversations).toEqual([])
  })

  it('adopts an initial guest task but resets on account change or logout', () => {
    const guest = store.getState().beginRequest('Guest query', brief)
    store.getState().setOwnerEmail('first@example.test')
    expect(store.getState().ownerEpoch).toBe(guest.ownerEpoch)
    expect(store.getState().conversations).toHaveLength(1)
    store.getState().setOwnerEmail('first@example.test')
    expect(store.getState().ownerEpoch).toBe(guest.ownerEpoch)
    store.getState().setOwnerEmail('second@example.test')
    expect(store.getState().ownerEpoch).not.toBe(guest.ownerEpoch)
    expect(store.getState().completeRequest(guest, reply('old-owner'))).toBe(false)
    expect(store.getState().ownerEmail).toBe('second@example.test')
    expect(store.getState().conversations).toHaveLength(0)
    const second = store.getState().beginRequest('Second private query', brief)
    store.getState().setOwnerEmail(null)
    expect(store.getState().ownerEmail).toBeNull()
    expect(store.getState().conversations).toHaveLength(0)
    expect(store.getState().completeRequest(second, reply('logged-out'))).toBe(false)
  })
})

describe('persistence and reload', () => {
  it('restores the selected conversation messages and its entire task', async () => {
    store.getState().setOwnerEmail('person@example.test')
    const first = store.getState().beginRequest('Find a moisturizer', brief)
    store.getState().completeRequest(first, reply('answer', { products: [product('a')] }))
    store.getState().toggleSaved(product('a'))
    store.getState().updateTask({ draft: 'A follow-up' })
    store.getState().createConversation('Other task')
    store.getState().switchConversation(first.conversationId)
    const restored = await reload()
    expect(restored.currentConversationId).toBe(first.conversationId)
    expect(restored.messages.at(-1)?.id).toBe('answer')
    expect(restored.messages[1].timestamp).toBeInstanceOf(Date)
    expect(restored.ownerEmail).toBe('person@example.test')
    expect(restored.tasks[first.conversationId]).toMatchObject({ brief, savedProducts: [product('a')], displayedProducts: [product('a')], draft: 'A follow-up', request: { status: 'complete' } })
    expect(restored.messages).toBe(restored.conversations.find((item) => item.id === first.conversationId)?.messages)
  })

  it('changes only reloaded pending requests to interrupted and clears pagination busy state', async () => {
    const old = store.getState().beginRequest('Find options', brief)
    store.getState().completeRequest(old, reply('rail', {
      products: [product('a')],
      recommendation_paging: { query: 'Find options', page: 1, limit: 6, hasMore: true, isLoadingMore: true },
    }))
    const pending = store.getState().beginRequest('Find more options', brief)
    store.getState().clearMessages()
    const other = store.getState().beginRequest('Other pending query', { intent: 'shoes' })
    store.getState().switchConversation(pending.conversationId)
    expect(store.getState().tasks[pending.conversationId].request?.status).toBe('pending')
    const restored = await reload()
    expect(restored.tasks[pending.conversationId].request?.status).toBe('interrupted')
    expect(restored.tasks[other.conversationId].request?.status).toBe('interrupted')
    expect(restored.tasks[pending.conversationId].brief).toEqual(brief)
    expect(restored.messages.at(-1)?.content).toMatch(/interrupted.*reloaded.*saved.*retry/i)
    expect(restored.messages.find((message) => message.id === 'rail')?.recommendation_paging?.isLoadingMore).toBe(false)
    expect(restored.completeRequest(pending, reply('abandoned'))).toBe(false)
    restored.updateTask({ draft: 'Retry now' })
    await reload()
    expect(store.getState().messages.filter((message) => message.id === `interrupted-${pending.requestId}`)).toHaveLength(1)
    const retry = store.getState().beginRequest('Retry now', brief)
    expect(store.getState().completeRequest(retry, reply('retried'))).toBe(true)
  })

  it('restores a New Chat draft without activating old history', async () => {
    const request = store.getState().beginRequest('Old query', brief)
    store.getState().completeRequest(request, reply('old'))
    store.getState().clearMessages()
    store.getState().updateTask({ draft: 'Unsent draft', brief })
    const restored = await reload()
    expect(restored.currentConversationId).toBeNull()
    expect(restored.messages).toHaveLength(1)
    expect(restored.conversations).toHaveLength(1)
    expect(restored.draftTask).toMatchObject({ draft: 'Unsent draft', brief })
  })

  it('migrates version 1 history to a semantic brief and last product-bearing reply', async () => {
    const messages = [
      { id: '1', role: 'user', content: 'Find fragrance-free moisturizers under $30', timestamp: '2026-10-01T10:00:00Z' },
      { id: '2', role: 'assistant', content: 'First options', products: [product('old')], timestamp: '2026-10-01T10:01:00Z' },
      { id: '3', role: 'user', content: 'Compare the first two', timestamp: '2026-10-01T10:02:00Z' },
      { id: '4', role: 'assistant', content: 'Latest options', products: [product('latest')], recommendation_paging: { query: 'query', page: 1, limit: 6, hasMore: true, isLoadingMore: true }, timestamp: '2026-10-01T10:03:00Z' },
    ]
    window.localStorage.setItem('pivota-chat-storage', JSON.stringify({ version: 1, state: {
      ownerEmail: 'legacy@example.test', currentConversationId: 'legacy',
      conversations: [{ id: 'legacy', title: 'Old title', timestamp: '2026-10-01T10:03:00Z', lastMessage: 'Latest options', messages }],
    } }))
    const restored = await reload()
    expect(restored.currentConversationId).toBe('legacy')
    expect(restored.messages).toHaveLength(4)
    expect(restored.messages[3].recommendation_paging?.isLoadingMore).toBe(false)
    expect(restored.tasks.legacy.brief).toMatchObject({ category: 'moisturizers', fragranceFree: true, budget: { amount: 30, currency: 'USD', exclusive: true }, requestedCount: 2 })
    expect(restored.tasks.legacy.brief.intent).not.toMatch(/compare/i)
    expect(restored.tasks.legacy.displayedProducts).toEqual([product('latest')])
    expect(restored.tasks.legacy.savedProducts).toEqual([])
    expect(restored.tasks.legacy.request).toBeUndefined()
  })

  it('ignores malformed history, duplicate IDs, orphan tasks and invalid selection', async () => {
    window.localStorage.setItem('pivota-chat-storage', JSON.stringify({ version: 2, state: {
      currentConversationId: 'missing', conversations: [null, { id: 'kept', messages: [null, { id: 'bad', role: 'unknown', content: 7 }] }, { id: 'kept', messages: [] }],
      tasks: { orphan: { request: { id: 'bad', status: 'pending', query: 'orphan' } } },
    } }))
    const restored = await reload()
    expect(restored.currentConversationId).toBeNull()
    expect(restored.messages).toHaveLength(1)
    expect(restored.conversations).toHaveLength(1)
    expect(Object.keys(restored.tasks)).toEqual(['kept'])
    expect(restored.conversations[0].timestamp).toBeInstanceOf(Date)
  })
})

describe('decision persistence', () => {
  it('restores a comparison report and keeps its completed request from being interrupted', async () => {
    const request = store.getState().beginRequest('Compare the first two', brief)
    const decision = {
      summary: 'Compare verified evidence', compared: true,
      items: [{ product: product('a'), fragrance: 'unverified' as const, ingredientEvidence: 'Ingredients not available', sources: [{ label: 'Retailer', url: 'https://example.test/a', observedAt: '2026-10-01', stale: true }], size: '50 ml', price: '$20', retailer: 'Retailer', alternatives: ['Try another size'], tradeoffs: ['Limited evidence'], missing: ['Ingredients'] }],
    }
    store.getState().completeRequest(request, reply('comparison', { kind: 'comparison', decision }))
    await reload()
    expect(store.getState().messages.at(-1)?.decision).toEqual(decision)
    expect(store.getState().messages.at(-1)?.kind).toBe('comparison')
    expect(store.getState().tasks[request.conversationId].request?.status).toBe('complete')
  })

  it('drops malformed reports and normalizes missing comparison lists instead of crashing on reload', async () => {
    window.localStorage.setItem('pivota-chat-storage', JSON.stringify({ version: 2, state: {
      currentConversationId: 'legacy', conversations: [{ id: 'legacy', messages: [
        { id: 'invalid', role: 'assistant', content: 'Invalid report', decision: { items: 'bad' } },
        { id: 'partial', role: 'assistant', content: 'Partial report', decision: { summary: 'Some evidence', items: [null, { product: product('a'), sources: [null, { label: 'Missing URL' }] }] } },
      ] }],
    } }))
    const restored = await reload()
    expect(restored.messages[0].decision).toBeUndefined()
    expect(restored.messages[1].decision?.items).toHaveLength(1)
    expect(restored.messages[1].decision?.items[0]).toMatchObject({ fragrance: 'unverified', alternatives: [], tradeoffs: [], missing: [], sources: [] })
  })
})
