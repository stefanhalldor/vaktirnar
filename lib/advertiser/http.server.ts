import 'server-only'

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 | 415 }

export async function readBoundedAdvertiserJson(
  request: Request,
  maxBytes: number,
): Promise<BoundedJsonResult> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/json')) return { ok: false, status: 415 }

  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, status: 413 }
  if (!request.body) return { ok: false, status: 400 }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        return { ok: false, status: 413 }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400 }
  }
}
