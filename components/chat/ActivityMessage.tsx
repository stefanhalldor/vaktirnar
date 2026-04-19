import { useTranslations } from 'next-intl'

interface ActivityMessageProps {
  message: {
    id: string
    content: string
    type: string
    activity_category?: string
    activity_minutes?: number
    created_at: string
  }
}

const categoryEmoji: Record<string, string> = {
  screen: '📱',
  physical: '⚽',
  other: '🎨',
}

export function ActivityMessage({ message }: ActivityMessageProps) {
  const t = useTranslations('activity')

  const emoji = message.activity_category ? categoryEmoji[message.activity_category] ?? '🎯' : '📋'
  const time = new Date(message.created_at).toLocaleTimeString('is-IS', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-2 rounded-full bg-violet-50 border border-violet-100 px-4 py-1.5 text-xs text-violet-700">
        <span>{emoji}</span>
        <span>{message.content}</span>
        {message.activity_minutes && (
          <span className="text-violet-400">· {message.activity_minutes} {t('minutes').toLowerCase()}</span>
        )}
        <span className="text-violet-300">· {time}</span>
      </div>
    </div>
  )
}
