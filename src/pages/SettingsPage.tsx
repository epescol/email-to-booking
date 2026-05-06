import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Impostazioni</h1>
        <p className="text-muted-foreground text-sm">Informazioni sulla configurazione del tuo hotel</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ricezione email</CardTitle>
          <CardDescription>Come vengono importate le richieste dal tuo sito</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Importazione automatica</AlertTitle>
            <AlertDescription>
              Le email di richiesta vengono importate automaticamente dal sistema centralizzato e
              instradate al tuo hotel in base al mittente configurato dall'amministratore.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
