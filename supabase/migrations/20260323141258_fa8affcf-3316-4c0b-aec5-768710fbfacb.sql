UPDATE offer_templates SET body_template = '<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:''DM Sans'',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:40px 48px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">La nostra proposta per Lei</h1>
<p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Soggiorno dal {{check_in}} al {{check_out}}</p>
</td></tr>
<!-- Body -->
<tr><td style="padding:36px 48px;">
<p style="font-size:16px;color:#1e293b;line-height:1.6;margin:0 0 20px;">Gentile <strong>{{nome}} {{cognome}}</strong>,</p>
<p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 24px;">La ringraziamo per il Suo interesse. Siamo lieti di proporLe le seguenti soluzioni per il Suo soggiorno:</p>

<!-- Camere -->
{{camere}}

<!-- Prezzo totale -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;background:#f0f7ff;border-radius:12px;border:1px solid #dbeafe;">
<tr><td style="padding:20px 24px;text-align:center;">
<p style="margin:0 0 4px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Totale Soggiorno</p>
<p style="margin:0;font-size:32px;font-weight:800;color:#1e3a5f;">{{prezzo}}</p>
</td></tr>
</table>

<p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 24px;">La tariffa include prima colazione a buffet, Wi-Fi, accesso all''area benessere e parcheggio gratuito.</p>

<!-- CTA -->
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:8px 0 24px;">
<a href="mailto:{{email_hotel}}" style="display:inline-block;background:linear-gradient(135deg,#2563eb 0%,#1e3a5f 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px;">Conferma Soggiorno</a>
</td></tr>
</table>

<p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 8px;">Rimaniamo a disposizione per qualsiasi chiarimento.</p>
<p style="font-size:14px;color:#475569;line-height:1.6;margin:0;">Cordiali saluti,<br><strong>Lo Staff</strong></p>
</td></tr>
<!-- Footer -->
<tr><td style="background-color:#f8fafc;padding:24px 48px;border-top:1px solid #e2e8f0;text-align:center;">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">Questa email è stata generata automaticamente.<br>Per informazioni contattaci direttamente.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE id = '354ff030-6451-4b19-abb6-53cde762ec96';

UPDATE offer_templates SET body_template = '<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:''DM Sans'',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:32px 48px;text-align:center;">
<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Grazie per averci contattato</h1>
</td></tr>
<!-- Body -->
<tr><td style="padding:36px 48px;">
<p style="font-size:16px;color:#1e293b;line-height:1.6;margin:0 0 20px;">Gentile <strong>{{nome}} {{cognome}}</strong>,</p>
<p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 16px;">La ringraziamo per il Suo messaggio. Abbiamo preso in carico la Sua richiesta e provvederemo a risponderLe nel più breve tempo possibile.</p>
<p style="font-size:15px;color:#475569;line-height:1.7;margin:0 0 24px;">Nel frattempo, se avesse bisogno di ulteriori informazioni, non esiti a contattarci.</p>

<!-- Info box -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#f0f7ff;border-radius:12px;border-left:4px solid #2563eb;">
<tr><td style="padding:20px 24px;">
<p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1e3a5f;">💡 Lo sapeva?</p>
<p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">Può consultare il nostro sito web per scoprire tutte le offerte speciali e i servizi disponibili presso la nostra struttura.</p>
</td></tr>
</table>

<p style="font-size:14px;color:#475569;line-height:1.6;margin:24px 0 8px;">Cordiali saluti,<br><strong>Lo Staff</strong></p>
</td></tr>
<!-- Footer -->
<tr><td style="background-color:#f8fafc;padding:24px 48px;border-top:1px solid #e2e8f0;text-align:center;">
<p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">Questa email è stata generata automaticamente.<br>Per informazioni contattaci direttamente.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>'
WHERE id = '55763c75-2014-4e14-98e6-e82f2500b6cb';