import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

type EmailAction =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'reauthentication'

type HookPayload = {
  user: {
    email: string
  }
  email_data: {
    token_hash: string
    redirect_to: string
    email_action_type: EmailAction
  }
}

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const SENDER_EMAIL = 'jose.salek1@gmail.com'
const SENDER_NAME = 'Athletic Challenge'

function requireSecret(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function subjectFor(action: EmailAction) {
  if (action === 'recovery') return 'Recupera tu acceso a Athletic Challenge'
  if (action === 'invite') return 'Tu invitación a Athletic Challenge'
  return 'Tu enlace para Athletic Challenge'
}

function copyFor(action: EmailAction) {
  if (action === 'recovery') return 'Pulsa el botón para recuperar tu acceso.'
  if (action === 'invite') return 'Pulsa el botón para aceptar la invitación.'
  return 'Pulsa el botón para entrar. No necesitas contraseña.'
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const rawPayload = await request.text()
    const hookSecret = requireSecret('SEND_EMAIL_HOOK_SECRET').replace('v1,whsec_', '')
    const webhook = new Webhook(hookSecret)
    const { user, email_data: emailData } = webhook.verify(
      rawPayload,
      Object.fromEntries(request.headers),
    ) as HookPayload

    const supabaseUrl = requireSecret('SUPABASE_URL')
    const brevoApiKey = requireSecret('BREVO_API_KEY')
    const verificationUrl = new URL('/auth/v1/verify', supabaseUrl)
    verificationUrl.searchParams.set('token', emailData.token_hash)
    verificationUrl.searchParams.set('type', emailData.email_action_type)
    verificationUrl.searchParams.set('redirect_to', emailData.redirect_to)

    const safeUrl = escapeHtml(verificationUrl.toString())
    const safeCopy = escapeHtml(copyFor(emailData.email_action_type))

    const brevoResponse = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: SENDER_NAME, email: SENDER_EMAIL },
        to: [{ email: user.email }],
        subject: subjectFor(emailData.email_action_type),
        htmlContent: `
          <!doctype html>
          <html lang="es">
            <body style="margin:0;background:#082f35;font-family:Arial,sans-serif;color:#eff9f7">
              <div style="max-width:560px;margin:0 auto;padding:48px 24px">
                <p style="margin:0 0 12px;color:#82b8ba;font-size:13px;letter-spacing:2px;text-transform:uppercase">
                  Athletic Challenge
                </p>
                <h1 style="margin:0 0 16px;font-size:32px;line-height:1.1">Tu acceso está listo</h1>
                <p style="margin:0 0 28px;color:#b8d1d1;font-size:17px;line-height:1.6">${safeCopy}</p>
                <a href="${safeUrl}" style="display:inline-block;background:#37b8c8;color:#062f35;text-decoration:none;font-weight:700;padding:15px 22px;border-radius:10px">
                  Entrar a Athletic Challenge
                </a>
                <p style="margin:28px 0 0;color:#82a6a8;font-size:13px;line-height:1.5">
                  Este enlace es personal y caduca. Si no lo solicitaste, puedes ignorar este mensaje.
                </p>
              </div>
            </body>
          </html>
        `,
        textContent: `${copyFor(emailData.email_action_type)}\n\n${verificationUrl.toString()}\n\nEste enlace es personal y caduca.`,
        tags: ['supabase-auth', emailData.email_action_type],
      }),
    })

    if (!brevoResponse.ok) {
      const detail = await brevoResponse.text()
      console.error('Brevo rejected the email request', brevoResponse.status, detail)
      throw new Error(`Brevo request failed with status ${brevoResponse.status}`)
    }

    return Response.json({})
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Send email hook failed', message)
    return Response.json(
      { error: { http_code: 500, message } },
      { status: 500 },
    )
  }
})
