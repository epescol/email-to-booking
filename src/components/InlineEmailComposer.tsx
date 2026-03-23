import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Loader2, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface InlineEmailComposerProps {
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

function applyTemplate(template: string, booking: InlineEmailComposerProps["booking"], price?: string): string {
  return template
    .replace(/\{\{nome\}\}/g, booking.first_name || "")
    .replace(/\{\{cognome\}\}/g, booking.last_name || "")
    .replace(/\{\{check_in\}\}/g, booking.check_in ? format(new Date(booking.check_in), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{check_out\}\}/g, booking.check_out ? format(new Date(booking.check_out), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{prezzo\}\}/g, price || "[PREZZO]");
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

export function InlineEmailComposer({ booking, onSent }: InlineEmailComposerProps) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [manualPrice, setManualPrice] = useState<string>("");
  const [priceOpen, setPriceOpen] = useState(false);

  const { data: templates } = useQuery({
    queryKey: ["offer_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms_for_offer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: pricePeriods } = useQuery({
    queryKey: ["price_periods_for_offer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_periods").select("*").order("start_date");
      if (error) throw error;
      return data;
    },
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
    enabled: !!selectedRoom,
  });

  const calculatedPrice = useMemo(() => {
    if (!booking.check_in || !booking.check_out || !pricePeriods || !roomPrices) return null;
    return calculateStayPrice(booking.check_in, booking.check_out, pricePeriods, roomPrices);
  }, [booking.check_in, booking.check_out, pricePeriods, roomPrices]);

  const displayPrice = manualPrice || (calculatedPrice ? calculatedPrice.total.toFixed(2) : "");

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
        toast.success("Email inviata con successo!");
        setSubject("");
        setBody("");
        setSelectedTemplate("");
        setSelectedRoom("");
        setManualPrice("");
        onSent();
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setSending(false);
    }
  };

  const selectedRoomName = rooms?.find(r => r.id === selectedRoom)?.name;

  if (!booking.email) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          Nessun indirizzo email disponibile per questo ospite.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Send className="h-4 w-4 text-primary" />
          Rispondi a {booking.first_name}
        </div>

        {/* Template & Room selectors in a compact row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleziona template" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Camera</Label>
            <Select value={selectedRoom} onValueChange={(val) => { setSelectedRoom(val); setManualPrice(""); }}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Seleziona camera" />
              </SelectTrigger>
              <SelectContent>
                {rooms?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Collapsible price section */}
        {selectedRoom && (
          <Collapsible open={priceOpen} onOpenChange={setPriceOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 text-xs font-medium text-primary hover:underline w-full">
                <Calculator className="h-3.5 w-3.5" />
                {calculatedPrice
                  ? `Prezzo calcolato: €${calculatedPrice.total.toFixed(2)} (${calculatedPrice.nights} notti)`
                  : "Dettagli prezzo"
                }
                {priceOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {calculatedPrice && (
                <div className="text-xs space-y-1 bg-muted rounded-md p-2 border border-border">
                  <p className="font-medium">{selectedRoomName} — {calculatedPrice.nights} notti</p>
                  {calculatedPrice.breakdown.map((b, i) => (
                    <p key={i} className="text-muted-foreground">
                      {b.period}: {b.nights} notti × €{b.pricePerNight.toFixed(2)} = €{b.subtotal.toFixed(2)}
                    </p>
                  ))}
                  <p className="font-bold text-primary">Totale: €{calculatedPrice.total.toFixed(2)}</p>
                </div>
              )}

              {!calculatedPrice && roomPrices && (
                <p className="text-xs text-destructive">
                  Nessun listino disponibile per le date selezionate.
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Prezzo manuale</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  placeholder={calculatedPrice ? `Calcolato: €${calculatedPrice.total.toFixed(2)}` : "Inserisci prezzo"}
                  className="h-8 text-sm"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Subject */}
        <div className="space-y-1">
          <Label className="text-xs">Oggetto</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Oggetto dell'email"
            className="h-9"
          />
        </div>

        {/* Body */}
        <Textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Scrivi il messaggio..."
          className="text-sm"
        />

        {/* Send button */}
        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={sending} size="sm">
            {sending ? (
              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Invio...</>
            ) : (
              <><Send className="mr-2 h-3.5 w-3.5" />Invia</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
