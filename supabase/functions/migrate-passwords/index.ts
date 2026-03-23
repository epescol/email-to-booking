import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("EMAIL_ENCRYPTION_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Get all settings with passwords
    const { data: allSettings, error } = await supabaseAdmin
      .from("hotel_email_settings")
      .select("id, imap_password, smtp_password");
    if (error) throw error;

    let migrated = 0;
    for (const s of allSettings || []) {
      const updates: Record<string, string> = {};

      for (const field of ["imap_password", "smtp_password"] as const) {
        if (s[field]) {
          // Try to decrypt - if it works, it's already encrypted
          const { error: decErr } = await supabaseAdmin.rpc("decrypt_value", {
            _ciphertext: s[field], _key: encryptionKey,
          });
          if (decErr) {
            // Not encrypted yet, encrypt it
            const { data: encrypted, error: encErr } = await supabaseAdmin.rpc("encrypt_value", {
              _plaintext: s[field], _key: encryptionKey,
            });
            if (!encErr && encrypted) updates[field] = encrypted;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabaseAdmin.from("hotel_email_settings").update(updates).eq("id", s.id);
        migrated++;
      }
    }

    return new Response(JSON.stringify({ migrated, total: allSettings?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
