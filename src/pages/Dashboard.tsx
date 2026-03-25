import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Inbox, Trash2, Calendar, ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { BookingDetail } from "@/components/BookingDetail";
import { ConfirmDelete, useConfirmDelete } from "@/components/ConfirmDelete";

const STATUSES = [
  { value: "all", label: "Tutte" },
  { value: "nuova", label: "Nuove" },
  { value: "presa_in_carico", label: "In lavorazione" },
  { value: "archiviata", label: "Archiviate" },
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    nuova: "bg-info",
    presa_in_carico: "bg-warning",
    archiviata: "bg-muted-foreground/50",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] || "bg-muted-foreground"}`} />;
}

function StatusLabel({ status }: { status: string }) {
  const labels: Record<string, { text: string; className: string }> = {
    nuova: { text: "Nuova", className: "status-nuova" },
    presa_in_carico: { text: "In lavorazione", className: "status-offerta" },
    archiviata: { text: "Archiviata", className: "bg-muted text-muted-foreground border-border" },
  };
  const config = labels[status] || { text: status, className: "" };
  return (
    <Badge variant="outline" className={`text-xs font-medium ${config.className}`}>
      {config.text}
    </Badge>
  );
}

function NightsLabel({ checkIn, checkOut }: { checkIn: string | null; checkOut: string | null }) {
  if (!checkIn || !checkOut) return null;
  const nights = differenceInDays(new Date(checkOut), new Date(checkIn));
  if (nights <= 0) return null;
  return (
    <span className="text-xs text-muted-foreground ml-1">
      ({nights} {nights === 1 ? "notte" : "notti"})
    </span>
  );
}

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const { deleteId, requestDelete, cancelDelete, isOpen } = useConfirmDelete();
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    setSelectedBookingId(null);
  }, [location.key]);

  const { data: allBookings, isLoading, refetch } = useQuery({
    queryKey: ["booking_requests_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("booking_accommodations").delete().eq("request_id", id);
      await supabase.from("booking_messages").delete().eq("request_id", id);
      const { error } = await supabase.from("booking_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Richiesta eliminata");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleRefresh = () => {
    refetch();
    toast.success("Dati aggiornati");
  };

  // Filter and search
  const filteredBookings = allBookings?.filter((b) => {
    if (activeFilter === "all" && b.status === "archiviata") return false;
    if (activeFilter !== "all" && b.status !== activeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const fullName = `${b.first_name || ""} ${b.last_name || ""}`.toLowerCase();
      const email = (b.email || "").toLowerCase();
      return fullName.includes(q) || email.includes(q);
    }
    return true;
  });

  // Counts
  const counts = allBookings?.reduce((acc, b) => {
    acc[b.status] = (acc[b.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};
  const totalCount = allBookings?.length ?? 0;

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
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Richieste</h1>
          <p className="text-muted-foreground text-sm">
            {totalCount} {totalCount === 1 ? "richiesta" : "richieste"} totali
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Aggiorna
        </Button>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
          {STATUSES.map((s) => {
            const count = s.value === "all" ? totalCount : (counts[s.value] || 0);
            const isActive = activeFilter === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setActiveFilter(s.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.value !== "all" && <StatusDot status={s.value} />}
                {s.label}
                <span className={`text-xs ml-0.5 ${isActive ? "text-foreground" : "text-muted-foreground/60"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca ospite o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground">
              <div className="animate-pulse">Caricamento richieste...</div>
            </div>
          ) : !filteredBookings?.length ? (
            <div className="p-12 text-center">
              <Inbox className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                {searchQuery ? "Nessun risultato trovato" : "Nessuna richiesta"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Ospite</TableHead>
                  <TableHead>Soggiorno</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Ricevuta</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.map((b) => (
                  <TableRow
                    key={b.id}
                    className="cursor-pointer group"
                    onClick={() => setSelectedBookingId(b.id)}
                  >
                    <TableCell className="pr-0">
                      <StatusDot status={b.status} />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">
                          {b.first_name} {b.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{b.email || "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {b.check_in && b.check_out ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>
                            {format(new Date(b.check_in), "dd MMM", { locale: it })}
                            {" → "}
                            {format(new Date(b.check_out), "dd MMM yyyy", { locale: it })}
                          </span>
                          <NightsLabel checkIn={b.check_in} checkOut={b.check_out} />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusLabel status={b.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(b.created_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); requestDelete(b.id); }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDelete
        open={isOpen}
        onOpenChange={(open) => { if (!open) cancelDelete(); }}
        onConfirm={() => { if (deleteId) { deleteMutation.mutate(deleteId); cancelDelete(); } }}
        title="Elimina richiesta"
        description="Sei sicuro di voler eliminare questa richiesta? Verranno eliminati anche tutti i messaggi e le camere associate."
      />
    </div>
  );
}
