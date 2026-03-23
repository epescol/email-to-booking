import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Loader2, Calculator, ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { WysiwygEditor } from "@/components/WysiwygEditor";

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

interface SelectedRoom {
  roomId: string;
  manualPrice: string;
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
  const [selectedRooms, setSelectedRooms] = useState<SelectedRoom[]>([]);
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
      const { data, error } = await supabase
        .from("rooms")
        .select("id, name, beds, min_occupancy, max_occupancy, photo_url_1, photo_url_2, photo_url_3, photo_url_4, site_url")
        .order("name");
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

  // Fetch prices for all selected rooms at once
  const selectedRoomIds = selectedRooms.map(r => r.roomId);
  const { data: allRoomPrices } = useQuery({
    queryKey: ["room_prices_for_offer", selectedRoomIds],
    queryFn: async () => {
      if (selectedRoomIds.length === 0) return [];
      const { data, error } = await supabase
        .from("room_prices")
        .select("room_id, period_id, price_per_night")
        .in("room_id", selectedRoomIds);
      if (error) throw error;
      return data;
    },
    enabled: selectedRoomIds.length > 0,
  });

  // Calculate prices per room
  const roomCalculations = useMemo(() => {
    if (!booking.check_in || !booking.check_out || !pricePeriods || !allRoomPrices) return {};
    const result: Record<string, ReturnType<typeof calculateStayPrice>> = {};
    for (const sr of selectedRooms) {
      const prices = allRoomPrices.filter(rp => rp.room_id === sr.roomId);
      result[sr.roomId] = calculateStayPrice(booking.check_in!, booking.check_out!, pricePeriods, prices);
    }
    return result;
  }, [booking.check_in, booking.check_out, pricePeriods, allRoomPrices, selectedRooms]);

  // Grand total
  const grandTotal = useMemo(() => {
    let total = 0;
    for (const sr of selectedRooms) {
      const manual = parseFloat(sr.manualPrice);
      if (!isNaN(manual) && manual > 0) {
        total += manual;
      } else {
        const calc = roomCalculations[sr.roomId];
        if (calc) total += calc.total;
      }
    }
    return total;
  }, [selectedRooms, roomCalculations]);

  const displayPrice = grandTotal > 0 ? grandTotal.toFixed(2) : "";

  // Available rooms (not already selected)
  const availableRooms = rooms?.filter(r => !selectedRooms.some(sr => sr.roomId === r.id)) ?? [];

  const addRoom = (roomId: string) => {
    setSelectedRooms(prev => [...prev, { roomId, manualPrice: "" }]);
  };

  const removeRoom = (roomId: string) => {
    setSelectedRooms(prev => prev.filter(sr => sr.roomId !== roomId));
  };

  const updateRoomManualPrice = (roomId: string, price: string) => {
    setSelectedRooms(prev => prev.map(sr => sr.roomId === roomId ? { ...sr, manualPrice: price } : sr));
  };

  // Apply template
  useEffect(() => {
    if (selectedTemplate && templates) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      if (tpl) {
        const priceStr = displayPrice ? `€${displayPrice}` : "[PREZZO]";
        setSubject(applyTemplate(tpl.subject_template || "", booking, priceStr));
        // Convert plain text template to simple HTML
        const htmlBody = applyTemplate(tpl.body_template, booking, priceStr)
          .split("\n")
          .map(line => line.trim() ? `<p>${line}</p>` : "<p></p>")
          .join("");
        setBody(htmlBody);
      }
    }
  }, [selectedTemplate, templates, booking, displayPrice]);

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
            is_html: true,
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
        setSelectedRooms([]);
        onSent();
      }
    } catch {
      toast.error("Errore di connessione");
    } finally {
      setSending(false);
    }
  };

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

        {/* Template selector */}
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

        {/* Multi-room section */}
        <Collapsible open={priceOpen} onOpenChange={setPriceOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 text-xs font-medium text-primary hover:underline w-full">
              <Calculator className="h-3.5 w-3.5" />
              Camere e Prezzi
              {selectedRooms.length > 0 && (
                <span className="text-muted-foreground">
                  ({selectedRooms.length} {selectedRooms.length === 1 ? "camera" : "camere"}
                  {grandTotal > 0 ? ` — €${grandTotal.toFixed(2)}` : ""})
                </span>
              )}
              {priceOpen ? <ChevronUp className="h-3 w-3 ml-auto" /> : <ChevronDown className="h-3 w-3 ml-auto" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3">
            {/* Selected rooms */}
            {selectedRooms.map((sr) => {
              const room = rooms?.find(r => r.id === sr.roomId);
              const calc = roomCalculations[sr.roomId];
              const effectivePrice = sr.manualPrice || (calc ? calc.total.toFixed(2) : "");

              return (
                <div key={sr.roomId} className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{room?.name ?? sr.roomId}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRoom(sr.roomId)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {calc && (
                    <div className="text-xs space-y-0.5">
                      {calc.breakdown.map((b, i) => (
                        <p key={i} className="text-muted-foreground">
                          {b.period}: {b.nights} notti × €{b.pricePerNight.toFixed(2)} = €{b.subtotal.toFixed(2)}
                        </p>
                      ))}
                      <p className="font-semibold text-primary">Totale: €{calc.total.toFixed(2)}</p>
                    </div>
                  )}

                  {!calc && allRoomPrices && (
                    <p className="text-xs text-destructive">Nessun listino per queste date.</p>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Prezzo manuale</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={sr.manualPrice}
                      onChange={(e) => updateRoomManualPrice(sr.roomId, e.target.value)}
                      placeholder={calc ? `Calcolato: €${calc.total.toFixed(2)}` : "Inserisci prezzo"}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              );
            })}

            {/* Add room button */}
            {availableRooms.length > 0 && (
              <div className="flex items-center gap-2">
                <Select onValueChange={addRoom} value="">
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue placeholder="Aggiungi camera..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Grand total */}
            {selectedRooms.length > 1 && grandTotal > 0 && (
              <div className="text-sm font-bold text-primary border-t border-border pt-2">
                Totale generale: €{grandTotal.toFixed(2)}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

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

        {/* WYSIWYG Body */}
        <div className="space-y-1">
          <Label className="text-xs">Corpo Email</Label>
          <WysiwygEditor
            content={body}
            onChange={setBody}
            placeholder="Scrivi il messaggio..."
          />
        </div>

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
