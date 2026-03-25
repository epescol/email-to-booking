import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Languages, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useProfile";
import { ConfirmDelete, useConfirmDelete } from "@/components/ConfirmDelete";

interface LanguageForm {
  code: string;
  name: string;
}

const emptyForm: LanguageForm = { code: "", name: "" };

export default function AdminLanguages() {
  const { user } = useAuth();
  const { data: roles } = useUserRoles(user?.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<LanguageForm>(emptyForm);
  const confirm = useConfirmDelete();

  const { data: languages = [], isLoading } = useQuery({
    queryKey: ["languages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("languages" as any).select("*").order("name");
      if (error) throw error;
      return data as unknown as { code: string; name: string }[];
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("languages" as any).insert({ code: form.code.toLowerCase().trim(), name: form.name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lingua aggiunta");
      queryClient.invalidateQueries({ queryKey: ["languages"] });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (code: string) => {
      const { error } = await supabase.from("languages" as any).delete().eq("code", code);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lingua eliminata");
      queryClient.invalidateQueries({ queryKey: ["languages"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Accesso non autorizzato</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestione Lingue</h1>
          <p className="text-muted-foreground text-sm">Gestisci le lingue disponibili nel sistema</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuova Lingua
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : languages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Languages className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nessuna lingua configurata</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[80px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {languages.map((l) => (
                  <TableRow key={l.code}>
                    <TableCell className="font-mono uppercase">{l.code}</TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => confirm.requestDelete(l.code)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova Lingua</DialogTitle>
            <DialogDescription>Aggiungi una nuova lingua al sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Codice (es. it, de, en)</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={5} className="font-mono uppercase" />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es. Italiano" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.code || !form.name}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={confirm.isOpen}
        onOpenChange={(open) => !open && confirm.cancelDelete()}
        onConfirm={() => { if (confirm.deleteId) deleteMutation.mutate(confirm.deleteId); confirm.cancelDelete(); }}
        title="Eliminare lingua?"
        description="La lingua verrà rimossa dal sistema. I template e le traduzioni associate verranno eliminati."
      />
    </div>
  );
}
