import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface SendOfferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    check_in: string | null;
    check_out: string | null;
  };
  onSent: () => void;
}

function applyTemplate(template: string, booking: SendOfferDialogProps["booking"]): string {
  return template
    .replace(/\{\{nome\}\}/g, booking.first_name || "")
    .replace(/\{\{cognome\}\}/g, booking.last_name || "")
    .replace(/\{\{check_in\}\}/g, booking.check_in ? format(new Date(booking.check_in), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{check_out\}\}/g, booking.check_out ? format(new Date(booking.check_out), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{prezzo\}\}/g, "[PREZZO]");
}

export function SendOfferDialog({ open, onOpenChange, booking, onSent }: SendOfferDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const { data: templates } = useQuery({
    queryKey: ["offer_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  useEffect(() => {
    if (selectedTemplate && templates) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      if (tpl) {
        setSubject(applyTemplate(tpl.subject_template || "", booking));
        setBody(applyTemplate(tpl.body_template, booking));
      }
    }
  }, [selectedTemplate, templates, booking]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Compila oggetto e corpo dell'email");
      return;
    }

    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Devi essere autenticato");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-offer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            booking_id: booking.id,
            subject,
            body,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "Errore nell'invio");
      } else {
        toast.success("Offerta inviata con successo!");
        onOpenChange(false);
        onSent();
        setSubject("");
        setBody("");
        setSelectedTemplate("");
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invia Offerta a {booking.first_name} {booking.last_name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un template (opzionale)" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Destinatario</Label>
            <Input value={booking.email || ""} disabled />
          </div>

          <div className="space-y-2">
            <Label>Oggetto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oggetto dell'email" />
          </div>

          <div className="space-y-2">
            <Label>Corpo Email</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Scrivi il contenuto dell'offerta..." />
          </div>

          <Button onClick={handleSend} disabled={sending} className="w-full">
            {sending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Invio in corso...</>
            ) : (
              <><Send className="mr-2 h-4 w-4" />Invia Offerta</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
