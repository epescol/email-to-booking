import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Eye } from "lucide-react";
import { format } from "date-fns";

type AuditRow = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const CATEGORIES: Record<string, string[]> = {
  email: [
    "booking_request.email_imported",
    "booking_request.ai_parse_failed",
    "email_settings.updated",
  ],
  ai: ["booking_request.ai_parse_failed"],
  pricing: [
    "pricing.period_created",
    "pricing.period_deleted",
    "pricing.price_updated",
    "pricing.mode_changed",
  ],
  template: ["template.saved", "template.deleted", "template.set_default"],
  booking: [
    "booking_request.deleted",
    "booking_request.archived",
    "booking_request.unarchived",
    "booking_request.status_changed",
    "booking_request.offer_sent",
    "booking_request.send_failed",
  ],
  auth: ["auth.admin_login"],
};

function actionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action.includes("failed") || action.includes("deleted")) return "destructive";
  if (action.startsWith("auth.")) return "outline";
  if (action.startsWith("email") || action.includes("email_imported")) return "secondary";
  return "default";
}

export default function AdminAuditLog() {
  const [category, setCategory] = useState<string>("all");
  const [hotelId, setHotelId] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(200);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const copyJson = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      toast.success("JSON copiato negli appunti");
    } catch {
      toast.error("Impossibile copiare");
    }
  };

  const { data: hotels } = useQuery({
    queryKey: ["audit_hotels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotels").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ["audit_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, display_name, hotel_id")
        .order("email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit_log", category, hotelId, userId, limit],
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (category !== "all") {
        q = q.in("action", CATEGORIES[category]);
      }
      if (userId !== "all") {
        q = q.eq("user_id", userId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const profilesByUser = useMemo(() => {
    const m = new Map<string, { email: string | null; display_name: string | null; hotel_id: string | null }>();
    (profiles ?? []).forEach((p) => m.set(p.user_id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    let r = rows ?? [];
    if (hotelId !== "all") {
      r = r.filter((row) => {
        const p = row.user_id ? profilesByUser.get(row.user_id) : null;
        return p?.hotel_id === hotelId;
      });
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(
        (row) =>
          row.action.toLowerCase().includes(s) ||
          row.entity_type.toLowerCase().includes(s) ||
          (row.entity_id ?? "").toLowerCase().includes(s) ||
          JSON.stringify(row.metadata ?? {}).toLowerCase().includes(s),
      );
    }
    return r;
  }, [rows, hotelId, profilesByUser, search]);

  const userOptions = useMemo(() => {
    if (hotelId === "all") return profiles ?? [];
    return (profiles ?? []).filter((p) => p.hotel_id === hotelId);
  }, [profiles, hotelId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">
          Storico eventi di sistema: import email, AI parsing, prezzi, template, autenticazione.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtri</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="ai">AI parsing</SelectItem>
                <SelectItem value="pricing">Prezzi</SelectItem>
                <SelectItem value="template">Template</SelectItem>
                <SelectItem value="booking">Richieste</SelectItem>
                <SelectItem value="auth">Autenticazione</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Hotel</Label>
            <Select
              value={hotelId}
              onValueChange={(v) => {
                setHotelId(v);
                setUserId("all");
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {(hotels ?? []).map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Utente</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {userOptions.map((p) => (
                  <SelectItem key={p.user_id} value={p.user_id}>
                    {p.display_name || p.email || p.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Cerca</Label>
            <Input
              placeholder="azione, entità, metadata..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Limite</Label>
            <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Eventi <span className="text-muted-foreground font-normal text-sm">({filtered.length})</span>
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Aggiorno..." : "Aggiorna"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground">Caricamento...</div>
          ) : filtered.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">Nessun evento trovato.</div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead>Azione</TableHead>
                    <TableHead>Entità</TableHead>
                    <TableHead>Utente</TableHead>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Dettagli</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const p = row.user_id ? profilesByUser.get(row.user_id) : null;
                    const hotel = (hotels ?? []).find((h) => h.id === p?.hotel_id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionVariant(row.action)} className="font-mono text-[10px]">
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium">{row.entity_type}</div>
                          {row.entity_id && (
                            <div className="text-muted-foreground font-mono">
                              {row.entity_id.slice(0, 8)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p?.display_name || p?.email || (row.user_id ? row.user_id.slice(0, 8) : "—")}
                        </TableCell>
                        <TableCell className="text-xs">{hotel?.name || "—"}</TableCell>
                        <TableCell>
                          {row.metadata && Object.keys(row.metadata).length > 0 ? (
                            <pre className="text-[10px] bg-muted/40 rounded px-2 py-1 max-w-md overflow-x-auto">
                              {JSON.stringify(row.metadata, null, 0)}
                            </pre>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
