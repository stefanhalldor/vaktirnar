import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import type { DeterministicResult, AiResult } from './types'

const UNSAFE_WORDS = [
  'öruggt', 'tryggt', 'engin hætta', 'engin haetta',
  'þú mátt alveg', 'thu matt alveg', 'safe',
]

function containsUnsafeWording(text: string): boolean {
  const lower = text.toLowerCase()
  return UNSAFE_WORDS.some((w) => lower.includes(w))
}

function contradictsDeterministic(aiSvar: string, det: DeterministicResult): boolean {
  if (det.stada !== 'rautt') return false
  const lower = aiSvar.toLowerCase()
  const positivePatterns = ['já, þetta', 'frábært', 'fullkomið', 'alveg í lagi']
  return positivePatterns.some((p) => lower.includes(p))
}

export async function getAiAnswer(
  question: string,
  deterministic: DeterministicResult,
  nowIso: string,
): Promise<AiResult | null> {
  if (process.env.WEATHER_AI_ENABLED !== 'true') return null
  if (!process.env.ANTHROPIC_API_KEY) return null

  const model = process.env.WEATHER_AGENT_MODEL ?? 'claude-haiku-4-5-20251001'

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const systemPrompt = `Þú ert Veðrid, veðurráðgjafi Teskeiðar. Þú gefur eitt stutt, gagnlegt, aðgerðamiðað svar á íslensku.

Reglur:
- Aldrei nota: "öruggt", "tryggt", "engin hætta", "þú mátt alveg", "safe".
- Nota varúðarmál þegar við á: "ekki mælt með", "bíddu frekar", "farðu varlega".
- Veðurverkfærið er eina heimild þín fyrir tölur og stöðu. Uppfindu ekki.
- Ef staða er "rautt" verður svarið neikvætt.
- 1–3 setningar. Núverandi tími: ${nowIso}`

    const userMessage = `Spurning: ${question}

Niðurstaða veðurverkfæris:
- Staða: ${deterministic.stada}
- Svar: ${deterministic.svar}${deterministic.suggestedAction ? `\n- Aðgerð: ${deterministic.suggestedAction}` : ''}${deterministic.facts ? `\n- Gögn: ${deterministic.facts.join(', ')}` : ''}

Settu þessa niðurstöðu með eigin orðum. Þú VERÐUR að kalla á format_weather_answer og nota toolResultId: "${deterministic.id}".`

    const response = await client.messages.create({
      model,
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools: [
        {
          name: 'format_weather_answer',
          description: 'Format the final answer for the user',
          input_schema: {
            type: 'object' as const,
            properties: {
              svar: { type: 'string', description: 'Main answer in Icelandic, 1–3 sentences' },
              adgerd: { type: 'string', description: 'Optional action suggestion' },
              toolResultId: { type: 'string', description: 'Must equal the deterministic result ID' },
            },
            required: ['svar', 'toolResultId'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'format_weather_answer' },
    })

    const toolUse = response.content.find(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use' && c.name === 'format_weather_answer',
    )
    if (!toolUse) return null

    const input = toolUse.input as { svar?: string; adgerd?: string; toolResultId?: string }
    if (!input.svar || !input.toolResultId) return null

    if (input.toolResultId !== deterministic.id) {
      console.warn('[weather/ai] toolResultId mismatch')
      return null
    }

    if (containsUnsafeWording(input.svar)) {
      console.warn('[weather/ai] unsafe wording detected')
      return null
    }

    if (contradictsDeterministic(input.svar, deterministic)) {
      console.warn('[weather/ai] contradicts deterministic result')
      return null
    }

    return {
      svar: input.svar,
      adgerd: input.adgerd,
      toolResultId: input.toolResultId,
    }
  } catch (err) {
    console.error('[weather/ai] failed', err)
    return null
  }
}
