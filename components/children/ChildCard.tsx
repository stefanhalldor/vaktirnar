import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { CustodyToggle } from './CustodyToggle'
import { ChevronRight } from 'lucide-react'

interface Child {
  id: string
  name: string
  birth_year?: number
  avatar_emoji?: string
  current_custodial_parent_id?: string
}

interface ChildCardProps {
  child: Child
  userId: string
}

export function ChildCard({ child, userId }: ChildCardProps) {
  const t = useTranslations('children')
  const isWithMe = child.current_custodial_parent_id === userId

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
      <Avatar emoji={child.avatar_emoji} name={child.name} size="md" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{child.name}</p>
        {child.birth_year && (
          <p className="text-xs text-gray-400">{child.birth_year}</p>
        )}
        <CustodyToggle childId={child.id} isWithMe={isWithMe} />
      </div>
      <Link href={`/children/${child.id}`} className="p-1 text-gray-400 hover:text-gray-600">
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
