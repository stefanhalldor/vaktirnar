import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ContactCard } from '@/components/contacts/ContactCard'
import { InviteCodeEntry } from '@/components/contacts/InviteCodeEntry'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { UserPlus } from 'lucide-react'

export default async function ContactsPage() {
  const t = await getTranslations('contacts')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get contacts (accepted + pending)
  const { data: contacts } = await supabase
    .from('contacts')
    .select(`
      *,
      child_a:children!contacts_child_a_id_fkey(id, name, avatar_emoji),
      child_b:children!contacts_child_b_id_fkey(id, name, avatar_emoji)
    `)
    .neq('status', 'blocked')
    .order('created_at', { ascending: false })

  return (
    <>
      <Header title={t('title')} />
      <div className="p-4 flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('enterCode')}</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteCodeEntry />
          </CardContent>
        </Card>

        {(contacts?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-gray-500">
            <UserPlus className="h-12 w-12 text-gray-200" />
            <p className="text-sm">{t('noContacts')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {contacts!.map((c) => (
              <ContactCard key={c.id} contact={c as any} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
