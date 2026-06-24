import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOOK_TABLE_CANDIDATES = ["buku", "book", "books"];

function makeMemberId(seed: string) {
  const compactSeed = String(seed || "").replace(/-/g, "").toUpperCase();
  return `LIT-${compactSeed.slice(0, 6) || "000000"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerToken = authHeader.replace("Bearer ", "");

    if (!callerToken) {
      return new Response(JSON.stringify({ error: "Token tidak ada. Silakan login ulang." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerUser, error: callerErr } = await adminClient.auth.getUser(callerToken);
    if (callerErr || !callerUser?.user) {
      return new Response(JSON.stringify({ error: "Token tidak valid." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerRow } = await adminClient
      .from("admin_users")
      .select("role")
      .eq("id", callerUser.user.id)
      .maybeSingle();

    if (!callerRow || !["admin", "owner"].includes(callerRow.role)) {
      return new Response(JSON.stringify({ error: "Hanya admin yang boleh sinkronisasi anggota." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allAuthUsers = [];
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw error;
      }

      const users = data?.users || [];
      allAuthUsers.push(...users);
      if (users.length < perPage) break;
      page += 1;
    }

    const profileRows = allAuthUsers
      .filter((user) => user.email)
      .map((user) => ({
        id: user.id,
        email: user.email,
        full_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email.split("@")[0],
        phone: user.user_metadata?.phone || null,
        member_id: user.user_metadata?.member_id || makeMemberId(user.id),
        tanggal_lahir: user.user_metadata?.tanggal_lahir || "-",
      }));

    if (profileRows.length) {
      const { error: upsertError } = await adminClient
        .from("profiles")
        .upsert(profileRows, { onConflict: "id" });

      if (upsertError) {
        throw upsertError;
      }
    }

    const [profilesResult, borrowingsResult, bookResults] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, full_name, email, phone, member_id, created_at")
        .order("created_at", { ascending: false }),
      adminClient
        .from("peminjaman")
        .select("user_id, status, tanggal_pinjam, tanggal_pengajuan"),
      Promise.all(
        BOOK_TABLE_CANDIDATES.map(async (tableName) => {
          const { data, error } = await adminClient.from(tableName).select("*");
          return {
            tableName,
            rows: error ? [] : data || [],
            error,
          };
        }),
      ),
    ]);

    const { data: profiles, error: profilesError } = profilesResult;
    const { data: borrowings, error: borrowingsError } = borrowingsResult;

    if (profilesError) throw profilesError;
    if (borrowingsError) throw borrowingsError;

    const availableBookResults = bookResults.filter((result) => result.rows.length);
    const tableOrder = new Map(
      BOOK_TABLE_CANDIDATES.map((name, index) => [name, index]),
    );
    availableBookResults.sort((left, right) => {
      const rowDiff = (right.rows?.length || 0) - (left.rows?.length || 0);
      if (rowDiff !== 0) return rowDiff;
      return (tableOrder.get(left.tableName) || 0) - (tableOrder.get(right.tableName) || 0);
    });

    const books = availableBookResults[0]?.rows || [];

    const activeBorrowMap = new Map();
    (borrowings || []).forEach((row) => {
      if (row.status === "dipinjam" && row.user_id) {
        activeBorrowMap.set(row.user_id, (activeBorrowMap.get(row.user_id) || 0) + 1);
      }
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dipinjamHariIni = (borrowings || []).filter((row) => {
      if (row.status !== "dipinjam") return false;
      const source = row.tanggal_pinjam || row.tanggal_pengajuan;
      if (!source) return false;
      const date = new Date(source);
      if (Number.isNaN(date.getTime())) return false;
      date.setHours(0, 0, 0, 0);
      return date.getTime() === today.getTime();
    }).length;

    const totalKoleksi = (books || []).reduce(
      (sum, book) =>
        sum +
        (book.stok === null || book.stok === undefined || book.stok === ""
          ? 1
          : Number(book.stok) || 0),
      0,
    );

    const totalBuku = (books || []).length;
    const anggotaAktif = (profiles || []).length;
    const menungguKonfirmasi = (borrowings || []).filter((row) => {
      const status = String(row.status || "").trim().toLowerCase();
      return status === "menunggu" || status === "pending";
    }).length;

    const members = (profiles || []).map((member) => ({
      ...member,
      active_books: activeBorrowMap.get(member.id) || 0,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        synced: profileRows.length,
        stats: {
          totalKoleksi,
          totalBuku,
          anggotaAktif,
          dipinjamHariIni,
          menungguKonfirmasi,
        },
        members,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "Terjadi kesalahan server." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
