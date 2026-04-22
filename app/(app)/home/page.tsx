import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ChatList } from '@/components/chat/ChatList'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export default async function HomePage() {
  const t = await getTranslations()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get active chats where user's children are involved
  const { data: chats } = await supabase
    .from('chats')
    .select(`
      *,
      child_a:children!chats_child_a_id_fkey(id, name, avatar_emoji),
      child_b:children!chats_child_b_id_fkey(id, name, avatar_emoji),
      messages(content, created_at, type)
    `)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  return (
    <>
      <Header
        title={t('app.name')}
        action={
          <Link href="/chat/new">
            <Button size="sm" variant="primary">
              <Plus className="h-4 w-4 mr-1" />
              {t('chat.newChat')}
            </Button>
          </Link>
        }
      />
      <div className="p-4">
        <ChatList chats={chats ?? []} userId={user?.id ?? ''} />
      </div>
    </>
  )
}
