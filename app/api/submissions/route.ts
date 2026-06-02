import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { submissionSchema } from '@/lib/teskeid/validation'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const parsed = submissionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { website, ...data } = parsed.data

  // Honeypot check — reject silently if filled
  if (website) {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('submissions').insert({
    problem_description: data.problem_description,
    current_solution: data.current_solution ?? null,
    dream_solution: data.dream_solution ?? null,
    category: data.category ?? null,
    allow_publication: data.allow_publication,
    name: data.name ?? null,
    email: data.email ?? null,
    status: 'pending',
  })

  if (error) {
    return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
