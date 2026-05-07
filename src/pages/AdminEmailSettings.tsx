import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useProfile";

async function callEmailSettings(action: string, payload: Record<string, unknown> = {}) {
  const res = await supabase.functions.invoke("email-settings", { body: { action, ...payload } });
  if (res.error) {
    const ctx = (res.error as any).context;
    let msg = res.error.message;
    try {
      const b = await ctx?.json?.();
      if (b?.error) msg = b.error;
    } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.data;
}

const empty = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  smtp_use_ssl: true,
  from_address: "",
  from_name: "",
};

export default function AdminEmailSettings() {
  const { user } = useAuth();
  const { data: roles } = useUserRoles(user?.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["global_email_settings"],
    queryFn: () => callEmailSettings("get"),
    enabled: isAdmin,
  });

  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (settings) {
      setForm({
        smtp_host: settings.smtp_host || "",
        smtp_port: settings.smtp_port || 587,
        smtp_user: settings.smtp_user || "",
        smtp_password: "",
        smtp_use_ssl: settings.smtp_use_ssl ?? true,
        from_address: settings.from_address || "",
        from_name: settings.from_name || "",
      });
    } else {
      setForm(empty);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () => callEmailSettings("save", form),
    onSuccess: () => {
      toast.success("Impostazioni email salvate");
      queryClient.invalidateQueries({ queryKey: ["global_email_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Accesso non autorizzato</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni Email</h1>
        <p className="text-muted-foreground text-sm">
          Server SMTP centrale usato da tutti gli hotel per inviare le offerte agli ospiti.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
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
              <Input value={form.smtp_user} onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} placeholder="requester@interpromotion.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={form.smtp_password}
                onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                placeholder={settings?.has_smtp_password ? "•••••••• (salvata)" : ""}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.smtp_use_ssl} onCheckedChange={(v) => setForm({ ...form, smtp_use_ssl: v })} />
            <Label>Usa SSL</Label>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Indirizzo mittente (From)</Label>
              <Input
                value={form.from_address}
                onChange={(e) => setForm({ ...form, from_address: e.target.value })}
                placeholder="requester@interpromotion.com"
              />
              <p className="text-xs text-muted-foreground">Se vuoto, viene usato l'utente SMTP.</p>
            </div>
            <div className="space-y-2">
              <Label>Nome mittente</Label>
              <Input
                value={form.from_name}
                onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                placeholder="Interpromotion"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
