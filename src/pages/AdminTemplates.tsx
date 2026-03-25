import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Mail, Pencil, Trash2, Eye, ArrowLeft, Code, Type, Star } from "lucide-react";
import { WysiwygEditor } from "@/components/WysiwygEditor";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useProfile";
import { ConfirmDelete, useConfirmDelete } from "@/components/ConfirmDelete";
import RoomCardTemplateEditor from "@/components/RoomCardTemplateEditor";
import mjml2html from "mjml-browser";

export default function AdminTemplates() {
  const { user } = useAuth();
  const { data: roles } = useUserRoles(user?.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  const queryClient = useQueryClient();

  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: "", subject_template: "", body_template: "", mjml_source: "" });
  const [editorMode, setEditorMode] = useState<"wysiwyg" | "mjml">("wysiwyg");
  const [mjmlPreview, setMjmlPreview] = useState("");
  const [mjmlError, setMjmlError] = useState("");
  const confirm = useConfirmDelete();

  const compileMjml = useCallback((source: string) => {
    if (!source.trim()) {
      setMjmlPreview("");
      setMjmlError("");
      return;
    }
    try {
      const result = mjml2html(source, { validationLevel: "soft" });
      setMjmlPreview(result.html);
      setMjmlError("");
    } catch (e: any) {
      setMjmlError(e.message || "Errore di compilazione MJML");
      setMjmlPreview("");
    }
  }, []);

  const isEditorOpen = isCreating || !!editingId;

  // Fetch all hotels (admin can see all)
  const { data: hotels = [] } = useQuery({
    queryKey: ["admin-hotels-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotels").select("id, name, default_template_id").order("name");
      if (error) throw error;
      return data;
    },
    enabled: isAdmin,
  });

  const currentHotel = hotels.find(h => h.id === selectedHotelId);

  const setDefaultTemplateMutation = useMutation({
    mutationFn: async (templateId: string | null) => {
      const { error } = await supabase.from("hotels").update({ default_template_id: templateId } as any).eq("id", selectedHotelId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template predefinito aggiornato");
      queryClient.invalidateQueries({ queryKey: ["admin-hotels-templates"] });
    },
    onError: (e) => toast.error(e.message),
  });

  // Fetch templates for selected hotel
  const { data: templates, isLoading } = useQuery({
    queryKey: ["offer_templates", selectedHotelId],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_templates").select("*").eq("hotel_id", selectedHotelId).order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedHotelId,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedHotelId) throw new Error("Seleziona un hotel");
      let bodyToSave = form.body_template;
      if (editorMode === "mjml" && form.mjml_source.trim()) {
        try {
          const result = mjml2html(form.mjml_source, { validationLevel: "soft" });
          bodyToSave = result.html;
        } catch (e: any) {
          throw new Error("Errore compilazione MJML: " + e.message);
        }
      }
      const payload = {
        name: form.name,
        subject_template: form.subject_template,
        body_template: bodyToSave,
        mjml_source: editorMode === "mjml" ? form.mjml_source : null,
      } as any;
      if (editingId) {
        const { error } = await supabase.from("offer_templates").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("offer_templates").insert({ ...payload, hotel_id: selectedHotelId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Template aggiornato" : "Template creato");
      queryClient.invalidateQueries({ queryKey: ["offer_templates", selectedHotelId] });
      closeEditor();
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
      queryClient.invalidateQueries({ queryKey: ["offer_templates", selectedHotelId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const closeEditor = () => {
    setEditingId(null);
    setIsCreating(false);
    setForm({ name: "", subject_template: "", body_template: "", mjml_source: "" });
    setEditorMode("wysiwyg");
    setMjmlPreview("");
    setMjmlError("");
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setIsCreating(false);
    setForm({ name: t.name, subject_template: t.subject_template || "", body_template: t.body_template, mjml_source: t.mjml_source || "" });
    if (t.mjml_source) {
      setEditorMode("mjml");
      compileMjml(t.mjml_source);
    } else {
      setEditorMode("wysiwyg");
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setIsCreating(true);
    setForm({ name: "", subject_template: "", body_template: "", mjml_source: "" });
    setEditorMode("wysiwyg");
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Accesso non autorizzato
      </div>
    );
  }

  // Editor view
  if (isEditorOpen) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={closeEditor}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {editingId ? "Modifica Template" : "Nuovo Template"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {hotels.find(h => h.id === selectedHotelId)?.name}
            </p>
          </div>
        </div>

        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome Template</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Oggetto Email</Label>
              <Input value={form.subject_template} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} placeholder="Offerta per il soggiorno dal {{check_in}} al {{check_out}}" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Corpo Email</Label>
              <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                <Button type="button" variant={editorMode === "wysiwyg" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setEditorMode("wysiwyg")}>
                  <Type className="mr-1 h-3 w-3" />Visuale
                </Button>
                <Button type="button" variant={editorMode === "mjml" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => { setEditorMode("mjml"); if (form.mjml_source) compileMjml(form.mjml_source); }}>
                  <Code className="mr-1 h-3 w-3" />MJML
                </Button>
              </div>
            </div>

            {editorMode === "wysiwyg" ? (
              <WysiwygEditor content={form.body_template} onChange={(html) => setForm({ ...form, body_template: html })} placeholder="Scrivi il corpo del template..." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Codice MJML</Label>
                  <textarea
                    className="w-full min-h-[400px] font-mono text-xs p-3 rounded-md border border-input bg-background resize-y"
                    value={form.mjml_source}
                    onChange={(e) => { setForm({ ...form, mjml_source: e.target.value }); compileMjml(e.target.value); }}
                    spellCheck={false}
                    placeholder={`<mjml>\n  <mj-body>\n    <mj-section>\n      <mj-column>\n        <mj-text>Ciao {{nome}}!</mj-text>\n      </mj-column>\n    </mj-section>\n  </mj-body>\n</mjml>`}
                  />
                  {mjmlError && <p className="text-xs text-destructive">{mjmlError}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Anteprima HTML</Label>
                  <div className="border rounded-md bg-white min-h-[400px] overflow-auto">
                    {mjmlPreview ? (
                      <iframe srcDoc={mjmlPreview} className="w-full min-h-[400px] border-0" title="MJML Preview" />
                    ) : (
                      <div className="flex items-center justify-center h-[400px] text-muted-foreground text-sm">Scrivi codice MJML per vedere l'anteprima</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Variabili disponibili: {"{{nome}}, {{cognome}}, {{check_in}}, {{check_out}}, {{prezzo}}, {{camere}}, {{email_body}}"}
          </p>
          <p className="text-xs text-muted-foreground">
            <code className="bg-muted px-1 rounded">{"{{email_body}}"}</code> — Se presente, l'utente potrà inserire un testo libero tramite editor al momento dell'invio
          </p>

          <div className="flex gap-3">
            <Button type="submit" disabled={saveMutation.isPending}>Salva Template</Button>
            <Button type="button" variant="outline" onClick={closeEditor}>Annulla</Button>
          </div>
        </form>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestione Template</h1>
          <p className="text-muted-foreground text-sm">Gestisci i template email e la card camera per ogni hotel</p>
        </div>
      </div>

      {/* Hotel selector */}
      <div className="space-y-2 max-w-sm">
        <Label>Seleziona Hotel</Label>
        <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
          <SelectTrigger>
            <SelectValue placeholder="Scegli un hotel..." />
          </SelectTrigger>
          <SelectContent>
            {hotels.map(h => (
              <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedHotelId && (
        <>
          {/* Room Card Template */}
          <RoomCardTemplateEditor hotelId={selectedHotelId} />

          {/* Email Templates */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Template Email</h2>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuovo Template</Button>
          </div>

          {/* Default template selector */}
          {templates && templates.length > 0 && (
            <div className="flex items-center gap-3 max-w-sm">
              <Star className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Template predefinito</Label>
                <Select
                  value={currentHotel?.default_template_id || "__none__"}
                  onValueChange={(v) => setDefaultTemplateMutation.mutate(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nessuno</SelectItem>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center text-muted-foreground p-8">Caricamento...</div>
          ) : !templates?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">Nessun template creato per questo hotel</p>
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
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewId(t.id)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => confirm.requestDelete(t.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {t.subject_template && <p className="text-sm font-medium text-muted-foreground mb-1">📧 {t.subject_template}</p>}
                    <div className="text-sm text-muted-foreground line-clamp-3 [&_*]:text-sm [&_*]:text-muted-foreground" dangerouslySetInnerHTML={{ __html: t.body_template.substring(0, 300) }} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {templates && (
            <Dialog open={!!previewId} onOpenChange={(open) => { if (!open) setPreviewId(null); }}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Anteprima: {templates.find(t => t.id === previewId)?.name}</DialogTitle>
                </DialogHeader>
                <div className="border rounded-lg p-4 bg-white">
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: templates.find(t => t.id === previewId)?.body_template || "" }} />
                </div>
              </DialogContent>
            </Dialog>
          )}
          <ConfirmDelete
            open={confirm.isOpen}
            onOpenChange={(open) => !open && confirm.cancelDelete()}
            onConfirm={() => { if (confirm.deleteId) deleteMutation.mutate(confirm.deleteId); confirm.cancelDelete(); }}
            title="Eliminare template?"
            description="Il template verrà eliminato definitivamente. Questa azione non può essere annullata."
          />
        </>
      )}
    </div>
  );
}
