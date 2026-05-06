import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, Mail, Shield } from "lucide-react";

interface Props {
  hotelId: string | null;
  hotelName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function callEmailSettings(action: string, payload: Record<string, unknown> = {}) {
  const res = await supabase.functions.invoke("email-settings", {
    body: { action, ...payload },
  });
  if (res.error) {
    const ctx = (res.error as any).context;
    let msg = res.error.message;
    try {
      const body = await ctx?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* noop */ }
    throw new Error(msg);
  }
  return res.data;
}

const empty = {
  smtp_host: "", smtp_port: 587, smtp_user: "", smtp_password: "", smtp_use_ssl: true,
  filter_sender_email: "",
};

export default function HotelEmailSettingsDialog({ hotelId, hotelName, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["hotel_email_settings", hotelId],
    queryFn: () => callEmailSettings("get", { hotel_id: hotelId }),
    enabled: !!hotelId && open,
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
        filter_sender_email: settings.filter_sender_email || "",
      });
    } else {
      setForm(empty);
    }
  }, [settings, open]);

  const saveMutation = useMutation({
    mutationFn: () => callEmailSettings("save", { ...form, hotel_id: hotelId }),
    onSuccess: () => {
      toast.success("Impostazioni email salvate");
      queryClient.invalidateQueries({ queryKey: ["hotel_email_settings", hotelId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Impostazioni Email{hotelName ? ` — ${hotelName}` : ""}</DialogTitle>
          <DialogDescription>Filtro mittente e server SMTP per l'hotel selezionato</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <section className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm"><Mail className="h-4 w-4" /> Filtro Email</div>
            <div className="space-y-2">
              <Label>Email mittente filtro</Label>
              <Input type="email" value={form.filter_sender_email} onChange={(e) => setForm({ ...form, filter_sender_email: e.target.value })} placeholder="notifiche@ilmiohotel.com" />
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <div className="flex items-center gap-2 font-medium text-sm"><Shield className="h-4 w-4" /> Server SMTP (Invio)</div>
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
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !hotelId}>
            {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
