import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("EMAIL_ENCRYPTION_KEY")!;

    if (!encryptionKey) {
      return new Response(JSON.stringify({ error: "Encryption key not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth check — use getUser() to validate JWT server-side (not getClaims which only decodes)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Admin-only: only global admins can read/write SMTP/IMAP credentials.
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, hotel_id: payloadHotelId, ...payload } = await req.json();

    if (!payloadHotelId || typeof payloadHotelId !== "string") {
      return new Response(JSON.stringify({ error: "hotel_id richiesto" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const hotelId = payloadHotelId;

    if (action === "get") {
      const { data: settings } = await supabaseAdmin
        .from("hotel_email_settings")
        .select("*")
        .eq("hotel_id", hotelId)
        .maybeSingle();

      if (!settings) {
        return new Response(JSON.stringify(null), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: never return decrypted passwords to the client.
      // Only expose presence flags so the UI can show "•••• (saved)".
      const { imap_password, smtp_password, ...safe } = settings as Record<string, unknown>;
      const result = {
        ...safe,
        imap_password: "",
        smtp_password: "",
        has_imap_password: Boolean(imap_password),
        has_smtp_password: Boolean(smtp_password),
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save") {
      const formData: Record<string, unknown> = { ...payload };

      // Encrypt passwords before saving. If the field is empty/missing,
      // do NOT overwrite the existing stored (encrypted) value.
      const passwordFields = ["imap_password", "smtp_password"] as const;
      for (const field of passwordFields) {
        const value = formData[field];
        if (typeof value === "string" && value.length > 0) {
          const { data, error } = await supabaseAdmin.rpc("encrypt_value", {
            _plaintext: value,
            _key: encryptionKey,
          });
          if (error) throw error;
          formData[field] = data;
        } else {
          // Remove from payload so update/insert doesn't blank it out
          delete formData[field];
        }
      }

      const { data: existing } = await supabaseAdmin
        .from("hotel_email_settings")
        .select("id")
        .eq("hotel_id", profile.hotel_id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabaseAdmin
          .from("hotel_email_settings")
          .update(formData)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin
          .from("hotel_email_settings")
          .insert({ ...formData, hotel_id: profile.hotel_id });
        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Azione non valida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
