import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Mail, Server, Shield, Download, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

interface FetchResult {
  success: boolean;
  fetched: number;
  forwarded: number;
  imported: number;
  errors: string[];
  ran_at: string;
}


async function callEmailSettings(action: string, payload: Record<string, unknown> = {}) {
  const res = await supabase.functions.invoke("email-settings", {
    body: { action, ...payload },
  });
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["email_settings"],
    queryFn: () => callEmailSettings("get"),
    enabled: !!profile?.hotel_id,
  });

  const [form, setForm] = useState({
    imap_host: "", imap_port: 993, imap_user: "", imap_password: "", imap_use_ssl: true,
    smtp_host: "", smtp_port: 587, smtp_user: "", smtp_password: "", smtp_use_ssl: true,
    filter_sender_email: "",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        imap_host: settings.imap_host || "",
        imap_port: settings.imap_port || 993,
        imap_user: settings.imap_user || "",
        imap_password: "", // never prefill — leave empty to keep existing
        imap_use_ssl: settings.imap_use_ssl ?? true,
        smtp_host: settings.smtp_host || "",
        smtp_port: settings.smtp_port || 587,
        smtp_user: settings.smtp_user || "",
        smtp_password: "", // never prefill — leave empty to keep existing
        smtp_use_ssl: settings.smtp_use_ssl ?? true,
        filter_sender_email: settings.filter_sender_email || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => callEmailSettings("save", form),
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("fetch-emails-imap", { body: {} });
      if (res.error) {
        // Try to extract structured error from response
        const ctx = (res.error as any).context;
        let msg = res.error.message;
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* noop */ }
        throw new Error(msg);
      }
      return res.data as FetchResult;
    },
    onSuccess: (data) => {
      setFetchResult(data);
      if (data.success) {
        toast.success(`Importate ${data.imported} email (${data.fetched} scaricate)`);
      } else {
        toast.warning(`Completato con ${data.errors.length} errori`);
      }
    },
    onError: (e: Error) => {
      setFetchResult({ success: false, fetched: 0, forwarded: 0, imported: 0, errors: [e.message], ran_at: new Date().toISOString() });
      toast.error(e.message);
    },
  });

  const imapConfigured = !!settings?.imap_host && !!settings?.imap_user && !!settings?.imap_password;

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm">Configura le credenziali email e il webhook per il tuo hotel</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Scarica Email
          </CardTitle>
          <CardDescription>
            Avvia manualmente il fetch IMAP per importare le nuove email del tuo hotel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={() => fetchMutation.mutate()}
            disabled={!imapConfigured || fetchMutation.isPending}
          >
            {fetchMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Operazione in corso...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Scarica email ora</>
            )}
          </Button>

          {!imapConfigured && (
            <Alert variant="default">
              <Info className="h-4 w-4" />
              <AlertTitle>Configurazione necessaria</AlertTitle>
              <AlertDescription>
                Per scaricare le email devi prima configurare le credenziali IMAP nella sezione
                "Server IMAP (Ricezione)" qui sotto, poi salva le impostazioni.
              </AlertDescription>
            </Alert>
          )}

          {fetchResult && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                {fetchResult.success ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-600" /> Operazione completata</>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-destructive" /> Completata con errori</>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                <div><span className="font-medium text-foreground">{fetchResult.fetched}</span> scaricate</div>
                <div><span className="font-medium text-foreground">{fetchResult.forwarded}</span> inoltrate</div>
                <div><span className="font-medium text-foreground">{fetchResult.imported}</span> importate</div>
              </div>
              {fetchResult.errors.length > 0 && (
                <ul className="list-disc list-inside text-destructive text-xs space-y-1 pt-2 border-t">
                  {fetchResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
              <div className="text-xs text-muted-foreground pt-1">
                Eseguito: {new Date(fetchResult.ran_at).toLocaleString("it-IT")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" /> Filtro Email
            </CardTitle>
            <CardDescription>Indirizzo mittente da cui leggere le richieste</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Email Mittente Filtro</Label>
              <Input type="email" value={form.filter_sender_email} onChange={(e) => setForm({ ...form, filter_sender_email: e.target.value })} placeholder="notifiche@ilmiohotel.com" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" /> Server IMAP (Ricezione)
            </CardTitle>
            <CardDescription>Credenziali da usare anche in n8n per il nodo IMAP</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host</Label>
                <Input value={form.imap_host} onChange={(e) => setForm({ ...form, imap_host: e.target.value })} placeholder="imap.gmail.com" />
              </div>
              <div className="space-y-2">
                <Label>Porta</Label>
                <Input type="number" value={form.imap_port} onChange={(e) => setForm({ ...form, imap_port: +e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Utente</Label>
                <Input value={form.imap_user} onChange={(e) => setForm({ ...form, imap_user: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={form.imap_password} onChange={(e) => setForm({ ...form, imap_password: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.imap_use_ssl} onCheckedChange={(v) => setForm({ ...form, imap_use_ssl: v })} />
              <Label>Usa SSL</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> Server SMTP (Invio)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Host</Label>
                <Input value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
              </div>
              <div className="space-y-2">
                <Label>Porta</Label>
                <Input type="number" value={form.smtp_port} onChange={(e) => setForm({ ...form, smtp_port: +e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Utente</Label>
                <Input value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={form.smtp_password} onChange={(e) => setForm({ ...form, smtp_password: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.smtp_use_ssl} onCheckedChange={(v) => setForm({ ...form, smtp_use_ssl: v })} />
              <Label>Usa SSL</Label>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? "Salvataggio..." : "Salva Impostazioni"}
        </Button>
      </form>
    </div>
  );
}
