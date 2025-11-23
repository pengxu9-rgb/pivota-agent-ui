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
  addMessage: (message: Omit<Message, 'timestamp'>) => void
  createConversation: (firstMessage: string) => void
  switchConversation: (id: string) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      messages: [
        {
          id: '0',
          role: 'assistant',
          content: "Hi! I'm your Pivota shopping assistant. What are you looking for today?",
          timestamp: new Date()
        }
      ],

      addMessage: (message) => {
        const newMessage = {
          ...message,
          timestamp: new Date()
        }
        
        set((state) => {
          const newMessages = [...state.messages, newMessage]
          
          // Update current conversation
          if (state.currentConversationId) {
            const updatedConversations = state.conversations.map(conv =>
              conv.id === state.currentConversationId
                ? {
                    ...conv,
                    messages: newMessages,
                    lastMessage: message.content.substring(0, 50),
                    timestamp: new Date()
                  }
                : conv
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
              conversations: [newConversation, ...state.conversations].slice(0, 20), // Keep only 20 recent
              currentConversationId: newConversation.id
            }
          }
          
          return { messages: newMessages }
        })
      },

      createConversation: (firstMessage) => {
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
          conversations: [newConversation, ...state.conversations].slice(0, 20),
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
      }
    }),
    {
      name: 'pivota-chat-storage',
      partialize: (state) => ({ 
        conversations: state.conversations,
        currentConversationId: state.currentConversationId
      }),
      version: 1,
    }
  )
)

