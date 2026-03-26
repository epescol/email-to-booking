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
import { DEFAULT_ROOM_CARD_TEMPLATE, renderTemplate } from "@/components/RoomCardTemplateEditor";

interface BookingAccommodation {
  id: string;
  room_type: string | null;
  treatment: string | null;
  room_id: string | null;
  treatment_id: string | null;
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
    language: string | null;
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
  occupancy: number | null;
  childrenCount: number;
  childrenPrice: string;
  treatmentId?: string;
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
  nights: number | null,
  customTemplate?: string | null
): string {
  const photos = [roomData.photo_url_1, roomData.photo_url_2, roomData.photo_url_3, roomData.photo_url_4].filter(Boolean);
  
  const detailParts: string[] = [];
  if (roomData.beds) detailParts.push(`🛏️ ${roomData.beds}`);
  detailParts.push(`👤 ${roomData.min_occupancy}-${roomData.max_occupancy} ospiti`);

  const data: Record<string, string> = {
    nome_camera: roomData.name,
    dettagli: detailParts.join(" \u00a0·\u00a0 "),
  };
  if (photos[0]) data.foto = photos[0];
  if (price) data.prezzo = price;
  if (nights) data.notti = String(nights);
  if (roomData.site_url) data.link = roomData.site_url;

  const tpl = customTemplate || DEFAULT_ROOM_CARD_TEMPLATE;
  return renderTemplate(tpl, data);
}

function calculateStayPrice(
  checkIn: string,
  checkOut: string,
  periods: PricePeriod[],
  roomPrices: RoomPrice[],
  guests: number = 1
): { total: number; nights: number; guests: number; breakdown: { period: string; nights: number; pricePerNight: number; subtotal: number }[] } | null {
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
      subtotal: b.nights * b.pricePerNight * guests,
    }));

    return { total: total * guests, nights: coveredNights, guests, breakdown };
  } catch {
    return null;
  }
}

export function InlineEmailComposer({ booking, accommodations, onSent }: InlineEmailComposerProps) {
  const [autoSelected, setAutoSelected] = useState(false);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [emailBodyContent, setEmailBodyContent] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedRooms, setSelectedRooms] = useState<SelectedRoom[]>([]);
  const [priceOpen, setPriceOpen] = useState(false);

  // Fetch hotel pricing mode and default template
  const { data: hotelData } = useQuery({
    queryKey: ["hotel_pricing_mode_composer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotels").select("id, pricing_mode, room_card_template, default_template_id").limit(1).single();
      if (error) throw error;
      return data as { id: string; pricing_mode: string; room_card_template: string | null; default_template_id: string | null };
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

  // Auto-select default template
  const [defaultApplied, setDefaultApplied] = useState(false);
  useEffect(() => {
    if (!defaultApplied && hotelData?.default_template_id && templates && templates.length > 0) {
      const exists = templates.some(t => t.id === hotelData.default_template_id);
      if (exists && !selectedTemplate) {
        setSelectedTemplate(hotelData.default_template_id);
      }
      setDefaultApplied(true);
    }
  }, [hotelData, templates, defaultApplied, selectedTemplate]);

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

  const { data: treatments } = useQuery({
    queryKey: ["treatments_for_offer"],
    queryFn: async () => {
      const { data, error } = await supabase.from("treatments").select("*").eq("enabled", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  // Auto-select rooms based on booking accommodations
  useEffect(() => {
    if (autoSelected || !rooms || rooms.length === 0 || !accommodations || accommodations.length === 0) return;
    
    const matched: SelectedRoom[] = [];
    for (const acc of accommodations) {
      let matchedRoom: typeof rooms[0] | undefined;

      // 1. Prefer direct ID match from structured XML data
      if (acc.room_id) {
        matchedRoom = rooms.find(r => r.id === acc.room_id);
      }
      
      // 2. Fallback to name matching (AI-parsed data)
      if (!matchedRoom && acc.room_type) {
        const normalizedType = acc.room_type.toLowerCase().trim();
        matchedRoom = rooms.find(r => 
          r.name.toLowerCase().trim() === normalizedType ||
          r.name.toLowerCase().trim().includes(normalizedType) ||
          normalizedType.includes(r.name.toLowerCase().trim())
        );
      }

      if (matchedRoom && !matched.some(m => m.roomId === matchedRoom!.id)) {
        const childrenCount = acc.children || 0;
        matched.push({
          roomId: matchedRoom.id,
          manualPrice: "",
          occupancy: acc.adults || matchedRoom.min_occupancy || 1,
          childrenCount,
          childrenPrice: "",
          treatmentId: acc.treatment_id || undefined,
        });
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
  const selectedTreatmentIds = selectedRooms.map(r => r.treatmentId).filter(Boolean) as string[];
  const { data: allRoomPrices } = useQuery({
    queryKey: ["room_prices_for_offer", selectedRoomIds, selectedTreatmentIds],
    queryFn: async () => {
      if (selectedRoomIds.length === 0) return [];
      const { data, error } = await supabase
        .from("room_prices")
        .select("room_id, period_id, price_per_night, occupancy, treatment_id")
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
        filteredPrices = allRoomPrices.filter(rp => rp.room_id === sr.roomId && rp.occupancy === sr.occupancy && (!sr.treatmentId || rp.treatment_id === sr.treatmentId));
      } else {
        filteredPrices = allRoomPrices.filter(rp => rp.room_id === sr.roomId && rp.occupancy === null && (!sr.treatmentId || rp.treatment_id === sr.treatmentId));
      }
      const guests = pricingMode === "per_room" ? (sr.occupancy || 1) : 1;
      result[sr.roomId] = calculateStayPrice(booking.check_in!, booking.check_out!, pricePeriods, filteredPrices, guests);
    }
    return result;
  }, [booking.check_in, booking.check_out, pricePeriods, allRoomPrices, selectedRooms, pricingMode]);

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
      // Add children price
      const childrenP = parseFloat(sr.childrenPrice);
      if (!isNaN(childrenP) && childrenP > 0) {
        total += childrenP;
      }
    }
    return total;
  }, [selectedRooms, roomCalculations]);

  const displayPrice = grandTotal > 0 ? grandTotal.toFixed(2) : "";

  // Available rooms (not already selected)
  const availableRooms = rooms?.filter(r => !selectedRooms.some(sr => sr.roomId === r.id)) ?? [];

  const addRoom = (roomId: string) => {
    setSelectedRooms(prev => [...prev, { roomId, manualPrice: "", occupancy: rooms?.find(r => r.id === roomId)?.min_occupancy || 1, childrenCount: 0, childrenPrice: "", treatmentId: undefined }]);
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

  const updateRoomChildrenCount = (roomId: string, childrenCount: number) => {
    setSelectedRooms(prev => prev.map(sr => sr.roomId === roomId ? { ...sr, childrenCount } : sr));
  };

  const updateRoomChildrenPrice = (roomId: string, childrenPrice: string) => {
    setSelectedRooms(prev => prev.map(sr => sr.roomId === roomId ? { ...sr, childrenPrice } : sr));
  };

  const updateRoomTreatment = (roomId: string, treatmentId: string | undefined) => {
    setSelectedRooms(prev => prev.map(sr => sr.roomId === roomId ? { ...sr, treatmentId } : sr));
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
      return generateRoomPreviewHtml(roomData, price, nights, hotelData?.room_card_template);
    }).join("");
  }, [rooms, selectedRooms, roomCalculations, hotelData?.room_card_template]);



  // Check if template has {{email_body}} placeholder
  const hasEmailBodyPlaceholder = useMemo(() => {
    if (!selectedTemplate || !templates) return false;
    const tpl = templates.find(t => t.id === selectedTemplate);
    return !!tpl?.body_template?.includes("{{email_body}}");
  }, [selectedTemplate, templates]);

  // Store the raw template body (before email_body substitution) for live preview
  const [rawTemplateBody, setRawTemplateBody] = useState("");

  // Apply template
  useEffect(() => {
    if (selectedTemplate && templates) {
      const tpl = templates.find((t) => t.id === selectedTemplate);
      if (tpl) {
        setEmailBodyContent(""); // Reset free text on template change
        const priceStr = displayPrice ? `€${displayPrice}` : "[PREZZO]";
        setSubject(applyTemplate(tpl.subject_template || "", booking, priceStr, roomsPreviewHtml));
        const htmlBody = applyTemplate(tpl.body_template, booking, priceStr, roomsPreviewHtml);
        if (tpl.body_template.includes("{{email_body}}")) {
          setRawTemplateBody(htmlBody);
          setBody(htmlBody.replace(/\{\{email_body\}\}/g, "<p><em>[Inserisci il testo qui]</em></p>"));
        } else {
          setRawTemplateBody("");
          setBody(htmlBody);
        }
      }
    }
  }, [selectedTemplate, templates, booking, displayPrice, roomsPreviewHtml]);

  // Update body when emailBodyContent changes (for templates with {{email_body}})
  useEffect(() => {
    if (hasEmailBodyPlaceholder && rawTemplateBody) {
      setBody(rawTemplateBody.replace(/\{\{email_body\}\}/g, emailBodyContent || "<p><em>[Inserisci il testo qui]</em></p>"));
    }
  }, [emailBodyContent, hasEmailBodyPlaceholder, rawTemplateBody]);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Compila oggetto e corpo dell'email");
      return;
    }

    // Check if any room has children without a price
    const roomsWithChildrenNoPrice = selectedRooms.filter(sr => sr.childrenCount > 0 && !sr.childrenPrice);
    if (roomsWithChildrenNoPrice.length > 0) {
      const roomNames = roomsWithChildrenNoPrice.map(sr => rooms?.find(r => r.id === sr.roomId)?.name || "Camera").join(", ");
      const confirmed = window.confirm(`Attenzione: le seguenti camere hanno bambini senza prezzo inserito: ${roomNames}.\n\nVuoi inviare comunque l'offerta?`);
      if (!confirmed) return;
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

                  {room && (
                    <div className="space-y-1">
                      <Label className="text-xs">Occupazione</Label>
                      <Select
                        value={sr.occupancy?.toString() || ""}
                        onValueChange={(v) => updateRoomOccupancy(sr.roomId, parseInt(v))}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Seleziona" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from(
                            { length: (room.max_occupancy || 2) - (room.min_occupancy || 1) + 1 },
                            (_, i) => (room.min_occupancy || 1) + i
                          ).map((occ) => (
                            <SelectItem key={occ} value={occ.toString()}>
                              {occ} {occ === 1 ? "persona" : "persone"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {treatments && treatments.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Trattamento</Label>
                      <Select
                        value={sr.treatmentId || ""}
                        onValueChange={(v) => updateRoomTreatment(sr.roomId, v || undefined)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Seleziona trattamento" />
                        </SelectTrigger>
                        <SelectContent>
                          {treatments.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {calc && (
                    <div className="text-xs space-y-0.5">
                      {calc.breakdown.map((b, i) => (
                        <p key={i} className="text-muted-foreground">
                          {b.period}: {b.nights} notti × €{b.pricePerNight.toFixed(2)}{calc.guests > 1 ? ` × ${calc.guests} pers.` : ""} = €{b.subtotal.toFixed(2)}
                        </p>
                      ))}
                      <p className="font-semibold text-primary">Totale: €{calc.total.toFixed(2)}</p>
                    </div>
                  )}

                  {!calc && allRoomPrices && (
                    <p className="text-xs text-destructive">Nessun listino per queste date.</p>
                  )}

                  <div className="space-y-1">
                    <Label className="text-xs">Prezzo manuale adulti</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={sr.manualPrice}
                      onChange={(e) => updateRoomManualPrice(sr.roomId, e.target.value)}
                      placeholder={calc ? `Calcolato: €${calc.total.toFixed(2)}` : "Inserisci prezzo"}
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Children fields */}
                  <div className="space-y-1">
                    <Label className="text-xs">Bambini</Label>
                    <Input
                      type="number"
                      min="0"
                      value={sr.childrenCount || ""}
                      onChange={(e) => updateRoomChildrenCount(sr.roomId, parseInt(e.target.value) || 0)}
                      placeholder="0"
                      className="h-8 text-sm"
                    />
                  </div>

                  {sr.childrenCount > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Prezzo bambini (totale soggiorno)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={sr.childrenPrice}
                        onChange={(e) => updateRoomChildrenPrice(sr.roomId, e.target.value)}
                        placeholder="Inserisci prezzo bambini"
                        className={`h-8 text-sm ${sr.childrenCount > 0 && !sr.childrenPrice ? "border-warning ring-1 ring-warning" : ""}`}
                      />
                      {!sr.childrenPrice && (
                        <p className="text-xs text-destructive">⚠️ Prezzo bambini non inserito</p>
                      )}
                    </div>
                  )}
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

        {/* Email body content editor (for templates with {{email_body}}) */}
        {hasEmailBodyPlaceholder && (
          <div className="space-y-1">
            <Label className="text-xs">Testo libero</Label>
            <WysiwygEditor
              content={emailBodyContent}
              onChange={setEmailBodyContent}
              placeholder="Scrivi il contenuto da inserire nel template..."
              minHeight="360px"
            />
          </div>
        )}

        {/* Body: iframe preview if template selected, WYSIWYG editor if no template */}
        <div className="space-y-1">
          <Label className="text-xs">{selectedTemplate ? "Anteprima Email" : "Corpo Email"}</Label>
          {selectedTemplate ? (
          <div className="border rounded-md bg-white overflow-hidden">
              <iframe
                srcDoc={body}
                className="w-full border-0"
                title="Email Preview"
                style={{ minHeight: '400px' }}
                onLoad={(e) => {
                  const iframe = e.currentTarget;
                  const adjustHeight = () => {
                    if (iframe.contentDocument?.body) {
                      iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
                    }
                  };
                  adjustHeight();
                  // Re-adjust after images load
                  const images = iframe.contentDocument?.querySelectorAll('img');
                  images?.forEach(img => img.addEventListener('load', adjustHeight));
                }}
              />
            </div>
          ) : (
            <WysiwygEditor
              content={body}
              onChange={setBody}
              placeholder="Scrivi il messaggio..."
            />
          )}
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
