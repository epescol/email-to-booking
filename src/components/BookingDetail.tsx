import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ArrowLeft, Mail, Phone, MapPin, Calendar, BedDouble, Utensils, Users } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import { InlineEmailComposer } from "@/components/InlineEmailComposer";

function stripQuotedContent(body: string | null): string {
  if (!body) return "";
  const text = body.replace(/\\n/g, '\n');
  const patterns = [
    /\n_{5,}/,
    /\n-{5,}/,
    /\nDa:.*\nInviato:.*\n/i,
    /\nFrom:.*\nSent:.*\n/i,
    /\nOn .+ wrote:\s*\n/i,
    /\nIl .+ ha scritto:\s*\n/i,
    /\n>+ /,
  ];
  let cutIndex = text.length;
  for (const pattern of patterns) {
    const match = text.search(pattern);
    if (match !== -1 && match < cutIndex) {
      cutIndex = match;
    }
  }
  return text.substring(0, cutIndex).trim();
}

interface BookingDetailProps {
  bookingId: string;
  onBack: () => void;
}


export function BookingDetail({ bookingId, onBack }: BookingDetailProps) {
  const queryClient = useQueryClient();

  const { data: booking, refetch } = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select("*")
        .eq("id", bookingId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages, refetch: refetchMessages } = useQuery({
    queryKey: ["booking_messages", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_messages")
        .select("*")
        .eq("request_id", bookingId)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: accommodations } = useQuery({
    queryKey: ["booking_accommodations", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_accommodations")
        .select("*")
        .eq("request_id", bookingId);
      if (error) throw error;
      return data;
    },
  });


  const handleMessageSent = () => {
    refetch();
    refetchMessages();
    queryClient.invalidateQueries({ queryKey: ["booking_counts"] });
  };

  if (!booking) return <div className="p-8 text-center text-muted-foreground">Caricamento...</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">
            {booking.first_name} {booking.last_name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Richiesta del {format(new Date(booking.created_at), "dd MMMM yyyy", { locale: it })}
          </p>
        </div>
        
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contatto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {booking.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{booking.email}</span>
                </div>
              )}
              {booking.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{booking.phone}</span>
                </div>
              )}
              <Separator />
              {(booking.address || booking.city) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    {booking.address && <p>{booking.address}</p>}
                    <p>
                      {[booking.zip_code, booking.city, booking.country].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              )}
              {booking.language && (
                <div>
                  <p className="text-muted-foreground">Lingua</p>
                  <p className="font-medium">{booking.language}</p>
                </div>
              )}
              {booking.gender && (
                <div>
                  <p className="text-muted-foreground">Genere</p>
                  <p className="font-medium">{booking.gender}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dettagli Soggiorno</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Check-in</p>
                  <p className="font-medium">{booking.check_in ? format(new Date(booking.check_in), "dd MMM yyyy", { locale: it }) : "-"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Check-out</p>
                  <p className="font-medium">{booking.check_out ? format(new Date(booking.check_out), "dd MMM yyyy", { locale: it }) : "-"}</p>
                </div>
              </div>
              {booking.alternative_dates && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Date Alternative</p>
                  <p className="font-medium">{formatAlternativeDates(booking.alternative_dates)}</p>
                </div>
              )}
              {booking.notes && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Note</p>
                  <p className="font-medium">{booking.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {accommodations && accommodations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Camere Richieste</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {accommodations.map((acc) => (
                  <div key={acc.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 text-sm">
                    <div className="flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{acc.room_type || "Camera"}</span>
                    </div>
                    {acc.treatment && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Utensils className="h-3.5 w-3.5" />
                        <span>{acc.treatment}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{acc.adults || 1} adulti{acc.children ? `, ${acc.children} bambini` : ""}</span>
                    </div>
                    {acc.notes && <span className="text-muted-foreground italic">{acc.notes}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conversazione</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InlineEmailComposer booking={booking} onSent={handleMessageSent} />
              {!messages?.length ? (
                <p className="text-sm text-muted-foreground">Nessun messaggio</p>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg text-sm ${
                        msg.direction === "inbound"
                          ? "bg-muted"
                          : "bg-primary/5 border border-primary/10"
                      }`}
                    >
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{msg.direction === "inbound" ? "📩 Ricevuto" : "📤 Inviato"}</span>
                        <span>{format(new Date(msg.sent_at), "dd/MM/yy HH:mm")}</span>
                      </div>
                      {msg.subject && <p className="font-medium mb-1">{msg.subject}</p>}
                      <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: stripQuotedContent(msg.body) }} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
