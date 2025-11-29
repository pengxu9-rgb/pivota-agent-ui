import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  products?: any[]
  timestamp: Date
}

interface Conversation {
  id: string
  title: string
  lastMessage: string
  timestamp: Date
  messages: Message[]
}

interface ChatStore {
  conversations: Conversation[]
  currentConversationId: string | null
  messages: Message[]
  ownerEmail: string | null
  addMessage: (message: Omit<Message, 'timestamp'>) => void
  createConversation: (firstMessage: string) => void
  switchConversation: (id: string) => void
  clearMessages: () => void
  resetForGuest: () => void
  setOwnerEmail: (email: string | null) => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      ownerEmail: null,
      messages: [
        {
          id: '0',
          role: 'assistant',
          content: "Hi! I'm your Pivota shopping assistant. What are you looking for today?",
          timestamp: new Date()
        }
      ],

      addMessage: (message) => {
        const sortConvs = (convs: Conversation[]) =>
          [...convs].sort(
            (a, b) =>
              new Date(b.timestamp as any).getTime() -
              new Date(a.timestamp as any).getTime(),
          )

        const newMessage = {
          ...message,
          timestamp: new Date()
        }
        
        set((state) => {
          const newMessages = [...state.messages, newMessage]
          
          // Update current conversation
          if (state.currentConversationId) {
            const updatedConversations = sortConvs(
              state.conversations.map(conv =>
                conv.id === state.currentConversationId
                  ? {
                      ...conv,
                      messages: newMessages,
                      lastMessage: message.content.substring(0, 50),
                      timestamp: new Date()
                    }
                  : conv
              )
            )
            return {
              messages: newMessages,
              conversations: updatedConversations
            }
          }
          
          // Create new conversation if first user message
          if (message.role === 'user' && state.messages.length === 1) {
            const newConversation: Conversation = {
              id: Date.now().toString(),
              title: message.content.substring(0, 30) + (message.content.length > 30 ? '...' : ''),
              lastMessage: message.content.substring(0, 50),
              timestamp: new Date(),
              messages: newMessages
            }
            return {
              messages: newMessages,
              conversations: sortConvs([newConversation, ...state.conversations]).slice(0, 20), // Keep only 20 recent
              currentConversationId: newConversation.id
            }
          }
          
          return { messages: newMessages }
        })
      },

      createConversation: (firstMessage) => {
        const sortConvs = (convs: Conversation[]) =>
          [...convs].sort(
            (a, b) =>
              new Date(b.timestamp as any).getTime() -
              new Date(a.timestamp as any).getTime(),
          )

        const newConversation: Conversation = {
          id: Date.now().toString(),
          title: firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : ''),
          lastMessage: firstMessage.substring(0, 50),
          timestamp: new Date(),
          messages: [
            {
              id: '0',
              role: 'assistant',
              content: "Hi! I'm your Pivota shopping assistant. What are you looking for today?",
              timestamp: new Date()
            }
          ]
        }
        
        set((state) => ({
          conversations: sortConvs([newConversation, ...state.conversations]).slice(0, 20),
          currentConversationId: newConversation.id,
          messages: newConversation.messages
        }))
      },

      switchConversation: (id) => {
        const conversation = get().conversations.find(c => c.id === id)
        if (conversation) {
          set({
            currentConversationId: id,
            messages: conversation.messages
          })
        }
      },

      clearMessages: () => {
        set({
          messages: [
            {
              id: '0',
              role: 'assistant',
              content: "Hi! I'm your Pivota shopping assistant. What are you looking for today?",
              timestamp: new Date()
            }
          ],
          currentConversationId: null
        })
      },

      resetForGuest: () => {
        set({
          conversations: [],
          currentConversationId: null,
          messages: [
            {
              id: '0',
              role: 'assistant',
              content: "Hi! I'm your Pivota shopping assistant. What are you looking for today?",
              timestamp: new Date()
            }
          ]
        })
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem('pivota-chat-storage')
          } catch (_) {
            // ignore storage errors
          }
        }
        set({ ownerEmail: null })
      },

      setOwnerEmail: (email: string | null) => set({ ownerEmail: email }),
    }),
    {
      name: 'pivota-chat-storage',
      partialize: (state) => ({ 
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        ownerEmail: state.ownerEmail,
      }),
      version: 1,
    }
  )
)
