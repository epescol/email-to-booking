import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BedDouble, Trash2, Search, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useHotelLanguages, useLanguages } from "@/hooks/useLanguages";
import { RoomPhotoUpload } from "@/components/RoomPhotoUpload";
import { ConfirmDelete, useConfirmDelete } from "@/components/ConfirmDelete";

interface RoomForm {
  name: string;
  room_code: string;
  min_occupancy: number;
  max_occupancy: number;
  beds: string;
  site_url: string;
  photo_url_1: string;
  photo_url_2: string;
  photo_url_3: string;
  photo_url_4: string;
}

interface TranslationMap {
  [langCode: string]: string;
}

const emptyForm: RoomForm = {
  name: "", room_code: "", min_occupancy: 1, max_occupancy: 2, beds: "",
  site_url: "", photo_url_1: "", photo_url_2: "", photo_url_3: "", photo_url_4: "",
};

export default function Rooms() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const { data: hotelLanguages = [] } = useHotelLanguages(profile?.hotel_id);
  const { data: allLanguages = [] } = useLanguages();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [translations, setTranslations] = useState<TranslationMap>({});
  const [searchQuery, setSearchQuery] = useState("");
  const confirm = useConfirmDelete();

  const hotelLangs = hotelLanguages
    .map(hl => {
      const lang = allLanguages.find(l => l.code === hl.language_code);
      return lang ? { ...hl, name: lang.name } : null;
    })
    .filter(Boolean) as (typeof hotelLanguages[0] & { name: string })[];

  const defaultLang = hotelLangs.find(l => l.is_default);

  const { data: rooms, isLoading } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const fetchTranslations = async (roomId: string): Promise<TranslationMap> => {
    const { data, error } = await supabase
      .from("room_translations" as any)
      .select("*")
      .eq("room_id", roomId);
    if (error) return {};
    const map: TranslationMap = {};
    (data as unknown as { language_code: string; name: string }[]).forEach(t => {
      map[t.language_code] = t.name;
    });
    return map;
  };

  const saveMutation = useMutation({
    mutationFn: async (data: RoomForm) => {
      if (!profile?.hotel_id) throw new Error("Nessun hotel associato");
      let roomId = editingId;
      if (editingId) {
        const { error } = await supabase.from("rooms").update(data).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: newRoom, error } = await supabase.from("rooms").insert({ ...data, hotel_id: profile.hotel_id }).select("id").single();
        if (error) throw error;
        roomId = newRoom.id;
      }
      if (roomId) {
        await supabase.from("room_translations" as any).delete().eq("room_id", roomId);
        const rows = Object.entries(translations)
          .filter(([, name]) => name.trim())
          .map(([code, name]) => ({ room_id: roomId, language_code: code, name: name.trim() }));
        if (rows.length > 0) {
          await supabase.from("room_translations" as any).insert(rows);
        }
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Camera aggiornata" : "Camera creata");
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setTranslations({});
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rooms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Camera eliminata");
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const openEdit = async (room: NonNullable<typeof rooms>[0]) => {
    setEditingId(room.id);
    setForm({
      name: room.name,
      room_code: room.room_code || "",
      min_occupancy: room.min_occupancy,
      max_occupancy: room.max_occupancy,
      beds: room.beds || "",
      site_url: room.site_url || "",
      photo_url_1: room.photo_url_1 || "",
      photo_url_2: room.photo_url_2 || "",
      photo_url_3: room.photo_url_3 || "",
      photo_url_4: room.photo_url_4 || "",
    });
    const trans = await fetchTranslations(room.id);
    setTranslations(trans);
    setDialogOpen(true);
  };

  const nonDefaultLangs = hotelLangs.filter(l => !l.is_default);

  const filteredRooms = rooms?.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return r.name.toLowerCase().includes(q) || (r.room_code || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Camere</h1>
          <p className="text-muted-foreground text-sm">
            {rooms?.length || 0} {rooms?.length === 1 ? "camera" : "camere"} configurate
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setEditingId(null); setForm(emptyForm); setTranslations({}); }
        }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nuova Camera</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Modifica Camera" : "Nuova Camera"}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }}
            >
              <div className="space-y-2">
                <Label>
                  Nome Camera
                  {defaultLang && <span className="text-muted-foreground text-xs ml-1">({defaultLang.name})</span>}
                </Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              {nonDefaultLangs.length > 0 && (
                <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                  <Label className="text-xs text-muted-foreground">Traduzioni nome camera</Label>
                  {nonDefaultLangs.map(lang => (
                    <div key={lang.language_code} className="space-y-1">
                      <Label className="text-xs">{lang.name} <span className="font-mono uppercase text-muted-foreground">({lang.language_code})</span></Label>
                      <Input
                        value={translations[lang.language_code] || ""}
                        onChange={(e) => setTranslations({ ...translations, [lang.language_code]: e.target.value })}
                        placeholder={`Nome in ${lang.name}...`}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label>Codice Camera (per mapping XML email)</Label>
                <Input value={form.room_code} onChange={(e) => setForm({ ...form, room_code: e.target.value })} placeholder="es. DBL-101, suite-panoramica" className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">Inserisci lo stesso codice usato sul sito web dell'hotel</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Occ. Min</Label>
                  <Input type="number" min={1} value={form.min_occupancy} onChange={(e) => setForm({ ...form, min_occupancy: +e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Occ. Max</Label>
                  <Input type="number" min={1} value={form.max_occupancy} onChange={(e) => setForm({ ...form, max_occupancy: +e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Letti</Label>
                <Input value={form.beds} onChange={(e) => setForm({ ...form, beds: e.target.value })} placeholder="es. 1 matrimoniale + 1 singolo" />
              </div>
              <div className="space-y-2">
                <Label>URL Pagina Sito</Label>
                <Input value={form.site_url} onChange={(e) => setForm({ ...form, site_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label>Foto (max 4)</Label>
                <RoomPhotoUpload
                  photos={[form.photo_url_1, form.photo_url_2, form.photo_url_3, form.photo_url_4]}
                  onPhotosChange={(photos) => setForm({
                    ...form,
                    photo_url_1: photos[0] || "",
                    photo_url_2: photos[1] || "",
                    photo_url_3: photos[2] || "",
                    photo_url_4: photos[3] || "",
                  })}
                  roomId={editingId || undefined}
                  hotelId={profile?.hotel_id || undefined}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cerca camera o codice..."
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
              <div className="animate-pulse">Caricamento camere...</div>
            </div>
          ) : !filteredRooms?.length ? (
            <div className="p-12 text-center">
              <BedDouble className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                {searchQuery ? "Nessun risultato trovato" : "Nessuna camera configurata"}
              </p>
              {!searchQuery && (
                <p className="text-xs text-muted-foreground mt-1">Aggiungi la prima camera per iniziare</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Nome</TableHead>
                  <TableHead>Codice</TableHead>
                  <TableHead>Occupazione</TableHead>
                  <TableHead>Letti</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRooms.map((room) => (
                  <TableRow
                    key={room.id}
                    className="cursor-pointer group"
                    onClick={() => openEdit(room)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {room.photo_url_1 ? (
                          <img
                            src={room.photo_url_1}
                            alt={room.name}
                            className="h-9 w-9 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                            <BedDouble className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        )}
                        <span className="font-medium text-sm">{room.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {room.room_code ? (
                        <span className="font-mono text-xs text-muted-foreground">{room.room_code}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {room.min_occupancy}–{room.max_occupancy} pax
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {room.beds || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => { e.stopPropagation(); confirm.requestDelete(room.id); }}
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
        open={confirm.isOpen}
        onOpenChange={(open) => !open && confirm.cancelDelete()}
        onConfirm={() => { if (confirm.deleteId) deleteMutation.mutate(confirm.deleteId); confirm.cancelDelete(); }}
        title="Eliminare camera?"
        description="La camera verrà eliminata insieme ai relativi prezzi. Questa azione non può essere annullata."
      />
    </div>
  );
}
