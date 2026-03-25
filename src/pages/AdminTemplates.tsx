import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Mail, Pencil, Trash2, Eye, ArrowLeft, Code, Type, Star, Globe, Copy } from "lucide-react";
import { WysiwygEditor } from "@/components/WysiwygEditor";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useProfile";
import { useLanguages, useHotelLanguages } from "@/hooks/useLanguages";
import { ConfirmDelete, useConfirmDelete } from "@/components/ConfirmDelete";
import RoomCardTemplateEditor from "@/components/RoomCardTemplateEditor";
import mjml2html from "mjml-browser";

interface OfferTemplate {
  id: string;
  hotel_id: string;
  name: string;
  subject_template: string | null;
  body_template: string;
  mjml_source: string | null;
  language: string | null;
  template_group_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminTemplates() {
  const { user } = useAuth();
  const { data: roles } = useUserRoles(user?.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  const queryClient = useQueryClient();
  const { data: allLanguages = [] } = useLanguages();

  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: "", subject_template: "", body_template: "", mjml_source: "", language: "it" });
  const [editorMode, setEditorMode] = useState<"wysiwyg" | "mjml">("wysiwyg");
  const [mjmlPreview, setMjmlPreview] = useState("");
  const [mjmlError, setMjmlError] = useState("");
  const [filterLanguage, setFilterLanguage] = useState<string>("__all__");
  const confirm = useConfirmDelete();

  const { data: hotelLanguages = [] } = useHotelLanguages(selectedHotelId || undefined);

  const compileMjml = useCallback((source: string) => {
    if (!source.trim()) { setMjmlPreview(""); setMjmlError(""); return; }
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

  const { data: templates, isLoading } = useQuery<OfferTemplate[]>({
    queryKey: ["offer_templates", selectedHotelId],
    queryFn: async () => {
      const { data, error } = await supabase.from("offer_templates").select("*").eq("hotel_id", selectedHotelId).order("name");
      if (error) throw error;
      return data as unknown as OfferTemplate[];
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
        language: form.language,
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

  const duplicateForLanguage = async (template: OfferTemplate, targetLang: string) => {
    const payload = {
      name: `${template.name} (${targetLang.toUpperCase()})`,
      subject_template: template.subject_template || "",
      body_template: template.body_template,
      mjml_source: template.mjml_source,
      language: targetLang,
      template_group_id: template.template_group_id,
      hotel_id: selectedHotelId,
    } as any;
    const { error } = await supabase.from("offer_templates").insert(payload);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Variante ${targetLang.toUpperCase()} creata`);
      queryClient.invalidateQueries({ queryKey: ["offer_templates", selectedHotelId] });
    }
  };

  const closeEditor = () => {
    setEditingId(null);
    setIsCreating(false);
    setForm({ name: "", subject_template: "", body_template: "", mjml_source: "", language: "it" });
    setEditorMode("wysiwyg");
    setMjmlPreview("");
    setMjmlError("");
  };

  const openEdit = (t: OfferTemplate) => {
    setEditingId(t.id);
    setIsCreating(false);
    setForm({
      name: t.name,
      subject_template: t.subject_template || "",
      body_template: t.body_template,
      mjml_source: t.mjml_source || "",
      language: t.language || "it",
    });
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
    const defaultLang = hotelLanguages.find(hl => hl.is_default)?.language_code || "it";
    setForm({ name: "", subject_template: "", body_template: "", mjml_source: "", language: defaultLang });
    setEditorMode("wysiwyg");
  };

  const getLangName = (code: string) => allLanguages.find(l => l.code === code)?.name || code.toUpperCase();

  // Filter templates by language
  const filteredTemplates = templates?.filter(t =>
    filterLanguage === "__all__" ? true : (t.language || "it") === filterLanguage
  );

  // Group templates by template_group_id for showing missing variants
  const getExistingLangs = (template: OfferTemplate) => {
    if (!template.template_group_id || !templates) return [];
    return templates
      .filter(t => t.template_group_id === template.template_group_id)
      .map(t => t.language || "it");
  };

  const getMissingLangs = (template: OfferTemplate) => {
    const existing = getExistingLangs(template);
    return hotelLanguages
      .map(hl => hl.language_code)
      .filter(code => !existing.includes(code));
  };

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Accesso non autorizzato</div>;
  }

  // Editor view
  if (isEditorOpen) {
    return (
      <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] animate-fade-in">
        <div className="flex items-center gap-3 shrink-0 pb-4">
          <Button variant="ghost" size="icon" onClick={closeEditor}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {editingId ? "Modifica Template" : "Nuovo Template"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {hotels.find(h => h.id === selectedHotelId)?.name}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={closeEditor}>Annulla</Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Salva Template</Button>
          </div>
        </div>

        <form className="flex flex-col flex-1 min-h-0 gap-4" onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            <div className="space-y-2">
              <Label>Nome Template</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>Oggetto Email</Label>
              <Input value={form.subject_template} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} placeholder="Offerta per il soggiorno dal {{check_in}} al {{check_out}}" />
            </div>
            <div className="space-y-2">
              <Label>Lingua</Label>
              <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hotelLanguages.length > 0
                    ? hotelLanguages.map(hl => (
                        <SelectItem key={hl.language_code} value={hl.language_code}>
                          {getLangName(hl.language_code)} {hl.is_default && "(predefinita)"}
                        </SelectItem>
                      ))
                    : allLanguages.map(l => (
                        <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between shrink-0">
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

          <div className="flex-1 min-h-0">
            {editorMode === "wysiwyg" ? (
              <div className="h-full">
                <WysiwygEditor content={form.body_template} onChange={(html) => setForm({ ...form, body_template: html })} placeholder="Scrivi il corpo del template..." />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                <div className="flex flex-col min-h-0">
                  <Label className="text-xs text-muted-foreground mb-1 shrink-0">Codice MJML</Label>
                  <textarea
                    className="flex-1 w-full font-mono text-xs p-3 rounded-md border border-input bg-background resize-none"
                    value={form.mjml_source}
                    onChange={(e) => { setForm({ ...form, mjml_source: e.target.value }); compileMjml(e.target.value); }}
                    spellCheck={false}
                    placeholder={`<mjml>\n  <mj-body>\n    <mj-section>\n      <mj-column>\n        <mj-text>Ciao {{nome}}!</mj-text>\n      </mj-column>\n    </mj-section>\n  </mj-body>\n</mjml>`}
                  />
                  {mjmlError && <p className="text-xs text-destructive mt-1 shrink-0">{mjmlError}</p>}
                </div>
                <div className="flex flex-col min-h-0">
                  <Label className="text-xs text-muted-foreground mb-1 shrink-0">Anteprima HTML</Label>
                  <div className="flex-1 border rounded-md bg-white overflow-auto">
                    {mjmlPreview ? (
                      <iframe srcDoc={mjmlPreview} className="w-full h-full border-0" title="MJML Preview" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Scrivi codice MJML per vedere l'anteprima</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 pb-2">
            <p className="text-xs text-muted-foreground">
              Variabili: {"{{nome}}, {{cognome}}, {{check_in}}, {{check_out}}, {{prezzo}}, {{camere}}, {{email_body}}"} · <code className="bg-muted px-1 rounded">{"{{email_body}}"}</code> attiva un editor di testo libero nell'invio
            </p>
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
        <Select value={selectedHotelId} onValueChange={(v) => { setSelectedHotelId(v); setFilterLanguage("__all__"); }}>
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
            <div className="flex items-center gap-2">
              {/* Language filter */}
              {hotelLanguages.length > 1 && (
                <Select value={filterLanguage} onValueChange={setFilterLanguage}>
                  <SelectTrigger className="w-[160px] h-9">
                    <Globe className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Tutte le lingue</SelectItem>
                    {hotelLanguages.map(hl => (
                      <SelectItem key={hl.language_code} value={hl.language_code}>
                        {getLangName(hl.language_code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Nuovo Template</Button>
            </div>
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
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.language && t.language !== "it" ? `(${t.language.toUpperCase()})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="text-center text-muted-foreground p-8">Caricamento...</div>
          ) : !filteredTemplates?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground">
                  {filterLanguage !== "__all__"
                    ? `Nessun template in ${getLangName(filterLanguage)}`
                    : "Nessun template creato per questo hotel"
                  }
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTemplates.map((t) => {
                const missingLangs = getMissingLangs(t);
                return (
                  <Card key={t.id} className="group">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {t.name}
                          <Badge variant="outline" className="text-xs font-mono uppercase">
                            {(t.language || "it").toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Duplicate for missing languages */}
                          {missingLangs.length > 0 && missingLangs.map(lang => (
                            <Button
                              key={lang}
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => duplicateForLanguage(t, lang)}
                              title={`Crea variante ${getLangName(lang)}`}
                            >
                              <Copy className="h-3 w-3" />
                              {lang.toUpperCase()}
                            </Button>
                          ))}
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
                );
              })}
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
