import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function AdminUsers() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gestione Utenti</h1>
        <p className="text-muted-foreground text-sm">Crea e gestisci utenti del sistema (solo Admin)</p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-muted-foreground">Gestione utenti in arrivo</p>
          <p className="text-sm text-muted-foreground">Questa sezione sarà disponibile nella prossima iterazione</p>
        </CardContent>
      </Card>
    </div>
  );
}
