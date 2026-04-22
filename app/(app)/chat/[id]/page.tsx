import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { ChatView } from '@/components/chat/ChatView'
import { Avatar } from '@/components/ui/Avatar'

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: chat } = await supabase
    .from('chats')
    .select(`
      *,
      child_a:children!chats_child_a_id_fkey(id, name, avatar_emoji),
      child_b:children!chats_child_b_id_fkey(id, name, avatar_emoji)
    `)
    .eq('id', id)
    .single()

  if (!chat) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', id)
    .order('created_at', { ascending: true })

  const title = `${chat.child_a?.name ?? '?'} & ${chat.child_b?.name ?? '?'}`

  return (
    <>
      <Header
        title={title}
        backHref="/"
        action={
          <div className="flex -space-x-2">
            <Avatar emoji={chat.child_a?.avatar_emoji} name={chat.child_a?.name} size="sm" />
            <Avatar emoji={chat.child_b?.avatar_emoji} name={chat.child_b?.name} size="sm" className="ring-2 ring-white" />
          </div>
        }
      />
      <ChatView
        chatId={id}
        initialMessages={messages ?? []}
        userId={user!.id}
        chatStatus={chat.status}
      />
    </>
  )
}
