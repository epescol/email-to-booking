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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...payload } = await req.json();

    if (action === "list") {
      // List all profiles with roles and hotel info
      const { data: profiles, error } = await supabaseAdmin
        .from("profiles")
        .select("*, user_roles(*), hotels(name)");
      if (error) throw error;
      return new Response(JSON.stringify(profiles), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { email, password, display_name, hotel_name, role } = payload;

      // Create or find hotel by name
      let hotel_id: string | null = null;
      if (hotel_name) {
        const { data: existing } = await supabaseAdmin
          .from("hotels")
          .select("id")
          .eq("name", hotel_name)
          .maybeSingle();
        if (existing) {
          hotel_id = existing.id;
        } else {
          const { data: newHotel, error: hotelErr } = await supabaseAdmin
            .from("hotels")
            .insert({ name: hotel_name })
            .select("id")
            .single();
          if (hotelErr) throw hotelErr;
          hotel_id = newHotel.id;
        }
      }

      // Create auth user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name },
      });
      if (createError) throw createError;

      // Update profile with hotel_id
      if (hotel_id) {
        await supabaseAdmin
          .from("profiles")
          .update({ hotel_id })
          .eq("user_id", newUser.user.id);
      }

      // Update role if admin
      if (role === "admin") {
        await supabaseAdmin
          .from("user_roles")
          .update({ role: "admin" })
          .eq("user_id", newUser.user.id);
      }

      return new Response(JSON.stringify({ id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, email, display_name, hotel_id, role, password } = payload;
      
      // Update auth user
      const updateData: Record<string, unknown> = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (display_name) updateData.user_metadata = { display_name };
      
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, updateData);
        if (error) throw error;
      }

      // Update profile
      const profileUpdate: Record<string, unknown> = {};
      if (display_name) profileUpdate.display_name = display_name;
      if (email) profileUpdate.email = email;
      if (hotel_id !== undefined) profileUpdate.hotel_id = hotel_id;

      if (Object.keys(profileUpdate).length > 0) {
        await supabaseAdmin.from("profiles").update(profileUpdate).eq("user_id", user_id);
      }

      // Update role
      if (role) {
        await supabaseAdmin.from("user_roles").update({ role }).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { user_id } = payload;
      
      // Nullify assigned_to references to preserve booking history
      await supabaseAdmin
        .from("booking_requests")
        .update({ assigned_to: null })
        .eq("assigned_to", user_id);

      // Delete auth user (cascades to profiles and user_roles)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Azione non valida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
