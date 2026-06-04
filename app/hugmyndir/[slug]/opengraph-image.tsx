import { ImageResponse } from 'next/og'
import { getAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const alt = 'Teskeið'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { slug: string } }) {
  const { data } = await getAdmin()
    .from('ideas')
    .select('title, short_description')
    .eq('slug', params.slug)
    .eq('is_public', true)
    .single()

  const title = data?.title ?? 'Hugmynd'
  const description = data?.short_description ?? ''

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#fbf9f4',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: '80px',
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          color: '#2d5a27',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: 24,
        }}
      >
        Teskeið.is
      </div>
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          color: '#154212',
          letterSpacing: '-0.02em',
          textAlign: 'center',
          lineHeight: 1.2,
          marginBottom: 28,
          maxWidth: 900,
        }}
      >
        {title}
      </div>
      {description && (
        <div
          style={{
            fontSize: 28,
            color: '#42493e',
            textAlign: 'center',
            maxWidth: 800,
            lineHeight: 1.5,
          }}
        >
          {description.length > 120 ? description.slice(0, 120) + '…' : description}
        </div>
      )}
    </div>,
    size,
  )
}
