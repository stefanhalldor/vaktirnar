import { clsx } from 'clsx'

interface AvatarProps {
  emoji?: string
  name?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ emoji, name, size = 'md', className }: AvatarProps) {
  const initial = name?.[0]?.toUpperCase() ?? '?'

  return (
    <div
      className={clsx(
        'flex items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700 select-none',
        {
          'h-8 w-8 text-sm': size === 'sm',
          'h-10 w-10 text-base': size === 'md',
          'h-14 w-14 text-2xl': size === 'lg',
        },
        className
      )}
    >
      {emoji ?? initial}
    </div>
  )
}
