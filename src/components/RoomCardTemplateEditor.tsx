import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LayoutTemplate, RotateCcw, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";

const DEFAULT_ROOM_CARD_TEMPLATE = `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
  {{#foto}}<tr><td colspan="2"><img src="{{foto}}" alt="{{nome_camera}}" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px 12px 0 0;display:block;" /></td></tr>{{/foto}}
  <tr><td style="padding:16px 20px;" {{#prezzo}}{{/prezzo}}{{^prezzo}}colspan="2"{{/prezzo}}>
    <p style="margin:0 0 6px;font-size:17px;font-weight:700;color:#1e293b;">{{nome_camera}}</p>
    <p style="margin:0;font-size:13px;color:#64748b;">{{dettagli}}</p>
    {{#link}}<a href="{{link}}" style="display:inline-block;margin-top:8px;color:#2563eb;text-decoration:none;font-size:13px;font-weight:500;">Scopri di più →</a>{{/link}}
  </td>{{#prezzo}}<td style="text-align:right;vertical-align:middle;">
    <p style="margin:0;font-size:24px;font-weight:800;color:#1e3a5f;">€{{prezzo}}</p>
    {{#notti}}<p style="margin:2px 0 0;font-size:12px;color:#94a3b8;">{{notti}} notti</p>{{/notti}}
  </td>{{/prezzo}}</tr>
</table>`;

const PREVIEW_DATA = {
  nome_camera: "Camera Deluxe",
  foto: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=600&h=300&fit=crop",
  dettagli: "🛏️ Letto matrimoniale · 👤 1-3 ospiti",
  prezzo: "450.00",
  notti: "3",
  link: "https://example.com",
};

function renderTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  // Handle conditional sections {{#key}}...{{/key}} — show if key exists
  result = result.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return data[key] ? content : "";
  });
  // Handle inverse sections {{^key}}...{{/key}} — show if key missing
  result = result.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, key, content) => {
    return data[key] ? "" : content;
  });
  // Replace variables
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

export { DEFAULT_ROOM_CARD_TEMPLATE, renderTemplate };

export default function RoomCardTemplateEditor() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(DEFAULT_ROOM_CARD_TEMPLATE);
  const [showPreview, setShowPreview] = useState(false);

  const { data: hotel } = useQuery({
    queryKey: ["hotel_room_card_template"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hotels")
        .select("id, room_card_template")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.hotel_id,
  });

  useEffect(() => {
    if (hotel?.room_card_template) {
      setTemplate(hotel.room_card_template);
    }
  }, [hotel]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!hotel?.id) throw new Error("Hotel non trovato");
      const { error } = await supabase
        .from("hotels")
        .update({ room_card_template: template } as any)
        .eq("id", hotel.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template card camera salvato");
      queryClient.invalidateQueries({ queryKey: ["hotel_room_card_template"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const resetToDefault = () => {
    setTemplate(DEFAULT_ROOM_CARD_TEMPLATE);
    toast.info("Template ripristinato al default");
  };

  const previewHtml = renderTemplate(template, PREVIEW_DATA);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4" /> Template Card Camera
          </CardTitle>
          <CardDescription>
            Personalizza l'HTML della card camera inserita nel placeholder {"{{camere}}"} dei template email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Codice HTML</Label>
            <textarea
              className="w-full min-h-[200px] font-mono text-xs p-3 rounded-md border border-input bg-background resize-y"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Variabili disponibili:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><code className="bg-muted px-1 rounded">{"{{nome_camera}}"}</code> — Nome della camera</li>
              <li><code className="bg-muted px-1 rounded">{"{{foto}}"}</code> — URL della prima foto</li>
              <li><code className="bg-muted px-1 rounded">{"{{dettagli}}"}</code> — Letti e occupazione</li>
              <li><code className="bg-muted px-1 rounded">{"{{prezzo}}"}</code> — Prezzo totale</li>
              <li><code className="bg-muted px-1 rounded">{"{{notti}}"}</code> — Numero di notti</li>
              <li><code className="bg-muted px-1 rounded">{"{{link}}"}</code> — Link alla pagina della camera</li>
            </ul>
            <p className="mt-2">
              Sezioni condizionali: <code className="bg-muted px-1 rounded">{"{{#variabile}}...{{/variabile}}"}</code> mostra il contenuto solo se la variabile è presente.
            </p>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvataggio..." : "Salva Template"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowPreview(true)}>
              <Eye className="mr-2 h-4 w-4" />Anteprima
            </Button>
            <Button type="button" variant="ghost" onClick={resetToDefault}>
              <RotateCcw className="mr-2 h-4 w-4" />Ripristina Default
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Anteprima Card Camera</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg p-4 bg-white">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
