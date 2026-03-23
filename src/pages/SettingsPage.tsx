import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Mail, Server, Shield, Webhook, Copy, CheckCheck } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["email_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotel_email_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
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
        imap_password: settings.imap_password || "",
        imap_use_ssl: settings.imap_use_ssl ?? true,
        smtp_host: settings.smtp_host || "",
        smtp_port: settings.smtp_port || 587,
        smtp_user: settings.smtp_user || "",
        smtp_password: settings.smtp_password || "",
        smtp_use_ssl: settings.smtp_use_ssl ?? true,
        filter_sender_email: settings.filter_sender_email || "",
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.hotel_id) throw new Error("Nessun hotel associato");
      if (settings) {
        const { error } = await supabase.from("hotel_email_settings").update(form).eq("id", settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hotel_email_settings").insert({ ...form, hotel_id: profile.hotel_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const [copied, setCopied] = useState<string | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-emails`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copiato!`);
    setTimeout(() => setCopied(null), 2000);
  };

  const examplePayload = JSON.stringify({
    mode: "webhook",
    hotel_id: profile?.hotel_id || "IL_TUO_HOTEL_ID",
    emails: [{
      subject: "{{ subject }}",
      body: "{{ textPlain }}",
      from: "{{ from }}",
      date: "{{ date }}",
      message_id: "{{ messageId }}"
    }]
  }, null, 2);

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm">Configura le credenziali email e il webhook per il tuo hotel</p>
      </div>

      {/* Webhook Configuration Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Webhook className="h-4 w-4" /> Webhook Ricezione Email
          </CardTitle>
          <CardDescription>
            Configura un servizio esterno (n8n, Zapier, Make) per inviare le email ricevute via IMAP a questo webhook
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs bg-muted" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, "URL")}
              >
                {copied === "URL" ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Hotel ID</Label>
            <div className="flex gap-2">
              <Input value={profile?.hotel_id || "—"} readOnly className="font-mono text-xs bg-muted" />
              {profile?.hotel_id && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(profile.hotel_id!, "Hotel ID")}
                >
                  {copied === "Hotel ID" ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Payload di esempio (JSON)</Label>
            <div className="relative">
              <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {examplePayload}
              </pre>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(examplePayload, "Payload")}
              >
                {copied === "Payload" ? <CheckCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <Separator />

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Istruzioni per n8n:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Aggiungi un nodo <strong>IMAP Email</strong> come trigger (con le credenziali sotto)</li>
              <li>Aggiungi un nodo <strong>HTTP Request</strong> (POST) con l'URL sopra</li>
              <li>Imposta l'header <code className="bg-muted px-1 rounded">x-webhook-secret</code> con il tuo segreto</li>
              <li>Usa il payload di esempio adattando i campi n8n</li>
            </ol>
          </div>
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
              <Input
                type="email"
                value={form.filter_sender_email}
                onChange={(e) => setForm({ ...form, filter_sender_email: e.target.value })}
                placeholder="notifiche@ilmiohotel.com"
              />
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
