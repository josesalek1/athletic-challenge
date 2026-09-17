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
    token: string
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
  if (action === 'recovery') return 'Recover your Athletic Challenge access'
  if (action === 'invite' || action === 'signup') return 'Your Athletic Challenge access link'
  return 'Your Athletic Challenge access link'
}

function copyFor(action: EmailAction) {
  if (action === 'recovery') return 'Tap the button to recover your access.'
  if (action === 'invite' || action === 'signup') return 'Tap the button to sign in. No password is required.'
  if (action === 'magiclink') return 'Open the link to sign in to your browser, or enter the code in the installed app.'
  return 'Tap the button to sign in. No password is required.'
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
    // El enlace de acceso verifica el hash en la web, sin depender del PKCE
    // almacenado en el navegador que pidió el correo.
    const isMagicLink = emailData.email_action_type === 'magiclink'
    const verificationUrl = isMagicLink
      ? new URL('/auth/confirm', emailData.redirect_to)
      : new URL('/auth/v1/verify', supabaseUrl)
    verificationUrl.searchParams.set(isMagicLink ? 'token_hash' : 'token', emailData.token_hash)
    if (!isMagicLink) {
      verificationUrl.searchParams.set('type', emailData.email_action_type)
      verificationUrl.searchParams.set('redirect_to', emailData.redirect_to)
    }

    const safeUrl = escapeHtml(verificationUrl.toString())
    const safeCopy = escapeHtml(copyFor(emailData.email_action_type))
    const safeCode = escapeHtml(emailData.token)

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
          <html lang="en">
            <body style="margin:0;background:#082f35;font-family:Arial,sans-serif;color:#eff9f7">
              <div style="max-width:560px;margin:0 auto;padding:48px 24px">
                <p style="margin:0 0 12px;color:#82b8ba;font-size:13px;letter-spacing:2px;text-transform:uppercase">
                  Athletic Challenge
                </p>
                <h1 style="margin:0 0 16px;font-size:32px;line-height:1.1">Your access is ready</h1>
                <p style="margin:0 0 28px;color:#b8d1d1;font-size:17px;line-height:1.6">${safeCopy}</p>
                <p style="margin:0 0 28px;color:#b8d1d1;font-size:15px;line-height:1.6">
                  Open this email on the device where you will use the app. Confirm the link in your browser, or enter the code in the installed app.
                </p>
                <a href="${safeUrl}" style="display:inline-block;background:#37b8c8;color:#062f35;text-decoration:none;font-weight:700;padding:15px 22px;border-radius:10px">
                  Open Athletic Challenge
                </a>
                ${isMagicLink ? `<p style="margin:28px 0 0;color:#b8d1d1;font-size:15px;line-height:1.6">Using the installed app? Enter this code on its sign-in screen: <strong style="color:#eff9f7;font-size:24px;letter-spacing:4px">${safeCode}</strong></p>` : ''}
                <p style="margin:28px 0 0;color:#82a6a8;font-size:13px;line-height:1.5">
                  This personal link expires and can only be used once. If you did not expect it, you can ignore this email.
                </p>
              </div>
            </body>
          </html>
        `,
        textContent: `${copyFor(emailData.email_action_type)}\n\nOpen the link in your browser and confirm sign-in:\n${verificationUrl.toString()}${isMagicLink ? `\n\nUsing the installed app? Enter this code on its sign-in screen: ${emailData.token}` : ''}\n\nThis ${isMagicLink ? 'link and code expire' : 'link expires'} and can only be used once.`,
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
