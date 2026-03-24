import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, GripVertical, Utensils } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export function useTreatments(hotelId: string | undefined) {
  return useQuery({
    queryKey: ["treatments", hotelId],
    queryFn: async () => {
      if (!hotelId) return [];
      const { data, error } = await supabase
        .from("treatments")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!hotelId,
  });
}

export default function TreatmentsManager() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const { data: treatments } = useTreatments(profile?.hotel_id ?? undefined);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const addTreatment = useMutation({
    mutationFn: async () => {
      if (!profile?.hotel_id || !newName.trim()) throw new Error("Nome richiesto");
      const maxSort = treatments?.length ? Math.max(...treatments.map(t => t.sort_order)) + 1 : 0;
      const { error } = await supabase.from("treatments").insert({
        hotel_id: profile.hotel_id,
        name: newName.trim(),
        treatment_code: newCode.trim() || null,
        sort_order: maxSort,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trattamento aggiunto");
      setNewName("");
      setNewCode("");
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleTreatment = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("treatments").update({ enabled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["treatments"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTreatment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("treatments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Trattamento eliminato");
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      queryClient.invalidateQueries({ queryKey: ["room_prices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Utensils className="h-4 w-4" /> Trattamenti
        </CardTitle>
        <CardDescription>
          Gestisci i trattamenti disponibili (es. B&B, Mezza Pensione). Solo quelli attivi appariranno nel listino.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {treatments?.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-1">
            <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">{t.name}</span>
              {(t as any).treatment_code && (
                <span className="ml-2 text-xs text-muted-foreground font-mono">({(t as any).treatment_code})</span>
              )}
            </div>
            <Switch
              checked={t.enabled}
              onCheckedChange={(v) => toggleTreatment.mutate({ id: t.id, enabled: v })}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => deleteTreatment.mutate(t.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <form
          className="flex items-center gap-2 pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            addTreatment.mutate();
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nuovo trattamento (es. Mezza Pensione)"
            className="flex-1"
          />
          <Button type="submit" size="sm" disabled={!newName.trim() || addTreatment.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
