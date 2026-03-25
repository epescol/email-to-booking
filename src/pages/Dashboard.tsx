import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { RefreshCw, Mail, Calendar, User, Eye, Trash2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { BookingDetail } from "@/components/BookingDetail";
import { ConfirmDelete, useConfirmDelete } from "@/components/ConfirmDelete";
import { useMutation } from "@tanstack/react-query";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const STATUSES = [
  { value: "nuova", label: "Nuove", icon: Mail },
  { value: "presa_in_carico", label: "Prese in Carico", icon: Calendar },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("nuova");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    setSelectedBookingId(null);
  }, [location.key]);

  const { data: bookings, isLoading, refetch } = useQuery({
    queryKey: ["booking_requests", activeTab],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select("*")
        .eq("status", activeTab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["booking_counts"],
    queryFn: async () => {
      const results: Record<string, number> = {};
      for (const s of STATUSES) {
        const { count, error } = await supabase
          .from("booking_requests")
          .select("*", { count: "exact", head: true })
          .eq("status", s.value);
        if (!error) results[s.value] = count || 0;
      }
      return results;
    },
  });

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
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Aggiorna
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
