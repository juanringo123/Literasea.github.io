// ===== STATE =====
      let currentRole = null;
      let currentUser = null;
      let isDark = false;
      let allKoleksiBuku = [];
      let allMemberProfiles = [];
      let memberBorrowCounts = new Map();
      let memberRefreshTimer = null;
      let memberRealtimeChannel = null;
      let bookRefreshTimer = null;
      let bookRealtimeChannel = null;
      let helpdeskThreads = [];
      let helpdeskMessages = [];
      let helpdeskProfileMap = new Map();
      let activeHelpdeskThreadUserId = null;
      let helpdeskRefreshTimer = null;
      let helpdeskRealtimeChannel = null;
      let laporanPeminjamanRows = [];
      let laporanPeminjamanFilteredRows = [];
      let laporanPeminjamanSelectedMonth = "";
      let laporanDendaRows = [];
      let laporanDendaFilteredRows = [];
      let laporanDendaSelectedMonth = "";
      let allMasukan = [];
      const HELPDESK_TABLE_CANDIDATES = ["helpdesk_chat"];
      const BOOKS_SYNC_KEY = "literasea_books_updated";
      const MEMBER_SYNC_KEY = "literasea_profiles_updated";
      const TARIF_DENDA_ADMIN = 5000;
      const BOOK_TABLE_CANDIDATES = ["buku", "book", "books"];
      const BOOK_FIELD_ALIASES = {
        id: ["id", "book_id", "kode_buku", "kode", "bookid", "book_uuid"],
        judul: [
          "judul",
          "judul_buku",
          "book_title",
          "title",
          "nama_buku",
          "name",
        ],
        penulis: [
          "penulis",
          "penulis_buku",
          "pengarang",
          "author",
          "author_name",
          "writer",
        ],
        isbn: ["isbn", "isbn_buku"],
        penerbit: ["penerbit", "penerbit_buku", "publisher"],
        kategori: ["kategori", "kategori_buku", "category", "genre"],
        stok: ["stok", "stok_buku", "stock", "jumlah", "qty", "quantity"],
        cover_url: [
          "cover_url",
          "url_cover",
          "cover",
          "cover_buku",
          "gambar",
          "gambar_url",
          "url_gambar",
          "image",
          "image_url",
          "image_link",
          "thumbnail",
          "cover_image",
          "coverimage",
          "foto",
          "foto_url",
        ],
        deskripsi: [
          "deskripsi",
          "deskripsi_buku",
          "description",
          "sinopsis",
          "sinopsis_buku",
          "ringkasan",
        ],
      };
      const BOOK_FALLBACK_COLUMNS = [
        "id",
        "judul",
        "penulis",
        "isbn",
        "penerbit",
        "kategori",
        "stok",
        "cover_url",
        "deskripsi",
      ];
      let activeBookTableName = "buku";
      let activeBookColumns = [];
      let editingBookContext = null;

      // ===== AUTH GUARD: cek session Supabase & ambil role dari admin_users =====
      // Halaman ini TIDAK punya form login sendiri. Login dilakukan dari index.html;
      // admin.html hanya membaca session yang sudah aktif lalu menampilkan dashboard
      // sesuai role (admin/owner). Kalau belum login atau bukan admin/owner, kembali
      // diarahkan ke index.html.
      async function checkAuthAndLoad() {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (!session || !session.user) {
          window.location.href = "index.html";
          return;
        }

        const { data: adminRow, error } = await supabaseClient
          .from("admin_users")
          .select("role, full_name, email")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error || !adminRow) {
          // User ini login tapi bukan admin/owner (kemungkinan anggota biasa)
          window.location.href = "index.html";
          return;
        }

        currentRole = adminRow.role; // 'admin' atau 'owner'
        const fallbackName = pickDisplayIdentity(
          [
            adminRow.full_name,
            session.user.user_metadata?.full_name,
            session.user.user_metadata?.name,
            session.user.email?.split("@")[0],
          ],
          currentRole === "owner"
            ? "Owner Literasea"
            : "Administrator Literasea",
        );
        const fallbackEmail = pickDisplayIdentity(
          [adminRow.email, session.user.email],
          currentRole === "owner" ? "owner@literasea.id" : "admin@literasea.id",
        );
        const useFallbackIdentity = isDummyAdminRow(adminRow);

        currentUser = {
          name: useFallbackIdentity
            ? fallbackName
            : adminRow.full_name || fallbackName,
          email: useFallbackIdentity
            ? fallbackEmail
            : adminRow.email || fallbackEmail,
        };

        setupApp();
        startMemberRealtimeSync();
      }

      function setupApp() {
        document.getElementById("appScreen").classList.add("active");
        document.getElementById("sidebarUserName").textContent =
          currentUser.name;
        document.getElementById("sidebarUserEmail").textContent =
          currentUser.email;

        const badge = document.getElementById("roleBadge");
        const navAdmin = document.getElementById("navAdmin");
        const navOwner = document.getElementById("navOwner");

        if (currentRole === "owner") {
          badge.textContent = "👑 OWNER";
          badge.className = "sidebar-role-badge badge-owner";
          navAdmin.style.display = "none";
          navOwner.style.display = "block";
          document.getElementById("topbarTitle").textContent =
            "Dashboard Owner";
          showPage("ownerDashboard");
          document.querySelector("#navOwner .nav-item").classList.add("active");
          renderKelolaAdmin();
          renderIzinAkses();
        } else {
          badge.textContent = "🛡️ ADMIN";
          badge.className = "sidebar-role-badge badge-admin";
          showPage("adminDashboard");
        }

        startBookRealtimeSync();
        startHelpdeskRealtimeSync();
      }

      async function doLogout() {
        if (!confirm("Yakin ingin keluar?")) return;
        await supabaseClient.auth.signOut();
        if (memberRealtimeChannel) {
          supabaseClient.removeChannel(memberRealtimeChannel);
          memberRealtimeChannel = null;
        }
        if (bookRealtimeChannel) {
          supabaseClient.removeChannel(bookRealtimeChannel);
          bookRealtimeChannel = null;
        }
        if (helpdeskRealtimeChannel) {
          supabaseClient.removeChannel(helpdeskRealtimeChannel);
          helpdeskRealtimeChannel = null;
        }
        currentRole = null;
        currentUser = null;
        window.location.replace("index.html");
      }

// ===== INIT: jalankan auth guard saat halaman dibuka =====
      document.addEventListener("DOMContentLoaded", async () => {
        await checkAuthAndLoad();
        await loadDashboardHelpdesk();
      });

      // Kalau session berakhir / logout dari tab lain, ikut dilempar keluar
      supabaseClient.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          window.location.href = "index.html";
        }
      });
