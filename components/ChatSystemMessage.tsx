'use client'

interface ChatSystemMessageProps {
  children: React.ReactNode
}

export function ChatSystemMessage({ children }: ChatSystemMessageProps) {
  return (
    <div className="flex items-center gap-3 my-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 text-center flex-shrink-0">{children}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  )
}
