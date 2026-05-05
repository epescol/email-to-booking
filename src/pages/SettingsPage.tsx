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
import { Mail, Server, Shield, Download, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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
    mutationFn: () => callEmailSettings("save", form),
    onSuccess: () => {
      toast.success("Impostazioni salvate");
      queryClient.invalidateQueries({ queryKey: ["email_settings"] });
    },
    onError: (e) => toast.error(e.message),
  });


  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm">Configura le credenziali email e il webhook per il tuo hotel</p>
      </div>


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
