import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Mail, Pencil, Trash2, Eye, ArrowLeft, Code, Type, Star, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

interface TemplateVariant {
  language: string;
  subject_template: string;
  body_template: string;
  mjml_source: string;
  editorMode: "wysiwyg" | "mjml";
}

interface TemplateGroup {
  groupId: string;
  name: string;
  templates: OfferTemplate[];
  languages: string[];
}

export default function AdminTemplates() {
  const { user } = useAuth();
  const { data: roles } = useUserRoles(user?.id);
  const isAdmin = roles?.some(r => r.role === "admin");
  const queryClient = useQueryClient();
  const { data: allLanguages = [] } = useLanguages();

  const [selectedHotelId, setSelectedHotelId] = useState<string>("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [variants, setVariants] = useState<Record<string, TemplateVariant>>({});
  const [activeTab, setActiveTab] = useState("");
  const [mjmlPreviews, setMjmlPreviews] = useState<Record<string, string>>({});
  const [mjmlErrors, setMjmlErrors] = useState<Record<string, string>>({});
  const confirm = useConfirmDelete();

  const { data: hotelLanguages = [] } = useHotelLanguages(selectedHotelId || undefined);

  const isEditorOpen = isCreating || !!editingGroupId;

  const compileMjml = useCallback((source: string, lang: string) => {
    if (!source.trim()) {
      setMjmlPreviews(p => ({ ...p, [lang]: "" }));
      setMjmlErrors(e => ({ ...e, [lang]: "" }));
      return;
    }
    try {
      const result = mjml2html(source, { validationLevel: "soft" });
      setMjmlPreviews(p => ({ ...p, [lang]: result.html }));
      setMjmlErrors(e => ({ ...e, [lang]: "" }));
    } catch (e: any) {
      setMjmlErrors(err => ({ ...err, [lang]: e.message || "Errore MJML" }));
      setMjmlPreviews(p => ({ ...p, [lang]: "" }));
    }
  }, []);

  const { data: hotels = [] } = useQuery({
    queryKey: ["admin-hotels-templates"],
    queryFn: async () => {
      // Get admin user_ids to exclude their hotels
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const adminUserIds = (adminRoles || []).map(r => r.user_id);

      const { data, error } = await supabase.from("hotels").select("id, name, default_template_id").order("name");
      if (error) throw error;

      if (adminUserIds.length === 0) return data;

      // Get hotel_ids linked to admin profiles
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("hotel_id")
        .in("user_id", adminUserIds)
        .not("hotel_id", "is", null);
      const adminHotelIds = new Set((adminProfiles || []).map(p => p.hotel_id));

      return data.filter(h => !adminHotelIds.has(h.id));
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

  // Group templates by template_group_id
  const templateGroups = useMemo((): TemplateGroup[] => {
    if (!templates) return [];
    const groups: Record<string, TemplateGroup> = {};
    for (const t of templates) {
      const gid = t.template_group_id || t.id;
      if (!groups[gid]) {
        groups[gid] = { groupId: gid, name: t.name, templates: [], languages: [] };
      }
      groups[gid].templates.push(t);
      groups[gid].languages.push(t.language || "it");
    }
    // Use the name from the first template (strip language suffix if present)
    for (const g of Object.values(groups)) {
      // Use base name (remove trailing " (XX)" language suffix)
      const baseName = g.templates[0].name.replace(/\s*\([A-Z]{2}\)\s*$/, "");
      g.name = baseName;
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [templates]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedHotelId) throw new Error("Seleziona un hotel");
      if (!templateName.trim()) throw new Error("Inserisci un nome per il template");

      const groupId = editingGroupId || crypto.randomUUID();

      for (const [lang, variant] of Object.entries(variants)) {
        // Skip empty variants
        if (!variant.body_template.trim() && !variant.mjml_source.trim()) continue;

        let bodyToSave = variant.body_template;
        if (variant.editorMode === "mjml" && variant.mjml_source.trim()) {
          try {
            const result = mjml2html(variant.mjml_source, { validationLevel: "soft" });
            bodyToSave = result.html;
          } catch (e: any) {
            throw new Error(`Errore MJML (${lang.toUpperCase()}): ${e.message}`);
          }
        }

        // Find existing template for this group+language
        const existing = templates?.find(
          t => t.template_group_id === editingGroupId && (t.language || "it") === lang
        );

        const displayName = hotelLanguages.length > 1
          ? `${templateName} (${lang.toUpperCase()})`
          : templateName;

        const payload = {
          name: displayName,
          subject_template: variant.subject_template,
          body_template: bodyToSave || "<p></p>",
          mjml_source: variant.editorMode === "mjml" ? variant.mjml_source : null,
          language: lang,
          template_group_id: groupId,
        } as any;

        if (existing) {
          const { error } = await supabase.from("offer_templates").update(payload).eq("id", existing.id);
          if (error) throw error;
        } else if (bodyToSave.trim() || variant.mjml_source.trim()) {
          const { error } = await supabase.from("offer_templates").insert({ ...payload, hotel_id: selectedHotelId });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editingGroupId ? "Template aggiornato" : "Template creato");
      queryClient.invalidateQueries({ queryKey: ["offer_templates", selectedHotelId] });
      closeEditor();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const toDelete = templates?.filter(t => (t.template_group_id || t.id) === groupId) || [];
      for (const t of toDelete) {
        const { error } = await supabase.from("offer_templates").delete().eq("id", t.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Template eliminato");
      queryClient.invalidateQueries({ queryKey: ["offer_templates", selectedHotelId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const getLangName = (code: string) => allLanguages.find(l => l.code === code)?.name || code.toUpperCase();

  const closeEditor = () => {
    setEditingGroupId(null);
    setIsCreating(false);
    setTemplateName("");
    setVariants({});
    setActiveTab("");
    setMjmlPreviews({});
    setMjmlErrors({});
  };

  const initVariants = (existingTemplates?: OfferTemplate[]) => {
    const langs = hotelLanguages.length > 0
      ? hotelLanguages.map(hl => hl.language_code)
      : ["it"];
    const defaultLang = hotelLanguages.find(hl => hl.is_default)?.language_code || langs[0];

    const newVariants: Record<string, TemplateVariant> = {};
    for (const lang of langs) {
      const existing = existingTemplates?.find(t => (t.language || "it") === lang);
      newVariants[lang] = {
        language: lang,
        subject_template: existing?.subject_template || "",
        body_template: existing?.body_template || "",
        mjml_source: existing?.mjml_source || "",
        editorMode: existing?.mjml_source ? "mjml" : "wysiwyg",
      };
      if (existing?.mjml_source) {
        compileMjml(existing.mjml_source, lang);
      }
    }
    setVariants(newVariants);
    setActiveTab(defaultLang);
  };

  const openCreate = () => {
    setEditingGroupId(null);
    setIsCreating(true);
    setTemplateName("");
    initVariants();
  };

  const openEdit = (group: TemplateGroup) => {
    setEditingGroupId(group.groupId);
    setIsCreating(false);
    setTemplateName(group.name);
    initVariants(group.templates);
  };

  const updateVariant = (lang: string, field: keyof TemplateVariant, value: string) => {
    setVariants(prev => ({
      ...prev,
      [lang]: { ...prev[lang], [field]: value },
    }));
  };

  if (!isAdmin) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Accesso non autorizzato</div>;
  }

  // Editor view
  if (isEditorOpen) {
    const langs = Object.keys(variants);

    return (
      <div className="flex flex-col h-[calc(100vh-theme(spacing.16))] animate-fade-in">
        <div className="flex items-center gap-3 shrink-0 pb-4">
          <Button variant="ghost" size="icon" onClick={closeEditor}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">
              {editingGroupId ? "Modifica Template" : "Nuovo Template"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {hotels.find(h => h.id === selectedHotelId)?.name}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={closeEditor}>Annulla</Button>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salva Template
            </Button>
          </div>
        </div>

        <div className="space-y-4 shrink-0">
          <div className="max-w-md space-y-2">
            <Label>Nome Template</Label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Es. Offerta Standard" required />
          </div>
        </div>

        {/* Language tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 mt-4">
          <TabsList className="shrink-0">
            {langs.map(lang => (
              <TabsTrigger key={lang} value={lang} className="gap-1.5">
                <span className="font-mono text-xs uppercase">{lang}</span>
                <span className="hidden sm:inline">{getLangName(lang)}</span>
                {variants[lang]?.body_template?.trim() || variants[lang]?.mjml_source?.trim()
                  ? <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  : null}
              </TabsTrigger>
            ))}
          </TabsList>

          {langs.map(lang => {
            const v = variants[lang];
            if (!v) return null;

            return (
              <TabsContent key={lang} value={lang} className="flex-1 flex flex-col min-h-0 mt-3 data-[state=inactive]:hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0 mb-4">
                  <div className="space-y-2">
                    <Label>Oggetto Email</Label>
                    <Input
                      value={v.subject_template}
                      onChange={(e) => updateVariant(lang, "subject_template", e.target.value)}
                      placeholder="Offerta per il soggiorno dal {{check_in}} al {{check_out}}"
                    />
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                      <Button
                        type="button"
                        variant={v.editorMode === "wysiwyg" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => updateVariant(lang, "editorMode", "wysiwyg")}
                      >
                        <Type className="mr-1 h-3 w-3" />Visuale
                      </Button>
                      <Button
                        type="button"
                        variant={v.editorMode === "mjml" ? "default" : "ghost"}
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => {
                          updateVariant(lang, "editorMode", "mjml");
                          if (v.mjml_source) compileMjml(v.mjml_source, lang);
                        }}
                      >
                        <Code className="mr-1 h-3 w-3" />MJML
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0">
                  {v.editorMode === "wysiwyg" ? (
                    <div className="h-full">
                      <WysiwygEditor
                        content={v.body_template}
                        onChange={(html) => updateVariant(lang, "body_template", html)}
                        placeholder="Scrivi il corpo del template..."
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                      <div className="flex flex-col min-h-0">
                        <Label className="text-xs text-muted-foreground mb-1 shrink-0">Codice MJML</Label>
                        <textarea
                          className="flex-1 w-full font-mono text-xs p-3 rounded-md border border-input bg-background resize-none"
                          value={v.mjml_source}
                          onChange={(e) => {
                            updateVariant(lang, "mjml_source", e.target.value);
                            compileMjml(e.target.value, lang);
                          }}
                          spellCheck={false}
                          placeholder={`<mjml>\n  <mj-body>\n    <mj-section>\n      <mj-column>\n        <mj-text>Ciao {{nome}}!</mj-text>\n      </mj-column>\n    </mj-section>\n  </mj-body>\n</mjml>`}
                        />
                        {mjmlErrors[lang] && <p className="text-xs text-destructive mt-1 shrink-0">{mjmlErrors[lang]}</p>}
                      </div>
                      <div className="flex flex-col min-h-0">
                        <Label className="text-xs text-muted-foreground mb-1 shrink-0">Anteprima HTML</Label>
                        <div className="flex-1 border rounded-md bg-white overflow-auto">
                          {mjmlPreviews[lang] ? (
                            <iframe srcDoc={mjmlPreviews[lang]} className="w-full h-full border-0" title="MJML Preview" />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                              Scrivi codice MJML per vedere l'anteprima
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="shrink-0 pt-2 pb-1">
                  <p className="text-xs text-muted-foreground">
                    Variabili: {"{{nome}}, {{cognome}}, {{check_in}}, {{check_out}}, {{prezzo}}, {{camere}}, {{email_body}}"} · <code className="bg-muted px-1 rounded">{"{{email_body}}"}</code> attiva un editor di testo libero nell'invio
                  </p>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
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
                    {templateGroups.map(g => (
                      <SelectItem key={g.groupId} value={g.templates[0].id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : templateGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Mail className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <p className="text-muted-foreground">Nessun template creato per questo hotel</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Lingue</TableHead>
                      <TableHead>Oggetto</TableHead>
                      <TableHead className="w-[100px]">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templateGroups.map((group) => {
                      const firstTemplate = group.templates[0];
                      const missingLangs = hotelLanguages
                        .map(hl => hl.language_code)
                        .filter(code => !group.languages.includes(code));

                      return (
                        <TableRow key={group.groupId}>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {group.languages.map(lang => (
                                <Badge key={lang} variant="outline" className="text-xs font-mono uppercase">
                                  {lang}
                                </Badge>
                              ))}
                              {missingLangs.map(lang => (
                                <Badge key={lang} variant="secondary" className="text-xs font-mono uppercase opacity-40">
                                  {lang}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm truncate max-w-[200px]">
                            {firstTemplate.subject_template || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setPreviewId(firstTemplate.id)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openEdit(group)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => confirm.requestDelete(group.groupId)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

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
            onConfirm={() => { if (confirm.deleteId) deleteGroupMutation.mutate(confirm.deleteId); confirm.cancelDelete(); }}
            title="Eliminare template?"
            description="Il template e tutte le sue varianti linguistiche verranno eliminati definitivamente."
          />
        </>
      )}
    </div>
  );
}
