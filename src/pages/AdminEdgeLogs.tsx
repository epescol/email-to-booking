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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Copy, Eye, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { BookingDetail } from "@/components/BookingDetail";

type LogRow = {
  id: string;
  created_at: string;
  function_name: string;
  level: "info" | "warn" | "error" | string;
  event: string;
  message: string | null;
  hotel_id: string | null;
  x_hotel_request_id: string | null;
  message_id: string | null;
  request_id: string | null;
  metadata: Record<string, unknown> | null;
};

const SENSITIVE_KEY_RE =
  /(password|secret|token|api[_-]?key|authorization|cookie|x-webhook-secret|webhook_secret|service[_-]?role|encryption[_-]?key|private[_-]?key)/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_RE.test(k) ? "[REDACTED]" : redact(v);
    }
    return out;
  }
  return value;
}

function levelVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  if (level === "error") return "destructive";
  if (level === "warn") return "outline";
  return "secondary";
}

export default function AdminEdgeLogs() {
  const [functionName, setFunctionName] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [hotelId, setHotelId] = useState<string>("all");
  const [xHotelRequestId, setXHotelRequestId] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(200);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const copyJson = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(redact(value), null, 2));
      toast.success("JSON copiato (campi sensibili oscurati)");
    } catch {
      toast.error("Impossibile copiare");
    }
  };

  const { data: hotels } = useQuery({
    queryKey: ["edge_logs_hotels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hotels").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: functions } = useQuery({
    queryKey: ["edge_logs_functions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("edge_function_logs")
        .select("function_name")
        .limit(1000);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((r: { function_name: string }) => set.add(r.function_name));
      return Array.from(set).sort();
    },
  });

  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["edge_function_logs", functionName, level, hotelId, xHotelRequestId, limit],
    queryFn: async () => {
      let q = supabase
        .from("edge_function_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (functionName !== "all") q = q.eq("function_name", functionName);
      if (level !== "all") q = q.eq("level", level);
      if (hotelId !== "all") q = q.eq("hotel_id", hotelId);
      if (xHotelRequestId.trim()) q = q.eq("x_hotel_request_id", xHotelRequestId.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const filtered = useMemo(() => {
    let r = rows ?? [];
    if (search.trim()) {
      const s = search.toLowerCase();
      r = r.filter(
        (row) =>
          row.event.toLowerCase().includes(s) ||
          (row.message ?? "").toLowerCase().includes(s) ||
          (row.message_id ?? "").toLowerCase().includes(s) ||
          (row.x_hotel_request_id ?? "").toLowerCase().includes(s) ||
          (row.request_id ?? "").toLowerCase().includes(s) ||
          JSON.stringify(row.metadata ?? {}).toLowerCase().includes(s),
      );
    }
    return r;
  }, [rows, search]);

  const hotelById = useMemo(() => {
    const m = new Map<string, string>();
    (hotels ?? []).forEach((h) => m.set(h.id, h.name));
    return m;
  }, [hotels]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edge Function Logs</h1>
        <p className="text-muted-foreground">
          Eventi runtime delle Edge Function (import email, AI parsing). Filtrabili per hotel e
          X-Hotel-Request-ID.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtri</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label>Function</Label>
            <Select value={functionName} onValueChange={setFunctionName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {(functions ?? []).map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Livello</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Hotel</Label>
            <Select value={hotelId} onValueChange={setHotelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {(hotels ?? []).map((h) => (
                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>X-Hotel-Request-ID</Label>
            <Input
              placeholder="UUID esatto"
              value={xHotelRequestId}
              onChange={(e) => setXHotelRequestId(e.target.value)}
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

          <div className="space-y-2 md:col-span-6">
            <Label>Cerca</Label>
            <Input
              placeholder="event, message, message_id, request_id, metadata..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Eventi{" "}
            <span className="text-muted-foreground font-normal text-sm">
              ({filtered.length})
            </span>
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
                    <TableHead>Function</TableHead>
                    <TableHead>Livello</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Hotel</TableHead>
                    <TableHead>X-Hotel-Request-ID</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelected(row)}
                    >
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{row.function_name}</TableCell>
                      <TableCell>
                        <Badge variant={levelVariant(row.level)} className="font-mono text-[10px]">
                          {row.level}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{row.event}</TableCell>
                      <TableCell className="text-xs">
                        {row.hotel_id ? hotelById.get(row.hotel_id) || row.hotel_id.slice(0, 8) : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {row.x_hotel_request_id ? row.x_hotel_request_id.slice(0, 12) + "…" : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-md truncate">
                        {row.message || "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(row);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <Badge variant={selected ? levelVariant(selected.level) : "default"} className="font-mono text-[10px]">
                {selected?.level}
              </Badge>
              <span className="font-mono text-sm">{selected?.event}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {selected && format(new Date(selected.created_at), "dd/MM/yyyy HH:mm:ss")}
              </span>
            </DialogTitle>
            <DialogDescription>{selected?.function_name}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Hotel</Label>
                  <div>
                    {selected.hotel_id
                      ? hotelById.get(selected.hotel_id) || selected.hotel_id
                      : "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">X-Hotel-Request-ID</Label>
                  <div className="font-mono text-xs break-all">
                    {selected.x_hotel_request_id || "—"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Message-ID</Label>
                  <div className="font-mono text-xs break-all">{selected.message_id || "—"}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Request ID</Label>
                  <div className="font-mono text-xs break-all">{selected.request_id || "—"}</div>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Message</Label>
                  <div className="text-sm">{selected.message || "—"}</div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium">Metadata</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyJson(selected.metadata ?? {})}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copia JSON
                  </Button>
                </div>
                <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto max-h-[40vh] overflow-y-auto">
{JSON.stringify(redact(selected.metadata ?? {}), null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
