import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Euro } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { format } from "date-fns";

export default function Pricing() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [periodForm, setPeriodForm] = useState({ name: "", start_date: "", end_date: "" });

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
      if (!profile?.hotel_id) throw new Error("Nessun hotel associato");
      const { error } = await supabase.from("price_periods").insert({
        ...periodForm,
        hotel_id: profile.hotel_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Periodo creato");
      queryClient.invalidateQueries({ queryKey: ["price_periods"] });
      setDialogOpen(false);
      setPeriodForm({ name: "", start_date: "", end_date: "" });
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
    mutationFn: async ({ roomId, periodId, price }: { roomId: string; periodId: string; price: number }) => {
      const existing = prices?.find((p) => p.room_id === roomId && p.period_id === periodId);
      if (existing) {
        const { error } = await supabase.from("room_prices").update({ price_per_night: price }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("room_prices").insert({ room_id: roomId, period_id: periodId, price_per_night: price });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["room_prices"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const getPrice = (roomId: string, periodId: string) => {
    return prices?.find((p) => p.room_id === roomId && p.period_id === periodId)?.price_per_night;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Listino Prezzi</h1>
          <p className="text-muted-foreground text-sm">Gestisci periodi e prezzi per camera</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuovo Periodo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo Periodo</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createPeriod.mutate(); }}>
              <div className="space-y-2">
                <Label>Nome Periodo</Label>
                <Input value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} required placeholder="es. Alta Stagione" />
              </div>
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

      {!periods?.length || !rooms?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Euro className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">
              {!rooms?.length ? "Crea prima delle camere" : "Aggiungi un periodo per iniziare"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10">Camera</TableHead>
                  {periods.map((p) => (
                    <TableHead key={p.id} className="text-center min-w-[140px]">
                      <div className="flex items-center justify-center gap-1">
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(p.start_date), "dd/MM")} - {format(new Date(p.end_date), "dd/MM")}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deletePeriod.mutate(p.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium sticky left-0 bg-card z-10">{room.name}</TableCell>
                    {periods.map((period) => (
                      <TableCell key={period.id} className="text-center">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24 mx-auto text-center"
                          placeholder="€"
                          defaultValue={getPrice(room.id, period.id)?.toString() || ""}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              updatePrice.mutate({ roomId: room.id, periodId: period.id, price: val });
                            }
                          }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
