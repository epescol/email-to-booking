import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

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
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("*, hotels(name)");
      if (pErr) throw pErr;

      const { data: allRoles, error: rErr } = await supabaseAdmin
        .from("user_roles")
        .select("*");
      if (rErr) throw rErr;

      const result = (profiles || []).map((p: Record<string, unknown>) => ({
        ...p,
        user_roles: (allRoles || []).filter((r: Record<string, unknown>) => r.user_id === p.user_id),
      }));

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create") {
      const { email, password, display_name, role } = payload;

      if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return new Response(JSON.stringify({ error: "Email non valida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (display_name && (typeof display_name !== "string" || display_name.length > 100)) {
        return new Response(JSON.stringify({ error: "Nome non valido (max 100 caratteri)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (role && !["user", "admin"].includes(role)) {
        return new Response(JSON.stringify({ error: "Ruolo non valido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Always create a new hotel for each new user (never match by name)
      let hotel_id: string | null = null;
      if (display_name) {
        const { data: newHotel, error: hotelErr } = await supabaseAdmin
          .from("hotels")
          .insert({ name: display_name })
          .select("id")
          .single();
        if (hotelErr) throw hotelErr;
        hotel_id = newHotel.id;
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

      return new Response(JSON.stringify({ id: newUser.user.id, hotel_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update") {
      const { user_id, email, display_name, role, password } = payload;

      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id richiesto" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (email && (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        return new Response(JSON.stringify({ error: "Email non valida" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (password && (typeof password !== "string" || password.length < 8)) {
        return new Response(JSON.stringify({ error: "La password deve avere almeno 8 caratteri" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (role && !["user", "admin"].includes(role)) {
        return new Response(JSON.stringify({ error: "Ruolo non valido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update auth user
      const updateData: Record<string, unknown> = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (display_name) updateData.user_metadata = { display_name };
      
      if (Object.keys(updateData).length > 0) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, updateData);
        if (error) throw error;
      }

      // Rename existing hotel instead of creating a new one
      if (display_name && role !== "admin") {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("hotel_id")
          .eq("user_id", user_id)
          .maybeSingle();

        if (profile?.hotel_id) {
          await supabaseAdmin
            .from("hotels")
            .update({ name: display_name })
            .eq("id", profile.hotel_id);
        }
      }

      // Update profile
      const profileUpdate: Record<string, unknown> = {};
      if (display_name) profileUpdate.display_name = display_name;
      if (email) profileUpdate.email = email;

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

      // Get the hotel_id before deleting
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("hotel_id")
        .eq("user_id", user_id)
        .maybeSingle();
      const hotelId = profile?.hotel_id;

      // Unassign booking requests
      await supabaseAdmin
        .from("booking_requests")
        .update({ assigned_to: null })
        .eq("assigned_to", user_id);

      // Delete auth user (cascades to profiles, user_roles)
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (error) throw error;

      // Delete hotel and all related data
      if (hotelId) {
        // Delete in correct order (children first)
        await supabaseAdmin.from("room_prices").delete().in("room_id",
          (await supabaseAdmin.from("rooms").select("id").eq("hotel_id", hotelId)).data?.map(r => r.id) || []
        );
        await supabaseAdmin.from("room_translations").delete().in("room_id",
          (await supabaseAdmin.from("rooms").select("id").eq("hotel_id", hotelId)).data?.map(r => r.id) || []
        );
        const { data: bookings } = await supabaseAdmin.from("booking_requests").select("id").eq("hotel_id", hotelId);
        const bookingIds = (bookings || []).map(b => b.id);
        if (bookingIds.length > 0) {
          await supabaseAdmin.from("booking_accommodations").delete().in("request_id", bookingIds);
          await supabaseAdmin.from("booking_messages").delete().in("request_id", bookingIds);
        }
        await supabaseAdmin.from("booking_requests").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("rooms").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("offer_templates").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("treatments").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("price_periods").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("hotel_languages").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("hotel_email_settings").delete().eq("hotel_id", hotelId);
        await supabaseAdmin.from("hotels").delete().eq("id", hotelId);
      }

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
