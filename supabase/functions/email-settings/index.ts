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

    // Admin-only: managing SMTP/IMAP credentials must be restricted to admins
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      return new Response(JSON.stringify({ error: "Permesso negato" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's hotel_id
    const { data: profile } = await callerClient
      .from("profiles")
      .select("hotel_id")
      .eq("user_id", userId)
      .single();

    if (!profile?.hotel_id) {
      return new Response(JSON.stringify({ error: "Nessun hotel associato" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    if (action === "get") {
      const { data: settings } = await supabaseAdmin
        .from("hotel_email_settings")
        .select("*")
        .eq("hotel_id", profile.hotel_id)
        .maybeSingle();

      if (!settings) {
        return new Response(JSON.stringify(null), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Decrypt passwords before returning
      const result = { ...settings };
      const passwordFields = ["imap_password", "smtp_password"] as const;
      for (const field of passwordFields) {
        if (result[field]) {
          try {
            const { data, error } = await supabaseAdmin.rpc("decrypt_value", {
              _ciphertext: result[field],
              _key: encryptionKey,
            });
            if (!error && data) {
              result[field] = data;
            }
          } catch {
            // Keep original value
          }
        }
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "save") {
      const formData = { ...payload };

      // Encrypt passwords before saving
      const passwordFields = ["imap_password", "smtp_password"];
      for (const field of passwordFields) {
        if (formData[field]) {
          const { data, error } = await supabaseAdmin.rpc("encrypt_value", {
            _plaintext: formData[field],
            _key: encryptionKey,
          });
          if (error) throw error;
          formData[field] = data;
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
