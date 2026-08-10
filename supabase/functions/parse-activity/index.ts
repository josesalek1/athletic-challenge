import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CATEGORIES = [
  'yogic',
  'calisthenics',
  'strength',
  'hiit',
  'cardio',
  'mobility',
  'swimming',
  'running',
  'recovery',
  'mindfulness',
  'traditional',
  'other',
]

function requireSecret(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function responseText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : []
  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
      return String((part as { text?: string }).text ?? '')
    }
  }
  return ''
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: CORS_HEADERS })

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) {
      return Response.json({ error: 'Authentication required' }, { status: 401, headers: CORS_HEADERS })
    }

    const supabase = createClient(
      requireSecret('SUPABASE_URL'),
      requireSecret('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const token = authorization.slice('Bearer '.length)
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData.user) {
      return Response.json({ error: 'Invalid session' }, { status: 401, headers: CORS_HEADERS })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single()
    if (!profile?.active || profile.role !== 'admin') {
      return Response.json({ error: 'Administrator access required' }, { status: 403, headers: CORS_HEADERS })
    }

    const body = await request.json().catch(() => ({})) as { prompt?: unknown }
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 1000) : ''
    if (prompt.length < 8) {
      return Response.json({ error: 'A more detailed activity description is required' }, { status: 400, headers: CORS_HEADERS })
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': requireSecret('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1000,
        thinking: { type: 'disabled' },
        system: [
          'Convert the administrator description into one fitness activity.',
          'Preserve the language used by the administrator for name and description.',
          'Timed targets must always be returned in seconds.',
          'Use done for simple yes/no completion, reps for counts, timed for duration, and checklist for a list of selectable practices.',
          'For checklist activities, checklist_items contains the item names. Otherwise it is empty.',
          'Choose exactly one allowed category. Never invent facts that were not implied by the description.',
        ].join(' '),
        messages: [{ role: 'user', content: prompt }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                kind: { type: 'string', enum: ['timed', 'reps', 'checklist', 'done'] },
                category: { type: 'string', enum: CATEGORIES },
                target: { type: 'integer', minimum: 1, maximum: 10000 },
                description: { type: 'string' },
                checklist_items: { type: 'array', items: { type: 'string' }, maxItems: 12 },
              },
              required: ['name', 'kind', 'category', 'target', 'description', 'checklist_items'],
            },
          },
        },
      }),
    })

    if (!claudeResponse.ok) {
      const detail = await claudeResponse.text()
      console.error('Claude activity parser failed', claudeResponse.status, detail)
      return Response.json({ error: 'AI assistance is temporarily unavailable' }, { status: 502, headers: CORS_HEADERS })
    }
    const claudePayload = await claudeResponse.json() as Record<string, unknown>
    if (claudePayload.stop_reason === 'refusal' || claudePayload.stop_reason === 'max_tokens') {
      throw new Error(`Claude stopped with reason ${claudePayload.stop_reason}`)
    }
    const text = responseText(claudePayload)
    if (!text) throw new Error('Claude returned no activity draft')

    return Response.json({ activity: JSON.parse(text) }, { headers: CORS_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Activity parser failed', message)
    return Response.json({ error: 'Activity draft could not be generated' }, { status: 500, headers: CORS_HEADERS })
  }
})
