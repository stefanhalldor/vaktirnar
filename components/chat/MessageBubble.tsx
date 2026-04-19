import { ActivityMessage } from './ActivityMessage'

interface Message {
  id: string
  content: string
  type: 'text' | 'activity' | 'system'
  sender_id: string
  created_at: string
  activity_category?: string
  activity_minutes?: number
  activity_child_ids?: string[]
}

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  if (message.type === 'activity' || message.type === 'system') {
    return <ActivityMessage message={message} />
  }

  const time = new Date(message.created_at).toLocaleTimeString('is-IS', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isOwn
            ? 'rounded-br-sm bg-violet-600 text-white'
            : 'rounded-bl-sm bg-white text-gray-900 border border-gray-100 shadow-sm'
        }`}
      >
        <p className="text-sm">{message.content}</p>
        <p className={`mt-1 text-xs ${isOwn ? 'text-violet-200' : 'text-gray-400'}`}>{time}</p>
      </div>
    </div>
  )
}
