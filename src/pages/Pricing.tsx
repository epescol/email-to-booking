import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Euro, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import TreatmentsManager, { useTreatments } from "@/components/TreatmentsManager";

type PricingMode = "per_room" | "per_occupancy";

export default function Pricing() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ start_date: "", end_date: "" });
  const [confirmModeChange, setConfirmModeChange] = useState<PricingMode | null>(null);

  const { data: hotel } = useQuery({
    queryKey: ["hotel_pricing_mode", profile?.hotel_id],
    queryFn: async () => {
      if (!profile?.hotel_id) return null;
      const { data, error } = await supabase
        .from("hotels").select("id, pricing_mode").eq("id", profile.hotel_id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.hotel_id,
  });

  const pricingMode: PricingMode = (hotel?.pricing_mode as PricingMode) || "per_room";

  const { data: periods } = useQuery({
    queryKey: ["price_periods"],
    queryFn: async () => {
      const { data, error } = await supabase.from("price_periods").select("*").order("start_date");
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: treatments } = useTreatments(profile?.hotel_id ?? undefined);
  const enabledTreatments = treatments?.filter(t => t.enabled) ?? [];

  const { data: prices } = useQuery({
    queryKey: ["room_prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("room_prices").select("*");
      if (error) throw error;
      return data;
    },
  });

  const createPeriod = useMutation({
    mutationFn: async () => {
      const name = `${periodForm.start_date} - ${periodForm.end_date}`;
      const { error } = await supabase.from("price_periods").insert({ name, start_date: periodForm.start_date, end_date: periodForm.end_date, hotel_id: profile.hotel_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Periodo creato");
      queryClient.invalidateQueries({ queryKey: ["price_periods"] });
      setDialogOpen(false);
      setPeriodForm({ start_date: "", end_date: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePeriod = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_periods").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Periodo eliminato");
      queryClient.invalidateQueries({ queryKey: ["price_periods"] });
      queryClient.invalidateQueries({ queryKey: ["room_prices"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePrice = useMutation({
    mutationFn: async ({
      roomId, periodId, price, occupancy, treatmentId,
    }: {
      roomId: string; periodId: string; price: number; occupancy: number | null; treatmentId: string | null;
    }) => {
      const existing = prices?.find(
        (p) =>
          p.room_id === roomId &&
          p.period_id === periodId &&
          (occupancy === null ? p.occupancy === null : p.occupancy === occupancy) &&
          (treatmentId === null ? p.treatment_id === null : p.treatment_id === treatmentId)
      );
      if (existing) {
        const { error } = await supabase.from("room_prices").update({ price_per_night: price }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("room_prices").insert({
          room_id: roomId, period_id: periodId, price_per_night: price, occupancy, treatment_id: treatmentId,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["room_prices"] }),
    onError: (e) => toast.error(e.message),
  });

  const changePricingMode = useMutation({
    mutationFn: async (newMode: PricingMode) => {
      if (!profile?.hotel_id) throw new Error("Nessun hotel associato");
      const { error: deleteError } = await supabase
        .from("room_prices").delete().in("room_id", (rooms ?? []).map((r) => r.id));
      if (deleteError) throw deleteError;
      const { error } = await supabase.from("hotels").update({ pricing_mode: newMode }).eq("id", profile.hotel_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Modalità prezzi aggiornata. Tutti i prezzi sono stati azzerati.");
      queryClient.invalidateQueries({ queryKey: ["hotel_pricing_mode"] });
      queryClient.invalidateQueries({ queryKey: ["room_prices"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleModeChangeRequest = (newMode: PricingMode) => {
    if (newMode === pricingMode) return;
    if (prices && prices.length > 0) {
      setConfirmModeChange(newMode);
    } else {
      changePricingMode.mutate(newMode);
    }
  };

  const getPrice = (roomId: string, periodId: string, occupancy: number | null = null, treatmentId: string | null = null) => {
    return prices?.find(
      (p) =>
        p.room_id === roomId &&
        p.period_id === periodId &&
        (occupancy === null ? p.occupancy === null : p.occupancy === occupancy) &&
        (treatmentId === null ? p.treatment_id === null : p.treatment_id === treatmentId)
    )?.price_per_night;
  };

  const hasTreatments = enabledTreatments.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Listino Prezzi</h1>
          <p className="text-muted-foreground text-sm">Gestisci periodi e prezzi per camera</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Modalità:</Label>
            <Select value={pricingMode} onValueChange={(v) => handleModeChangeRequest(v as PricingMode)}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_room">A persona</SelectItem>
                <SelectItem value="per_occupancy">A occupazione</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Nuovo Periodo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuovo Periodo</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createPeriod.mutate(); }}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Inizio</Label>
                    <Input type="date" value={periodForm.start_date} onChange={(e) => setPeriodForm({ ...periodForm, start_date: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Fine</Label>
                    <Input type="date" value={periodForm.end_date} onChange={(e) => setPeriodForm({ ...periodForm, end_date: e.target.value })} required />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createPeriod.isPending}>Salva</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Confirm mode change */}
      <AlertDialog open={!!confirmModeChange} onOpenChange={(open) => !open && setConfirmModeChange(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />Cambiare modalità prezzi?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Passando alla modalità "{confirmModeChange === "per_room" ? "A persona" : "A occupazione"}",{" "}
              <strong>tutti i prezzi esistenti verranno eliminati</strong> e dovrai reinserirli.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmModeChange) changePricingMode.mutate(confirmModeChange); setConfirmModeChange(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Conferma e azzera prezzi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Treatments manager */}
      <TreatmentsManager />

      {!periods?.length || !rooms?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Euro className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {!rooms?.length ? "Crea prima delle camere" : "Aggiungi un periodo per iniziare"}
            </p>
          </CardContent>
        </Card>
      ) : pricingMode === "per_room" ? (
        <PerPersonPriceTable
          rooms={rooms} periods={periods} treatments={enabledTreatments}
          getPrice={getPrice} updatePrice={updatePrice} deletePeriod={deletePeriod}
        />
      ) : (
        <PerOccupancyPriceTable
          rooms={rooms} periods={periods} treatments={enabledTreatments}
          getPrice={getPrice} updatePrice={updatePrice} deletePeriod={deletePeriod}
        />
      )}
    </div>
  );
}

// --- Shared period header ---
function PeriodHeaders({ periods, deletePeriod }: { periods: any[]; deletePeriod: any }) {
  const confirm = useConfirmDelete();
  return (
    <>
      {periods.map((p) => (
        <TableHead key={p.id} className="text-center min-w-[140px]">
          <div className="flex items-center justify-center gap-1">
            <div className="text-xs">
              {format(new Date(p.start_date), "dd/MM/yyyy")} - {format(new Date(p.end_date), "dd/MM/yyyy")}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => confirm.requestDelete(p.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableHead>
      ))}
      <ConfirmDelete
        open={confirm.isOpen}
        onOpenChange={(open) => !open && confirm.cancelDelete()}
        onConfirm={() => { if (confirm.deleteId) deletePeriod.mutate(confirm.deleteId); confirm.cancelDelete(); }}
        title="Eliminare periodo?"
        description="Il periodo verrà eliminato insieme a tutti i prezzi associati. Questa azione non può essere annullata."
      />
    </>
  );
}
  return (
    <>
      {periods.map((p) => (
        <TableHead key={p.id} className="text-center min-w-[140px]">
          <div className="flex items-center justify-center gap-1">
            <div className="text-xs">
              {format(new Date(p.start_date), "dd/MM/yyyy")} - {format(new Date(p.end_date), "dd/MM/yyyy")}
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deletePeriod.mutate(p.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableHead>
      ))}
    </>
  );
}

// --- Price input cell ---
function PriceInput({ roomId, periodId, occupancy, treatmentId, getPrice, updatePrice }: {
  roomId: string; periodId: string; occupancy: number | null; treatmentId: string | null;
  getPrice: (r: string, p: string, o: number | null, t: string | null) => number | undefined;
  updatePrice: any;
}) {
  return (
    <Input
      type="number" step="0.01" min="0"
      className="w-24 mx-auto text-center" placeholder="€"
      defaultValue={getPrice(roomId, periodId, occupancy, treatmentId)?.toString() || ""}
      onBlur={(e) => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) {
          updatePrice.mutate({ roomId, periodId, price: val, occupancy, treatmentId });
        }
      }}
    />
  );
}

// --- Per Person table ---
function PerPersonPriceTable({ rooms, periods, treatments, getPrice, updatePrice, deletePeriod }: {
  rooms: any[]; periods: any[]; treatments: any[];
  getPrice: (r: string, p: string, o: number | null, t: string | null) => number | undefined;
  updatePrice: any; deletePeriod: any;
}) {
  const hasTreatments = treatments.length > 0;

  // Build rows: each room × each treatment (or just room if no treatments)
  const rows: { room: any; treatment: any | null; isFirstOfRoom: boolean; roomRowSpan: number }[] = [];
  for (const room of rooms) {
    if (hasTreatments) {
      treatments.forEach((t, i) => {
        rows.push({ room, treatment: t, isFirstOfRoom: i === 0, roomRowSpan: treatments.length });
      });
    } else {
      rows.push({ room, treatment: null, isFirstOfRoom: true, roomRowSpan: 1 });
    }
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card z-10">Camera</TableHead>
              {hasTreatments && <TableHead className="text-center w-[160px]">Trattamento</TableHead>}
              <PeriodHeaders periods={periods} deletePeriod={deletePeriod} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow key={`${row.room.id}-${row.treatment?.id ?? 'none'}`} className={row.isFirstOfRoom ? "border-t-2 border-border" : ""}>
                {row.isFirstOfRoom && (
                  <TableCell className="font-medium sticky left-0 bg-card z-10 align-middle" rowSpan={row.roomRowSpan}>
                    {row.room.name}
                  </TableCell>
                )}
                {hasTreatments && (
                  <TableCell className="text-center text-sm text-muted-foreground">{row.treatment.name}</TableCell>
                )}
                {periods.map((period) => (
                  <TableCell key={period.id} className="text-center">
                    <PriceInput roomId={row.room.id} periodId={period.id} occupancy={null} treatmentId={row.treatment?.id ?? null} getPrice={getPrice} updatePrice={updatePrice} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// --- Per Occupancy table ---
function PerOccupancyPriceTable({ rooms, periods, treatments, getPrice, updatePrice, deletePeriod }: {
  rooms: any[]; periods: any[]; treatments: any[];
  getPrice: (r: string, p: string, o: number | null, t: string | null) => number | undefined;
  updatePrice: any; deletePeriod: any;
}) {
  const hasTreatments = treatments.length > 0;

  // Build rows: room × occupancy × treatment
  const rows: {
    room: any; occupancy: number; treatment: any | null;
    isFirstOfRoom: boolean; roomRowSpan: number;
    isFirstOfOccGroup: boolean; occGroupSpan: number;
  }[] = [];

  for (const room of rooms) {
    const min = room.min_occupancy || 1;
    const max = room.max_occupancy || min;
    const occCount = max - min + 1;
    const treatCount = hasTreatments ? treatments.length : 1;
    const roomSpan = occCount * treatCount;

    for (let occ = min; occ <= max; occ++) {
      if (hasTreatments) {
        treatments.forEach((t, tIdx) => {
          rows.push({
            room, occupancy: occ, treatment: t,
            isFirstOfRoom: occ === min && tIdx === 0,
            roomRowSpan: roomSpan,
            isFirstOfOccGroup: tIdx === 0,
            occGroupSpan: treatCount,
          });
        });
      } else {
        rows.push({
          room, occupancy: occ, treatment: null,
          isFirstOfRoom: occ === min,
          roomRowSpan: roomSpan,
          isFirstOfOccGroup: true,
          occGroupSpan: 1,
        });
      }
    }
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card z-10">Camera</TableHead>
              <TableHead className="text-center w-[80px]">Occ.</TableHead>
              {hasTreatments && <TableHead className="text-center w-[160px]">Trattamento</TableHead>}
              <PeriodHeaders periods={periods} deletePeriod={deletePeriod} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.room.id}-${row.occupancy}-${row.treatment?.id ?? 'none'}`} className={row.isFirstOfRoom ? "border-t-2 border-border" : ""}>
                {row.isFirstOfRoom && (
                  <TableCell className="font-medium sticky left-0 bg-card z-10 align-middle" rowSpan={row.roomRowSpan}>
                    {row.room.name}
                  </TableCell>
                )}
                {row.isFirstOfOccGroup && (
                  <TableCell className="text-center text-sm text-muted-foreground" rowSpan={row.occGroupSpan}>
                    {row.occupancy} pers.
                  </TableCell>
                )}
                {hasTreatments && (
                  <TableCell className="text-center text-sm text-muted-foreground">{row.treatment.name}</TableCell>
                )}
                {periods.map((period) => (
                  <TableCell key={period.id} className="text-center">
                    <PriceInput roomId={row.room.id} periodId={period.id} occupancy={row.occupancy} treatmentId={row.treatment?.id ?? null} getPrice={getPrice} updatePrice={updatePrice} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
