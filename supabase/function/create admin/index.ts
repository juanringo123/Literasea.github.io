// Edge Function: create-admin
// Tujuan: membuat akun admin/owner baru (auth.users + admin_users)
// dari sisi server, pakai service_role key, supaya TIDAK mengganti
// session browser yang sedang login (beda dengan auth.signUp() di client).
//
// Yang boleh memanggil fungsi ini HANYA owner yang sedang login --
// dicek lewat token Authorization yang dikirim dari admin.html.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Client dengan service_role -> bisa bypass RLS, dipakai untuk insert.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Client biasa dengan token pemanggil -> dipakai untuk verifikasi siapa
    // yang memanggil fungsi ini (harus owner yang valid & sedang login).
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerToken = authHeader.replace("Bearer ", "");

    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Tidak ada token. Silakan login ulang." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerUser, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !callerUser?.user) {
      return new Response(JSON.stringify({ error: "Token tidak valid. Silakan login ulang." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pastikan pemanggil adalah OWNER (bukan admin biasa, bukan pengunjung).
    const { data: callerRow } = await adminClient
      .from("admin_users")
      .select("role")
      .eq("id", callerUser.user.id)
      .maybeSingle();

    if (!callerRow || callerRow.role !== "owner") {
      return new Response(JSON.stringify({ error: "Hanya Owner yang boleh menambah admin." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ambil data admin baru dari body request.
    const { full_name, email, password, role } = await req.json();

    if (!full_name || !email || !password) {
      return new Response(JSON.stringify({ error: "Nama, email, dan password wajib diisi." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalRole = role === "owner" ? "owner" : "admin";

    // 1. Buat user baru di auth.users (server-side, tidak mengubah session pemanggil)
    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createErr || !newUser?.user) {
      return new Response(JSON.stringify({ error: createErr?.message || "Gagal membuat user." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Insert ke tabel admin_users
    const { error: insertErr } = await adminClient.from("admin_users").insert({
      id: newUser.user.id,
      full_name,
      email,
      role: finalRole,
    });

    if (insertErr) {
      // rollback: hapus user auth yang sudah dibuat supaya tidak jadi akun "nyangkut"
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: newUser.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || "Terjadi kesalahan server." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
