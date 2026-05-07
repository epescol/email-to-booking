## Obiettivo

Passare da "una casella SMTP/IMAP per hotel" a un'**unica casella centrale dell'agenzia** (es. `requester@interpromotion.com`):

- **Ingresso**: n8n monitora una sola casella IMAP. L'hotel viene identificato da un header custom `X-Hotel-ID` presente nell'email originale.
- **Uscita**: tutte le offerte agli ospiti vengono inviate da quella stessa casella, con un'unica configurazione SMTP globale. Niente più `Reply-To` né indirizzi hotel: l'hotel non ha più alcun indirizzo email nel sistema.

## Architettura risultante

```text
Sito hotel ──(email + header X-Hotel-ID)──► requester@interpromotion.com
                                                    │
                                                  n8n IMAP
                                                    │ webhook
                                                    ▼
                                            fetch-emails  ──► booking_requests
                                                    │
                                                    ▼
                                              Dashboard
                                                    │
                                              send-offer  ──SMTP unico──► Ospite
```

## Modifiche

### 1. Database

- **Nuova tabella `global_email_settings**` (riga singola, admin-only): host/porta/user/password SMTP cifrata, flag SSL, indirizzo "from" mostrato all'ospite, nome mittente.
- **Drop tabella `hotel_email_settings**` (non più usata).
- **Drop colonna `hotels.email**` (non più rilevante: l'hotel non ha indirizzo email proprio).
- RLS: `global_email_settings` accessibile solo agli admin; lettura della password mai esposta al client (come oggi per le credenziali per-hotel).

### 2. Edge function `fetch-emails` (ingresso)

- Rimuovere completamente la risoluzione hotel da `imap_user`/`smtp_user` (recipient routing).
- Nuova logica di risoluzione, in ordine:
  1. `email.x_hotel_id` dal payload n8n (header `X-Hotel-ID` letto da n8n e passato nel JSON).
  2. Se assente → log a livello warn, scarta l'email con motivo `missing_x_hotel_id` (visibile in `/admin/edge-logs`).
- Validare che `x_hotel_id` corrisponda a un hotel esistente; altrimenti scarta con `unknown_hotel_id`.
- Aggiornare il workflow n8n (lato utente, fuori dal codice) affinché estragga l'header `X-Hotel-ID` e lo includa nel payload come `x_hotel_id`. Documentare nel README.
- Aggiornare i test e2e (`recipient_routing_e2e_test.ts`, `unknown_recipient_e2e_test.ts`) → riscrivere come `x_hotel_id_routing_e2e_test.ts` / `missing_x_hotel_id_e2e_test.ts`.

### 3. Edge function `send-offer` (uscita)

- Rimuovere lettura di `hotel_email_settings`.
- Leggere SMTP da `global_email_settings` (singola riga).
- `From: "<nome agenzia>" <requester@interpromotion.com>` da config globale. Nessun `Reply-To`.
- Continuare a impostare `X-Hotel-Request-ID` (threading invariato lato risposte ospite — che però oggi non rientrano nel sistema perché l'ospite scrive a `requester@…` e n8n monitora quella stessa casella: le risposte verranno catturate e correlate solo via `X-Hotel-Request-ID` ).

### 4. Edge function `email-settings`

- Riconvertita da "per-hotel" a "globale": azioni `get`/`save` operano sull'unica riga di `global_email_settings`. Nessun parametro `hotel_id`.

### 5. Frontend

- **Rimuovere** `HotelEmailSettingsDialog.tsx` e ogni punto di apertura nella gestione utenti/hotel (`AdminUsers.tsx`).
- **Nuova pagina admin `/admin/email-settings**` con un singolo form (host, porta, SSL, user, password, from address, nome mittente). Voce nel sidebar admin.
- Rimuovere il campo `email` dal form hotel/utente in `AdminUsers.tsx`.
- Aggiornare `BookingDetail`/`InlineEmailComposer` se mostrano l'indirizzo hotel da qualche parte.

### 6. Pulizia

- Rimuovere riferimenti residui a `filter_sender_email`, IMAP per-hotel, `hotel_email_settings` (tipi, query, audit log entries storiche restano).
- Aggiornare memorie:
  - `mem://infrastructure/email-edge-functions`
  - `mem://security/credentials-encryption` (ora una sola password globale invece di per-hotel)
  - `mem://features/email-integration` (routing via `X-Hotel-ID`, non più via recipient)

## Cosa NON cambia

- Schema booking, template, pricing, multilingua, audit log: invariati.
- Cifratura pgcrypto della password SMTP: invariata, applicata alla password globale.

## Punti di attenzione operativi (per te, non codice)

- **Configurazione n8n**: il nodo IMAP Trigger deve esporre l'header `X-Hotel-ID` nel payload inviato al webhook `fetch-emails` come campo `x_hotel_id` (in n8n: `{{$json.headers["x-hotel-id"]}}`).
- **Siti web sorgenti**: ognuno deve iniettare l'header `X-Hotel-ID: <uuid>` nelle email che invia a `requester@interpromotion.com`. Da concordare con chi mantiene i form. Senza header, l'email viene scartata e tracciata nei log.
- **Migrazione dati**: prima di droppare `hotel_email_settings`, esporta eventuali credenziali ancora utili. Una volta applicata la migration le credenziali per-hotel sono perse.
- **Identità mittente**: gli ospiti vedranno sempre `requester@interpromotion.com` come mittente. Se in futuro vuoi differenziare visivamente per hotel, basterà personalizzare il `display name` del From in `send-offer` leggendo `hotels.name` (resta possibile senza ulteriori modifiche di schema).