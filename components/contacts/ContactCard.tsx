import { useTranslations } from 'next-intl'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

interface Contact {
  id: string
  status: 'pending' | 'accepted' | 'blocked'
  child_a: { name: string; avatar_emoji?: string }
  child_b: { name: string; avatar_emoji?: string }
}

interface ContactCardProps {
  contact: Contact
}

export function ContactCard({ contact }: ContactCardProps) {
  const t = useTranslations('contacts')

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
      <div className="flex -space-x-2">
        <Avatar emoji={contact.child_a?.avatar_emoji} name={contact.child_a?.name} size="sm" />
        <Avatar emoji={contact.child_b?.avatar_emoji} name={contact.child_b?.name} size="sm" className="ring-2 ring-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">
          {contact.child_a?.name} & {contact.child_b?.name}
        </p>
      </div>
      <Badge variant={contact.status === 'accepted' ? 'success' : 'warning'}>
        {contact.status === 'accepted' ? t('connected') : t('pending')}
      </Badge>
    </div>
  )
}
