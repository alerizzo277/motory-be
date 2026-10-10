export interface DeletedVehicleInformation {
  brand: string;
  model: string;
  licensePlate: string;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
export function vehicleDeletionEmail(vehicle: DeletedVehicleInformation, retentionDays: number) {
  const name = escapeHtml(`${vehicle.brand} ${vehicle.model} (${vehicle.licensePlate})`);
  return `<!doctype html><html lang="it"><body style="margin:0;background:#F8FAFC;font-family:Arial,sans-serif;color:#0F172A"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border:1px solid #E2E8F0" cellpadding="32"><tr><td><p style="color:#2563EB;font-size:24px;font-weight:bold">Motory</p><h1 style="font-size:24px">Veicolo rimosso dal tuo garage</h1><p style="line-height:1.6;color:#64748B">Il veicolo ${name} &egrave; stato rimosso dal tuo garage Motory. Il veicolo e gli interventi associati non sono pi&ugrave; accessibili dall'applicazione.</p><p style="line-height:1.6;color:#64748B">La cronologia degli interventi &egrave; stata preservata temporaneamente. Il periodo di conservazione previsto dalla configurazione attuale &egrave; di ${retentionDays} giorni. Questo periodo &egrave; indicativo e non comporta una cancellazione automatica a una data prestabilita.</p><p style="line-height:1.6;color:#64748B">La funzionalit&agrave; di recupero dei veicoli dalle impostazioni dell'account &egrave; prevista per il futuro e non &egrave; ancora disponibile.</p><p style="font-size:12px;color:#64748B;border-top:1px solid #E2E8F0;padding-top:20px">Motory &mdash; Your car&#39;s story</p></td></tr></table></td></tr></table></body></html>`;
}
