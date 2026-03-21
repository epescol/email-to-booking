import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowLeft, Mail, Phone, MapPin, Calendar } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface BookingDetailProps {
  bookingId: string;
  onBack: () => void;
}

const STATUS_OPTIONS = [
  { value: "nuova", label: "Nuova" },
  { value: "offerta_inviata", label: "Offerta Inviata" },
  { value: "caparra_inviata", label: "Caparra Inviata" },
  { value: "confermata", label: "Confermata" },
];

export function BookingDetail({ bookingId, onBack }: BookingDetailProps) {
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

  const { data: messages } = useQuery({
    queryKey: ["booking_messages", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_messages")
        .select("*")
        .eq("request_id", bookingId)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleStatusChange = async (newStatus: string) => {
    const { error } = await supabase
      .from("booking_requests")
      .update({ status: newStatus })
      .eq("id", bookingId);
    if (error) {
      toast.error("Errore nell'aggiornamento dello stato");
    } else {
      toast.success("Stato aggiornato");
      refetch();
    }
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
        <StatusBadge status={booking.status} />
        <Select value={booking.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
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
                  <p className="font-medium">{booking.alternative_dates}</p>
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cronologia Messaggi</CardTitle>
            </CardHeader>
            <CardContent>
              {!messages?.length ? (
                <p className="text-sm text-muted-foreground">Nessun messaggio</p>
              ) : (
                <div className="space-y-4">
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
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

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
        </div>
      </div>
    </div>
  );
}
