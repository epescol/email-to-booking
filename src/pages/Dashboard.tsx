import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { RefreshCw, Mail, Calendar, User, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { BookingDetail } from "@/components/BookingDetail";

const STATUSES = [
  { value: "nuova", label: "Nuove", icon: Mail },
  { value: "offerta_inviata", label: "Offerta Inviata", icon: Calendar },
  { value: "caparra_inviata", label: "Caparra Inviata", icon: Calendar },
  { value: "confermata", label: "Confermate", icon: Calendar },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("nuova");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["booking_counts"] });
    toast.success("Dati aggiornati");
  };

  if (selectedBookingId) {
    return (
      <BookingDetail
        bookingId={selectedBookingId}
        onBack={() => {
          setSelectedBookingId(null);
          refetch();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prenotazioni</h1>
          <p className="text-muted-foreground text-sm">Gestisci le richieste di prenotazione</p>
        </div>
        <Button onClick={handleFetchEmails} disabled={fetchingEmails} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {fetchingEmails ? "Scaricando..." : "Scarica Email"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUSES.map((s) => (
          <Card
            key={s.value}
            className={`cursor-pointer transition-all hover:shadow-md ${activeTab === s.value ? "ring-2 ring-primary" : ""}`}
            onClick={() => setActiveTab(s.value)}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{counts?.[s.value] ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {STATUSES.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label} ({counts?.[s.value] ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUSES.map((s) => (
          <TabsContent key={s.value} value={s.value}>
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground">Caricamento...</div>
                ) : !bookings?.length ? (
                  <div className="p-8 text-center text-muted-foreground">
                    Nessuna prenotazione in questo stato
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ospite</TableHead>
                        <TableHead>Check-in</TableHead>
                        <TableHead>Check-out</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.map((b) => (
                        <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBookingId(b.id)}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              {b.first_name} {b.last_name}
                            </div>
                          </TableCell>
                          <TableCell>{b.check_in ? format(new Date(b.check_in), "dd MMM yyyy", { locale: it }) : "-"}</TableCell>
                          <TableCell>{b.check_out ? format(new Date(b.check_out), "dd MMM yyyy", { locale: it }) : "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{b.email || "-"}</TableCell>
                          <TableCell><StatusBadge status={b.status} /></TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(b.created_at), "dd/MM/yy HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
