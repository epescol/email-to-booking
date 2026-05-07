import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Plus, Pencil, Trash2, Loader2, ShieldCheck, Hotel } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useProfile";
import { useLanguages, useHotelLanguages } from "@/hooks/useLanguages";

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  hotel_id: string | null;
  user_roles: { role: string }[];
  hotels: { name: string } | null;
}

async function callAdminUsers(action: string, payload: Record<string, unknown> = {}) {
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

  const [activeTab, setActiveTab] = useState("hotels");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [dialogRole, setDialogRole] = useState<"user" | "admin">("user");
  

  // Form fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<{ code: string; isDefault: boolean }[]>([]);

  const { data: allLanguages = [] } = useLanguages();
  const { data: hotelLanguages = [] } = useHotelLanguages(editingUser?.hotel_id);

  useEffect(() => {
    if (editingUser && hotelLanguages.length > 0) {
      setSelectedLanguages(hotelLanguages.map(hl => ({ code: hl.language_code, isDefault: hl.is_default })));
    } else if (editingUser && hotelLanguages.length === 0) {
      setSelectedLanguages([]);
    }
  }, [editingUser?.user_id, hotelLanguages]);

  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: () => callAdminUsers("list"),
    enabled: isAdmin,
  });

  const adminUsers = users.filter(u => u.user_roles?.some(r => r.role === "admin"));
  const hotelUsers = users.filter(u => !u.user_roles?.some(r => r.role === "admin"));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingUser) {
        return callAdminUsers("update", {
          user_id: editingUser.user_id,
          email,
          display_name: displayName,
          role: dialogRole,
          ...(password ? { password } : {}),
        });
      } else {
        return callAdminUsers("create", {
          email,
          password,
          display_name: displayName,
          role: dialogRole,
        });
      }
    },
    onSuccess: async (data) => {
      // Save hotel languages only for hotel users
      if (dialogRole === "user") {
        const hotelId = editingUser?.hotel_id || data?.hotel_id;
        if (hotelId && selectedLanguages.length > 0) {
          await supabase.from("hotel_languages" as any).delete().eq("hotel_id", hotelId);
          const rows = selectedLanguages.map(sl => ({
            hotel_id: hotelId,
            language_code: sl.code,
            is_default: sl.isDefault,
          }));
          await supabase.from("hotel_languages" as any).insert(rows);
        }
      }
      toast.success(editingUser ? "Utente aggiornato" : "Utente creato");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["hotel_languages"] });
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => callAdminUsers("delete", { user_id: deletingUser!.user_id }),
    onSuccess: () => {
      toast.success("Utente eliminato.");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDeleteDialogOpen(false);
      setDeletingUser(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate(role: "user" | "admin") {
    setEditingUser(null);
    setDialogRole(role);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setSelectedLanguages(role === "user" ? [{ code: "it", isDefault: true }] : []);
    setDialogOpen(true);
  }

  function openEdit(u: UserProfile) {
    const role = u.user_roles?.[0]?.role === "admin" ? "admin" : "user";
    setEditingUser(u);
    setDialogRole(role as "user" | "admin");
    setEmail(u.email || "");
    setPassword("");
    setDisplayName(u.display_name || "");
    setDialogOpen(true);
  }

  function openDelete(u: UserProfile) {
    setDeletingUser(u);
    setDeleteDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingUser(null);
    setEmail("");
    setPassword("");
    setDisplayName("");
    setSelectedLanguages([]);
  }

  function toggleLanguage(code: string) {
    setSelectedLanguages(prev => {
      const exists = prev.find(l => l.code === code);
      if (exists) {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter(l => l.code !== code);
        if (exists.isDefault && filtered.length > 0) {
          filtered[0].isDefault = true;
        }
        return filtered;
      }
      return [...prev, { code, isDefault: prev.length === 0 }];
    });
  }

  function setDefaultLanguage(code: string) {
    setSelectedLanguages(prev =>
      prev.map(l => ({ ...l, isDefault: l.code === code }))
    );
  }

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Accesso non autorizzato</div>;
  }

  const isFormValid = email && (!editingUser ? password : true) && (dialogRole === "admin" || selectedLanguages.length > 0);

  const renderUserTable = (userList: UserProfile[], emptyMessage: string) => (
    <Card>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : userList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-[140px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userList.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openDelete(u)} disabled={u.user_id === user?.id}>
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
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestione Utenti</h1>
          <p className="text-muted-foreground text-sm">Crea, modifica ed elimina gli utenti del sistema</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="hotels" className="gap-2">
              <Hotel className="h-4 w-4" /> Hotel
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{hotelUsers.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="admins" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Amministratori
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{adminUsers.length}</Badge>
            </TabsTrigger>
          </TabsList>
          <Button onClick={() => openCreate(activeTab === "admins" ? "admin" : "user")}>
            <Plus className="h-4 w-4 mr-2" />
            {activeTab === "admins" ? "Nuovo Admin" : "Nuovo Hotel"}
          </Button>
        </div>

        <TabsContent value="hotels" className="mt-4">
          {renderUserTable(hotelUsers, "Nessun hotel trovato")}
        </TabsContent>

        <TabsContent value="admins" className="mt-4">
          {renderUserTable(adminUsers, "Nessun amministratore trovato")}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser
                ? (dialogRole === "admin" ? "Modifica Amministratore" : "Modifica Hotel")
                : (dialogRole === "admin" ? "Nuovo Amministratore" : "Nuovo Hotel")}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? "Modifica i dati dell'utente selezionato"
                : (dialogRole === "admin"
                  ? "Compila i campi per creare un nuovo amministratore"
                  : "Compila i campi per creare un nuovo hotel")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{dialogRole === "admin" ? "Nome" : "Nome Hotel"}</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{editingUser ? "Nuova password (lascia vuoto per non cambiarla)" : "Password"}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>

            {/* Languages — only for hotel users */}
            {dialogRole === "user" && (
              <div className="space-y-2">
                <Label>Lingue associate</Label>
                <p className="text-xs text-muted-foreground">Seleziona le lingue e indica quella predefinita</p>
                <div className="space-y-2 border rounded-md p-3">
                  {allLanguages.map((lang) => {
                    const selected = selectedLanguages.find(sl => sl.code === lang.code);
                    return (
                      <div key={lang.code} className="flex items-center gap-3">
                        <Checkbox
                          checked={!!selected}
                          onCheckedChange={() => toggleLanguage(lang.code)}
                        />
                        <span className="text-sm flex-1">{lang.name} <span className="text-muted-foreground font-mono text-xs uppercase">({lang.code})</span></span>
                        {selected && (
                          <Button
                            type="button"
                            variant={selected.isDefault ? "default" : "outline"}
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => setDefaultLanguage(lang.code)}
                          >
                            {selected.isDefault ? "Predefinita" : "Imposta predefinita"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {allLanguages.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nessuna lingua disponibile. Aggiungile dalla sezione Lingue.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annulla</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !isFormValid}
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
              L'utente <strong>{deletingUser?.display_name || deletingUser?.email}</strong> verrà eliminato
              {deletingUser?.user_roles?.[0]?.role !== "admin" && " insieme a tutti i dati dell'hotel associato"}.
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
