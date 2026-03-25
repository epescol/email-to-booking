import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BedDouble, Pencil, Trash2 } from "lucide-react";
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
  const confirm = useConfirmDelete();

  // Get language names for display
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

  // Fetch translations for a specific room
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

      // Save translations
      if (roomId) {
        await supabase.from("room_translations" as any).delete().eq("room_id", roomId);
        const rows = Object.entries(translations)
          .filter(([_, name]) => name.trim())
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

  // Non-default languages for translation inputs
  const nonDefaultLangs = hotelLangs.filter(l => !l.is_default);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Camere</h1>
          <p className="text-muted-foreground text-sm">Gestisci le camere del tuo hotel</p>
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

              {/* Translation inputs for non-default languages */}
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
                />
              </div>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvataggio..." : "Salva"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground p-8">Caricamento...</div>
      ) : !rooms?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BedDouble className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">Nessuna camera configurata</p>
            <p className="text-sm text-muted-foreground">Aggiungi la prima camera per iniziare</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <Card key={room.id} className="group">
              {room.photo_url_1 && (
                <div className="aspect-video overflow-hidden rounded-t-lg">
                  <img src={room.photo_url_1} alt={room.name} className="w-full h-full object-cover" />
                </div>
              )}
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  {room.name}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(room)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => confirm.requestDelete(room.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>Occupazione: {room.min_occupancy}-{room.max_occupancy} persone</p>
                {room.room_code && <p className="font-mono text-xs">Codice: {room.room_code}</p>}
                {room.beds && <p>Letti: {room.beds}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
