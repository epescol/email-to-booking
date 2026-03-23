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

interface BookingAccommodation {
  id: string;
  room_type: string | null;
  treatment: string | null;
  adults: number | null;
  children: number | null;
  notes: string | null;
}

interface InlineEmailComposerProps {
  booking: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    check_in: string | null;
    check_out: string | null;
  };
  accommodations?: BookingAccommodation[];
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
  occupancy: number | null;
}

interface SelectedRoom {
  roomId: string;
  manualPrice: string;
  occupancy: number | null; // used in per_occupancy mode
}

function applyTemplate(template: string, booking: InlineEmailComposerProps["booking"], price?: string, roomsHtml?: string): string {
  return template
    .replace(/\{\{nome\}\}/g, booking.first_name || "")
    .replace(/\{\{cognome\}\}/g, booking.last_name || "")
    .replace(/\{\{check_in\}\}/g, booking.check_in ? format(new Date(booking.check_in), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{check_out\}\}/g, booking.check_out ? format(new Date(booking.check_out), "dd/MM/yyyy", { locale: it }) : "")
    .replace(/\{\{prezzo\}\}/g, price || "[PREZZO]")
    .replace(/\{\{camere\}\}/g, roomsHtml || "");
}

interface RoomData {
  id: string;
  name: string;
  beds: string | null;
  min_occupancy: number;
  max_occupancy: number;
  photo_url_1: string | null;
  photo_url_2: string | null;
  photo_url_3: string | null;
  photo_url_4: string | null;
  site_url: string | null;
}

function generateRoomPreviewHtml(
  roomData: RoomData,
  price: string | null,
  nights: number | null
): string {
  const photos = [roomData.photo_url_1, roomData.photo_url_2, roomData.photo_url_3, roomData.photo_url_4].filter(Boolean);
  
  const photoHtml = photos.length > 0
    ? `<img src="${photos[0]}" alt="${roomData.name}" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px 12px 0 0;display:block;" />`
    : "";

  const detailParts: string[] = [];
  if (roomData.beds) detailParts.push(`🛏️ ${roomData.beds}`);
  detailParts.push(`👤 ${roomData.min_occupancy}-${roomData.max_occupancy} ospiti`);
  
  const priceHtml = price
    ? `<td style="text-align:right;vertical-align:middle;">
        <p style="margin:0;font-size:24px;font-weight:800;color:#1e3a5f;">€${price}</p>
        ${nights ? `<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">${nights} notti</p>` : ""}
       </td>`
    : "";

  const linkHtml = roomData.site_url
    ? `<a href="${roomData.site_url}" style="display:inline-block;margin-top:8px;color:#2563eb;text-decoration:none;font-size:13px;font-weight:500;">Scopri di più →</a>`
    : "";

  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
  ${photoHtml ? `<tr><td colspan="2">${photoHtml}</td></tr>` : ""}
  <tr><td style="padding:16px 20px;" ${priceHtml ? '' : 'colspan="2"'}>
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1e293b;">${roomData.name}</p>
    <p style="margin:0;font-size:13px;color:#64748b;">${detailParts.join(" &nbsp;·&nbsp; ")}</p>
    ${linkHtml}
  </td>${priceHtml}</tr>
</table>`;
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

export function InlineEmailComposer({ booking, accommodations, onSent }: InlineEmailComposerProps) {
  const [autoSelected, setAutoSelected] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedRooms, setSelectedRooms] = useState<SelectedRoom[]>([]);
  const [priceOpen, setPriceOpen] = useState(false);

  // Fetch hotel pricing mode
  const { data: hotelData } = useQuery({
    queryKey: ["hotel_pricing_mode_composer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotels").select("id, pricing_mode").limit(1).single();
      if (error) throw error;
      return data;
    },
  });
  const pricingMode = (hotelData?.pricing_mode as string) || "per_room";

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

  // Auto-select rooms based on booking accommodations
  useEffect(() => {
    if (autoSelected || !rooms || rooms.length === 0 || !accommodations || accommodations.length === 0) return;
    
    const matched: SelectedRoom[] = [];
    for (const acc of accommodations) {
      if (!acc.room_type) continue;
      const normalizedType = acc.room_type.toLowerCase().trim();
      const matchedRoom = rooms.find(r => 
        r.name.toLowerCase().trim() === normalizedType ||
        r.name.toLowerCase().trim().includes(normalizedType) ||
        normalizedType.includes(r.name.toLowerCase().trim())
      );
      if (matchedRoom && !matched.some(m => m.roomId === matchedRoom.id)) {
        matched.push({ roomId: matchedRoom.id, manualPrice: "", occupancy: acc.adults || matchedRoom.min_occupancy || 1 });
      }
    }
    
    if (matched.length > 0) {
      setSelectedRooms(matched);
      setPriceOpen(true);
    }
    setAutoSelected(true);
  }, [rooms, accommodations, autoSelected]);

  // Fetch prices for all selected rooms at once
  const selectedRoomIds = selectedRooms.map(r => r.roomId);
  const { data: allRoomPrices } = useQuery({
    queryKey: ["room_prices_for_offer", selectedRoomIds],
    queryFn: async () => {
      if (selectedRoomIds.length === 0) return [];
      const { data, error } = await supabase
        .from("room_prices")
        .select("room_id, period_id, price_per_night, occupancy")
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
      let filteredPrices: RoomPrice[];
      if (pricingMode === "per_occupancy" && sr.occupancy) {
        filteredPrices = allRoomPrices.filter(rp => rp.room_id === sr.roomId && rp.occupancy === sr.occupancy);
      } else {
        filteredPrices = allRoomPrices.filter(rp => rp.room_id === sr.roomId && rp.occupancy === null);
      }
      result[sr.roomId] = calculateStayPrice(booking.check_in!, booking.check_out!, pricePeriods, filteredPrices);
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
    setSelectedRooms(prev => [...prev, { roomId, manualPrice: "", occupancy: rooms?.find(r => r.id === roomId)?.min_occupancy || 1 }]);
  };

  const removeRoom = (roomId: string) => {
    setSelectedRooms(prev => prev.filter(sr => sr.roomId !== roomId));
  };

  const updateRoomManualPrice = (roomId: string, price: string) => {
    setSelectedRooms(prev => prev.map(sr => sr.roomId === roomId ? { ...sr, manualPrice: price } : sr));
  };

  const updateRoomOccupancy = (roomId: string, occupancy: number) => {
    setSelectedRooms(prev => prev.map(sr => sr.roomId === roomId ? { ...sr, occupancy } : sr));
  };

  // Generate rooms HTML for template
  const roomsPreviewHtml = useMemo(() => {
    if (!rooms || selectedRooms.length === 0) return "";
    return selectedRooms.map(sr => {
      const roomData = rooms.find(r => r.id === sr.roomId);
      if (!roomData) return "";
      const calc = roomCalculations[sr.roomId];
      const manual = parseFloat(sr.manualPrice);
      const price = !isNaN(manual) && manual > 0 ? manual.toFixed(2) : calc ? calc.total.toFixed(2) : null;
      const nights = calc ? calc.nights : null;
      return generateRoomPreviewHtml(roomData, price, nights);
    }).join("");
  }, [rooms, selectedRooms, roomCalculations]);

  // Apply template
  useEffect(() => {
    if (selectedTemplate && templates) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      if (tpl) {
        const priceStr = displayPrice ? `€${displayPrice}` : "[PREZZO]";
        setSubject(applyTemplate(tpl.subject_template || "", booking, priceStr, roomsPreviewHtml));
        // Template body is already HTML, apply directly
        const htmlBody = applyTemplate(tpl.body_template, booking, priceStr, roomsPreviewHtml);
        setBody(htmlBody);
      }
    }
  }, [selectedTemplate, templates, booking, displayPrice, roomsPreviewHtml]);

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
