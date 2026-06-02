import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdmin } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/teskeid/admin-auth'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug má bara innihalda a-z, 0-9 og -').min(1).max(200),
  short_description: z.string().min(1).max(500).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (auth.error) return auth.error

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
  }

  const { title, slug, short_description } = parsed.data

  // Read submission with service role
  const { data: sub, error: subError } = await getAdmin()
    .from('submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (subError || !sub) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  // Guard: prevent duplicate idea creation
  if (sub.idea_id) {
    return NextResponse.json({ error: 'already_linked', idea_id: sub.idea_id }, { status: 409 })
  }

  // Create idea
  const { data: idea, error: ideaError } = await getAdmin()
    .from('ideas')
    .insert({
      title,
      slug,
      short_description: short_description ?? title,
      problem_description: sub.problem_description,
      possible_solution: sub.dream_solution ?? null,
      category: sub.category ?? 'Annað',
      status: 'idea',
      source: 'user-submitted',
      is_public: true,
      is_featured: false,
    })
    .select()
    .single()

  if (ideaError) {
    console.error('[create-idea] insert error:', ideaError.message, ideaError.code)
    if (ideaError.code === '23505') {
      return NextResponse.json({ error: 'duplicate_slug' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  // Mark submission as approved and link to idea
  const { data: updatedSub } = await getAdmin()
    .from('submissions')
    .update({ status: 'approved', idea_id: idea.id })
    .eq('id', id)
    .select()
    .single()

  return NextResponse.json({ idea, submission: updatedSub, submission_id: id })
}
