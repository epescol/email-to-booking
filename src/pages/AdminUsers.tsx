import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useProfile";

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  hotel_id: string | null;
  user_roles: { role: string }[];
  hotels: { name: string } | null;
}

interface UserFormData {
  email: string;
  password: string;
  display_name: string;
  role: string;
}

const emptyForm: UserFormData = { email: "", password: "", display_name: "", role: "user" };

async function callAdminUsers(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await supabase.functions.invoke("admin-users", {
    body: { action, ...payload },
  });
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { data: roles } = useUserRoles(user?.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<UserFormData>(emptyForm);

  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: () => callAdminUsers("list"),
    enabled: isAdmin,
  });

  // Hotels list no longer needed for dropdown

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingUser) {
        return callAdminUsers("update", {
          user_id: editingUser.user_id,
          email: form.email,
          display_name: form.display_name,
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
      } else {
        return callAdminUsers("create", {
          email: form.email,
          password: form.password,
          display_name: form.display_name,
          role: form.role,
        });
      }
    },
    onSuccess: () => {
      toast.success(editingUser ? "Utente aggiornato" : "Utente creato");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => callAdminUsers("delete", { user_id: deletingUser!.user_id }),
    onSuccess: () => {
      toast.success("Utente eliminato. Lo storico delle prenotazioni è stato preservato.");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteDialogOpen(false);
      setDeletingUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditingUser(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(u: UserProfile) {
    setEditingUser(u);
    setForm({
      email: u.email || "",
      password: "",
      display_name: u.display_name || "",
      role: u.user_roles?.[0]?.role || "user",
    });
    setDialogOpen(true);
  }

  function openDelete(u: UserProfile) {
    setDeletingUser(u);
    setDeleteDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Accesso non autorizzato
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestione Utenti</h1>
          <p className="text-muted-foreground text-sm">Crea, modifica ed elimina gli utenti del sistema</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Utente
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">Nessun utente trovato</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Hotel</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead className="w-[100px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{u.hotels?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.user_roles?.[0]?.role === "admin" ? "default" : "secondary"}>
                        {u.user_roles?.[0]?.role || "user"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDelete(u)}
                          disabled={u.user_id === user?.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "Modifica Utente" : "Nuovo Utente"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Modifica i dati dell'utente selezionato" : "Compila i campi per creare un nuovo utente"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome visualizzato</Label>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{editingUser ? "Nuova password (lascia vuoto per non cambiarla)" : "Password"}</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Ruolo</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annulla</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.email || (!editingUser && !form.password)}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingUser ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare l'utente?</AlertDialogTitle>
            <AlertDialogDescription>
              L'utente <strong>{deletingUser?.display_name || deletingUser?.email}</strong> verrà eliminato.
              Lo storico delle prenotazioni, conversazioni e richieste verrà preservato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
