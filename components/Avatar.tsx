'use client'

type AvatarColor = 'amber' | 'blue' | 'green' | 'danger' | 'gray' | 'violet'
type AvatarSize = 'sm' | 'md' | 'lg'

interface AvatarProps {
  initial: string
  color?: AvatarColor
  size?: AvatarSize
}

const colorStyles: Record<AvatarColor, string> = {
  amber:  'bg-amber-100 text-amber-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  danger: 'bg-red-100 text-red-700',
  gray:   'bg-gray-100 text-gray-500',
  violet: 'bg-violet-100 text-violet-700',
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-[72px] h-[72px] text-2xl',
}

export function Avatar({ initial, color = 'gray', size = 'md' }: AvatarProps) {
  return (
    <div className={`rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${colorStyles[color]} ${sizeStyles[size]}`}>
      {initial.toUpperCase()}
    </div>
  )
}
