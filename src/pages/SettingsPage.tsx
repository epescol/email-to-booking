import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Download, CheckCircle2, AlertCircle, Loader2, Info } from "lucide-react";

interface FetchResult {
  success: boolean;
  fetched: number;
  forwarded: number;
  imported: number;
  errors: string[];
  ran_at: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile(user?.id);

  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);
  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("fetch-emails-imap", { body: {} });
      if (res.error) {
        const ctx = (res.error as any).context;
        let msg = res.error.message;
        try {
          const body = await ctx?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* noop */ }
        throw new Error(msg);
      }
      return res.data as FetchResult;
    },
    onSuccess: (data) => {
      setFetchResult(data);
      if (data.success) {
        toast.success(`Importate ${data.imported} email (${data.fetched} scaricate)`);
      } else {
        toast.warning(`Completato con ${data.errors.length} errori`);
      }
    },
    onError: (e: Error) => {
      setFetchResult({ success: false, fetched: 0, forwarded: 0, imported: 0, errors: [e.message], ran_at: new Date().toISOString() });
      toast.error(e.message);
    },
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm">Scarica le email del tuo hotel</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" /> Scarica Email
          </CardTitle>
          <CardDescription>
            Avvia manualmente il fetch IMAP per importare le nuove email del tuo hotel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={() => fetchMutation.mutate()}
            disabled={!profile?.hotel_id || fetchMutation.isPending}
          >
            {fetchMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Operazione in corso...</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Scarica email ora</>
            )}
          </Button>

          <Alert variant="default">
            <Info className="h-4 w-4" />
            <AlertTitle>Configurazione credenziali email</AlertTitle>
            <AlertDescription>
              Le credenziali IMAP/SMTP e il filtro mittente sono gestiti dall'amministratore
              dalla sezione Gestione Utenti.
            </AlertDescription>
          </Alert>

          {fetchResult && (
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-medium">
                {fetchResult.success ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-600" /> Operazione completata</>
                ) : (
                  <><AlertCircle className="h-4 w-4 text-destructive" /> Completata con errori</>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-muted-foreground">
                <div><span className="font-medium text-foreground">{fetchResult.fetched}</span> scaricate</div>
                <div><span className="font-medium text-foreground">{fetchResult.forwarded}</span> inoltrate</div>
                <div><span className="font-medium text-foreground">{fetchResult.imported}</span> importate</div>
              </div>
              {fetchResult.errors.length > 0 && (
                <ul className="list-disc list-inside text-destructive text-xs space-y-1 pt-2 border-t">
                  {fetchResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
              <div className="text-xs text-muted-foreground pt-1">
                Eseguito: {new Date(fetchResult.ran_at).toLocaleString("it-IT")}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
