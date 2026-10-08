const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export function actionEmail(
  title: string,
  text: string,
  button: string,
  url: string,
  minutes: number,
  reset = false,
) {
  const duration =
    !reset && minutes % 60 === 0
      ? `${minutes / 60} ${minutes === 60 ? 'ora' : 'ore'}`
      : `${minutes} minuti`;
  return `<!doctype html><html lang="it"><body style="margin:0;background:#F8FAFC;font-family:Arial,sans-serif;color:#0F172A"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border:1px solid #E2E8F0" cellpadding="32"><tr><td><p style="color:#2563EB;font-size:24px;font-weight:bold">Motory</p><h1 style="font-size:24px">${title}</h1><p style="line-height:1.6;color:#64748B">${text}</p><p style="padding:16px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;background:#2563EB;color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:bold">${button}</a></p><p style="color:#64748B">Il link scade tra ${duration}.</p>${reset ? '<p style="color:#64748B">Se non hai richiesto questa operazione, puoi ignorare questa email.</p>' : ''}<p style="font-size:12px;color:#64748B;border-top:1px solid #E2E8F0;padding-top:20px">Motory — Your car&#39;s story</p></td></tr></table></td></tr></table></body></html>`;
}
