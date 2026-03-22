import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Loader2, Calculator } from "lucide-react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
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

function applyTemplate(template: string, booking: SendOfferDialogProps["booking"], price?: string): string {
  return template
    .replace(/\{\{nome\}\}/g, booking.first_name || "")
    .replace(/\{\{cognome\}\}/g, booking.last_name || "")
    .replace(/\{\{check_in\}\}/g, booking.check_in ? format(new Date(booking.check_in), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{check_out\}\}/g, booking.check_out ? format(new Date(booking.check_out), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{prezzo\}\}/g, price || "[PREZZO]");
}

interface PricePeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface RoomPrice {
  period_id: string;
  price_per_night: number;
}

function calculateStayPrice(
  checkIn: string,
  checkOut: string,
  periods: PricePeriod[],
  roomPrices: RoomPrice[]
): { total: number; nights: number; breakdown: { period: string; nights: number; pricePerNight: number; subtotal: number }[] } | null {
  try {
    const startDate = parseISO(checkIn);
    const endDate = parseISO(checkOut);
    
    // Each night = the day you sleep (check-in day counts, check-out day doesn't)
    const stayDays = eachDayOfInterval({ start: startDate, end: new Date(endDate.getTime() - 86400000) });
    if (stayDays.length === 0) return null;

    const priceMap = new Map(roomPrices.map(rp => [rp.period_id, rp.price_per_night]));
    const breakdownMap = new Map<string, { period: string; nights: number; pricePerNight: number }>();
    let total = 0;
    let coveredNights = 0;

    for (const day of stayDays) {
      const dayStr = format(day, "yyyy-MM-dd");
      const matchingPeriod = periods.find(p => dayStr >= p.start_date && dayStr <= p.end_date);
      if (matchingPeriod && priceMap.has(matchingPeriod.id)) {
        const price = priceMap.get(matchingPeriod.id)!;
        total += price;
        coveredNights++;
        const existing = breakdownMap.get(matchingPeriod.id);
        if (existing) {
          existing.nights++;
        } else {
          breakdownMap.set(matchingPeriod.id, { period: matchingPeriod.name, nights: 1, pricePerNight: price });
        }
      }
    }

    if (coveredNights === 0) return null;

    const breakdown = Array.from(breakdownMap.values()).map(b => ({
      ...b,
      subtotal: b.nights * b.pricePerNight,
    }));

    return { total, nights: coveredNights, breakdown };
  } catch {
    return null;
  }
}

export function SendOfferDialog({ open, onOpenChange, booking, onSent }: SendOfferDialogProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [manualPrice, setManualPrice] = useState<string>("");

  const { data: templates } = useQuery({
    queryKey: ["offer_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms_for_offer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: pricePeriods } = useQuery({
    queryKey: ["price_periods_for_offer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_periods").select("*").order("start_date");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: roomPrices } = useQuery({
    queryKey: ["room_prices_for_offer", selectedRoom],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_prices")
        .select("period_id, price_per_night")
        .eq("room_id", selectedRoom);
      if (error) throw error;
      return data;
    },
    enabled: open && !!selectedRoom,
  });

  const calculatedPrice = useMemo(() => {
    if (!booking.check_in || !booking.check_out || !pricePeriods || !roomPrices) return null;
    return calculateStayPrice(booking.check_in, booking.check_out, pricePeriods, roomPrices);
  }, [booking.check_in, booking.check_out, pricePeriods, roomPrices]);

  const displayPrice = manualPrice || (calculatedPrice ? calculatedPrice.total.toFixed(2) : "");

  // Apply template when selected
  useEffect(() => {
    if (selectedTemplate && templates) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      if (tpl) {
        const priceStr = displayPrice ? `€${displayPrice}` : "[PREZZO]";
        setSubject(applyTemplate(tpl.subject_template || "", booking, priceStr));
        setBody(applyTemplate(tpl.body_template, booking, priceStr));
      }
    }
  }, [selectedTemplate, templates, booking, displayPrice]);

  // Update price in body when price changes (if template was already applied)
  useEffect(() => {
    if (displayPrice && body.includes("[PREZZO]")) {
      setBody(prev => prev.replace(/\[PREZZO\]/g, `€${displayPrice}`));
    }
  }, [displayPrice]);

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
        setSelectedRoom("");
        setManualPrice("");
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setSending(false);
    }
  };

  const selectedRoomName = rooms?.find(r => r.id === selectedRoom)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

          {/* Room & Price Section */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calculator className="h-4 w-4 text-primary" />
              Calcolo Prezzo
            </div>

            <div className="space-y-2">
              <Label>Camera</Label>
              <Select value={selectedRoom} onValueChange={(val) => { setSelectedRoom(val); setManualPrice(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona camera per calcolo automatico" />
                </SelectTrigger>
                <SelectContent>
                  {rooms?.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {calculatedPrice && (
              <div className="text-sm space-y-1 bg-background rounded-md p-2 border border-border">
                <p className="font-medium">
                  {selectedRoomName} — {calculatedPrice.nights} notti
                </p>
                {calculatedPrice.breakdown.map((b, i) => (
                  <p key={i} className="text-muted-foreground">
                    {b.period}: {b.nights} notti × €{b.pricePerNight.toFixed(2)} = €{b.subtotal.toFixed(2)}
                  </p>
                ))}
                <p className="font-bold text-primary">
                  Totale: €{calculatedPrice.total.toFixed(2)}
                </p>
              </div>
            )}

            {selectedRoom && !calculatedPrice && roomPrices && (
              <p className="text-sm text-destructive">
                Nessun listino disponibile per le date selezionate.
              </p>
            )}

            <div className="space-y-2">
              <Label>Prezzo manuale (sovrascrive il calcolo)</Label>
              <Input
                type="number"
                step="0.01"
                value={manualPrice}
                onChange={(e) => setManualPrice(e.target.value)}
                placeholder={calculatedPrice ? `Calcolato: €${calculatedPrice.total.toFixed(2)}` : "Inserisci prezzo"}
              />
            </div>
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
