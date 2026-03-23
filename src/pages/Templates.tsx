import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Mail, Pencil, Trash2, Eye } from "lucide-react";
import { WysiwygEditor } from "@/components/WysiwygEditor";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

export default function Templates() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", subject_template: "", body_template: "" });

  const { data: templates, isLoading } = useQuery({
    queryKey: ["offer_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.hotel_id) throw new Error("Nessun hotel associato");
      if (editingId) {
        const { error } = await supabase.from("offer_templates").update(form).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("offer_templates").insert({ ...form, hotel_id: profile.hotel_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Template aggiornato" : "Template creato");
      queryClient.invalidateQueries({ queryKey: ["offer_templates"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ name: "", subject_template: "", body_template: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offer_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template eliminato");
      queryClient.invalidateQueries({ queryKey: ["offer_templates"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Template Email</h1>
          <p className="text-muted-foreground text-sm">Modelli per le offerte da inviare</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingId(null); setForm({ name: "", subject_template: "", body_template: "" }); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuovo Template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifica Template" : "Nuovo Template"}</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
              <div className="space-y-2">
                <Label>Nome Template</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Oggetto Email</Label>
                <Input value={form.subject_template} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} placeholder="Offerta per il soggiorno dal {{check_in}} al {{check_out}}" />
              </div>
              <div className="space-y-2">
                <Label>Corpo Email</Label>
                <Textarea rows={8} value={form.body_template} onChange={(e) => setForm({ ...form, body_template: e.target.value })} required placeholder="Gentile {{nome}},..." />
              </div>
              <p className="text-xs text-muted-foreground">Variabili disponibili: {"{{nome}}, {{cognome}}, {{check_in}}, {{check_out}}, {{prezzo}}"}</p>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>Salva</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground p-8">Caricamento...</div>
      ) : !templates?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Mail className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Nessun template creato</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} className="group">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {t.name}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      setEditingId(t.id);
                      setForm({ name: t.name, subject_template: t.subject_template || "", body_template: t.body_template });
                      setDialogOpen(true);
                    }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {t.subject_template && <p className="text-sm font-medium text-muted-foreground mb-1">📧 {t.subject_template}</p>}
                <p className="text-sm text-muted-foreground line-clamp-3">{t.body_template}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
