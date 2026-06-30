// ===== OWNER ACTIONS (tersambung ke tabel admin_users di Supabase) =====
      function editAdmin(nama) {
        showToast(`✏️ Membuka form edit admin: ${nama}`, "info");
      }

      async function hapusAdmin(btn, nama, adminId) {
        if (!confirm(`Hapus akun admin ${nama}?`)) return;

        if (adminId) {
          const { error } = await supabaseClient
            .from("admin_users")
            .delete()
            .eq("id", adminId);

          if (error) {
            showToast("Gagal menghapus: " + error.message, "danger");
            return;
          }
        }

        const row = btn.closest("tr");
        row.style.opacity = "0";
        row.style.transition = ".3s";
        setTimeout(() => row.remove(), 300);
        showToast(`🗑️ Admin ${nama} dihapus!`, "danger");
        renderIzinAkses();
      }

      // Catatan: membuat akun login baru (auth.users) dari sisi browser akan
      // mengganti session yang sedang aktif (session owner). Karena itu, alur
      // yang dipakai di sini adalah: Owner membuat user di Supabase Dashboard
      // (Authentication > Users), lalu menempelkan "User UID" hasilnya di sini
      // supaya hanya tabel admin_users (data role) yang diisi lewat aplikasi --
      // session owner yang sedang login tidak ikut tergusur.
      async function simpanAdmin() {
        const modal = document.getElementById("modalTambahAdmin");
        const inputs = modal.querySelectorAll("input");
        const select = modal.querySelector("select");

        const fullName = inputs[0]?.value.trim();
        const email = inputs[1]?.value.trim();
        const password = inputs[2]?.value.trim();
        const levelAkses = select?.value === "Full Admin" ? "admin" : "admin";

        if (!fullName || !email || !password) {
          showToast(
            "Lengkapi Nama, Email, dan Password terlebih dahulu",
            "danger",
          );
          return;
        }

        // Ambil token user yang sedang login (owner), untuk verifikasi di Edge Function
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (!session) {
          showToast("Sesi login berakhir, silakan login ulang.", "danger");
          return;
        }

        const saveBtn = document.querySelector("#modalTambahAdmin .btn-owner");
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = "Menyimpan...";
        }

        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/quick-api`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              full_name: fullName,
              email: email,
              password: password,
              role: levelAkses,
            }),
          });

          const result = await res.json();

          if (!res.ok) {
            showToast(
              "Gagal membuat akun admin: " +
                (result.error || "Terjadi kesalahan"),
              "danger",
            );
            return;
          }

          showToast("🛡️ Akun admin baru berhasil dibuat!", "success");
          closeModal("modalTambahAdmin");
          inputs.forEach((i) => (i.value = ""));
          renderKelolaAdmin();
          renderIzinAkses();
        } catch (e) {
          showToast("Gagal menghubungi server: " + e.message, "danger");
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "💾 Buat Akun";
          }
        }
      }

      // Render tabel "Kelola Akun Admin" (Owner) dari tabel admin_users di Supabase.
      // Struktur baris (badge, class) disamakan dengan markup asli supaya tampilan
      // tidak berubah sama sekali.
      function normalizeIdentityText(value) {
        return String(value || "")
          .trim()
          .toLowerCase();
      }

      function isDummyIdentityValue(value) {
        const normalized = normalizeIdentityText(value);
        if (!normalized) return false;

        return (
          normalized === "christian" ||
          normalized === "davissunyorochristian" ||
          normalized === "davissunyorochristian@gmail.com"
        );
      }

      function pickDisplayIdentity(candidates, fallbackValue) {
        const match = (Array.isArray(candidates) ? candidates : []).find(
          (candidate) =>
            String(candidate || "").trim() && !isDummyIdentityValue(candidate),
        );

        return match || fallbackValue;
      }

      function isDummyAdminRow(row) {
        const fullName = normalizeIdentityText(row?.full_name);
        const email = normalizeIdentityText(row?.email);

        return isDummyIdentityValue(fullName) || isDummyIdentityValue(email);
      }

      async function renderKelolaAdmin() {
        const tbody = document.getElementById("kelolaAdminTbody");
        if (!tbody) return;

        const { data: rows, error } = await supabaseClient
          .from("admin_users")
          .select("id, full_name, email, role, created_at")
          .order("created_at", { ascending: true });

        if (error) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444;">Gagal memuat data: ${error.message}</td></tr>`;
          return;
        }

        const visibleRows = (rows || []).filter((row) => !isDummyAdminRow(row));

        if (!visibleRows.length) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Belum ada akun admin/owner.</td></tr>`;
          return;
        }

        tbody.innerHTML = visibleRows
          .map((row) => {
            const tanggal = row.created_at
              ? new Date(row.created_at).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "-";
            const aksesBadge =
              row.role === "owner"
                ? '<span class="badge badge-purple">Owner</span>'
                : '<span class="badge badge-blue">Full Admin</span>';
            const namaAman = (row.full_name || "-").replace(/'/g, "\\'");
            return `
                <tr>
                  <td><strong>${row.full_name || "-"}</strong></td>
                  <td>${row.email || "-"}</td>
                  <td>${tanggal}</td>
                  <td><span class="badge badge-green">Aktif</span></td>
                  <td>${aksesBadge}</td>
                  <td>
                    <button class="btn btn-outline btn-sm" onclick="editAdmin('${namaAman}')">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="hapusAdmin(this,'${namaAman}','${row.id}')">🗑️</button>
                  </td>
                </tr>`;
          })
          .join("");
      }

      // Render tabel "🔐 Izin Akses per Admin" -- kolom dibuat otomatis sesuai
      // jumlah & nama admin yang benar-benar ada di database (bukan hardcode).
      const FITUR_IZIN_AKSES = [
        "Kelola Buku",
        "Konfirmasi Peminjaman",
        "Konfirmasi Pengembalian",
        "Kelola Anggota",
        "Helpdesk Chat",
      ];

      async function renderIzinAkses() {
        const thead = document.getElementById("izinAksesThead");
        const tbody = document.getElementById("izinAksesTbody");
        if (!thead || !tbody) return;

        const { data: rows, error } = await supabaseClient
          .from("admin_users")
          .select("id, full_name, role")
          .order("created_at", { ascending: true });

        const visibleRows = (rows || []).filter((row) => !isDummyAdminRow(row));

        if (error || visibleRows.length === 0) {
          thead.innerHTML = "<tr><th>Fitur</th></tr>";
          tbody.innerHTML = `<tr><td style="text-align:center; color:#94a3b8;">Belum ada admin untuk ditampilkan.</td></tr>`;
          return;
        }

        // Header kolom = nama setiap admin/owner yang ada di database
        thead.innerHTML =
          "<tr><th>Fitur</th>" +
          visibleRows.map((r) => `<th>${r.full_name || r.role}</th>`).join("") +
          "</tr>";

        // Baris = setiap fitur, dengan switch akses per admin (default: owner full akses)
        tbody.innerHTML = FITUR_IZIN_AKSES.map((fitur) => {
          const cols = visibleRows
            .map((r) => {
              const checked = r.role === "owner" ? "checked" : "";
              return `<td><label class="switch"><input type="checkbox" ${checked}><span class="slider"></span></label></td>`;
            })
            .join("");
          return `<tr><td>${fitur}</td>${cols}</tr>`;
        }).join("");
      }

      function formatHelpdeskTime(value) {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      function formatHelpdeskDate(value) {
        const date = new Date(value || Date.now());
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }

      function looksLikeUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          String(value || "").trim(),
        );
      }

// ===== FILTER TABLE =====
      // ===== PENERIMAAN BUKU =====
      async function loadPenerimaanBuku() {
        const { data, error } = await supabaseClient
          .from("purchase_order")
          .select("*, purchase_order_item(*)")
          .eq("status", "dikirim")
          .order("created_at", { ascending: false });

        const container = document.getElementById("list-penerimaan");
        if (error) {
          container.innerHTML =
            '<p style="color:#94a3b8;">Gagal memuat data.</p>';
          return;
        }
        if (!data || data.length === 0) {
          container.innerHTML =
            '<p style="color:#94a3b8;">Tidak ada PO yang sedang dikirim.</p>';
          return;
        }

        container.innerHTML = data
          .map(
            (d) => `
    <div style="padding:16px; border:1px solid #bfdbfe; border-radius:12px; background:white;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div>
          <div style="font-weight:800; font-size:15px;">${d.nomor_po}</div>
          <div style="font-size:12px; color:#64748b;">🏢 ${d.penerbit} · ${new Date(d.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        <span style="font-size:12px; font-weight:700; color:#3b82f6;">📦 Dikirim</span>
      </div>

      <!-- Daftar buku -->
      <div style="background:#f8fafc; border-radius:8px; padding:10px; margin-bottom:12px;">
        <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:6px;">📚 Daftar Buku (${d.purchase_order_item?.length || 0} judul)</div>
        ${
          d.purchase_order_item
            ?.map(
              (item) => `
          <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #f1f5f9;">
            <div style="flex:1; font-size:13px; color:#374151;">
              <strong>${item.judul_buku}</strong>${item.penulis ? ` — ${item.penulis}` : ""}
            </div>
            <div style="font-size:12px; color:#7c3aed; font-weight:600; white-space:nowrap;">${item.jumlah} eks</div>
          </div>
        `,
            )
            .join("") ||
          '<div style="font-size:13px; color:#94a3b8;">Tidak ada item</div>'
        }
      </div>

      ${d.catatan ? `<div style="font-size:13px; color:#475569; margin-bottom:12px;">📝 ${d.catatan}</div>` : ""}

      <button class="btn btn-primary" onclick="konfirmasiTerima('${d.id}', '${d.nomor_po}')">✅ Konfirmasi Buku Diterima</button>
    </div>
  `,
          )
          .join("");
      }

      async function konfirmasiTerima(poId, nomorPO) {
        const konfirm = confirm(
          `Konfirmasi bahwa buku dari PO ${nomorPO} sudah diterima?`,
        );
        if (!konfirm) return;

        const { error } = await supabaseClient
          .from("purchase_order")
          .update({ status: "diterima", updated_at: new Date().toISOString() })
          .eq("id", poId);

        if (error) {
          showToast("Gagal mengkonfirmasi", "error");
          return;
        }
        showToast("✅ Buku berhasil dikonfirmasi diterima!");
        loadPenerimaanBuku();
      }
      // ===== PURCHASE ORDER =====
      let allPO = [];
      let rekomendasiList = [];

      async function loadPurchaseOrder() {
        const { data, error } = await supabaseClient
          .from("purchase_order")
          .select("*, purchase_order_item(*)")
          .order("created_at", { ascending: false });

        if (error) {
          showToast("Gagal memuat PO", "error");
          return;
        }
        allPO = data || [];
        renderPO(allPO);
      }

      function filterPO(status) {
        if (status === "semua") renderPO(allPO);
        else renderPO(allPO.filter((d) => d.status === status));
      }

      function renderPO(data) {
        const container = document.getElementById("list-po");
        if (!data || data.length === 0) {
          container.innerHTML =
            '<p style="color:#94a3b8;">Belum ada Purchase Order.</p>';
          return;
        }

        const badgeColor = {
          draft: "#f59e0b",
          dikirim: "#3b82f6",
          diterima: "#10a37f",
          dibatalkan: "#ef4444",
        };
        const badgeLabel = {
          draft: "📝 Draft",
          dikirim: "📦 Dikirim",
          diterima: "✅ Diterima",
          dibatalkan: "❌ Dibatalkan",
        };

        container.innerHTML = data
          .map(
            (d) => `
    <div style="padding:16px; border:1px solid var(--border); border-radius:12px; background:white;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
        <div>
          <div style="font-weight:800; font-size:15px;">${d.nomor_po}</div>
          <div style="font-size:12px; color:#64748b;">🏢 ${d.penerbit} · ${new Date(d.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
          <div style="font-size:12px; color:#64748b;">👤 ${d.nama_pembuat || "-"}</div>
        </div>
        <span style="font-size:12px; font-weight:700; color:${badgeColor[d.status]};">${badgeLabel[d.status]}</span>
      </div>

      <!-- Daftar buku -->
      <div style="background:#f8fafc; border-radius:8px; padding:10px; margin-bottom:10px;">
        <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:6px;">📚 Daftar Buku (${d.purchase_order_item?.length || 0} judul)</div>
        ${
          d.purchase_order_item
            ?.map(
              (item) => `
          <div style="font-size:13px; color:#374151; padding:2px 0;">• ${item.judul_buku}${item.penulis ? ` — ${item.penulis}` : ""} <span style="color:#7c3aed; font-weight:600;">(${item.jumlah} eks)</span></div>
        `,
            )
            .join("") ||
          '<div style="font-size:13px; color:#94a3b8;">Tidak ada item</div>'
        }
      </div>

      ${d.catatan ? `<div style="font-size:13px; color:#475569; margin-bottom:10px;">📝 ${d.catatan}</div>` : ""}

      <!-- Tombol aksi -->
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${d.status === "draft" ? `<button class="btn btn-owner btn-sm" onclick="ubahStatusPO('${d.id}', 'dikirim')">Konfirmasi</button>` : ""}
        ${d.status === "dikirim" ? `<button class="btn btn-sm" style="background:#d1fae5; color:#065f46;" onclick="ubahStatusPO('${d.id}', 'diterima')">✅ Tandai Diterima</button>` : ""}
        ${d.status === "draft" ? `<button class="btn btn-sm" style="background:#fee2e2; color:#991b1b;" onclick="ubahStatusPO('${d.id}', 'dibatalkan')">❌ Batalkan</button>` : ""}
      </div>
    </div>
  `,
          )
          .join("");
      }

      async function loadRekomendasiUntukPO() {
        const { data } = await supabaseClient
          .from("masukan_buku")
          .select("*")
          .eq("status", "disetujui")
          .order("created_at", { ascending: false });

        rekomendasiList = data || [];
        const container = document.getElementById("po-checklist");
        if (!rekomendasiList.length) {
          container.innerHTML =
            '<p style="color:#94a3b8; font-size:13px;">Tidak ada rekomendasi yang disetujui.</p>';
          return;
        }

        container.innerHTML = rekomendasiList
          .map(
            (d) => `
    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; font-size:13px;">
      <input type="checkbox" value="${d.id}" data-judul="${d.judul_buku}" data-penulis="${d.penulis || ""}">
      <span><strong>${d.judul_buku}</strong>${d.penulis ? ` — ${d.penulis}` : ""}</span>
      <input type="number" min="1" value="1" style="width:55px; padding:4px 6px; border:1px solid var(--border); border-radius:6px; font-size:12px; margin-left:auto;">
    </label>
  `,
          )
          .join("");
      }

      async function simpanPO(status) {
        const nomor = document.getElementById("po-nomor").value.trim();
        const penerbit = document.getElementById("po-penerbit").value.trim();
        const catatan = document.getElementById("po-catatan").value.trim();

        if (!nomor) {
          showToast("Nomor PO wajib diisi!");
          return;
        }
        if (!penerbit) {
          showToast("Nama penerbit wajib diisi!");
          return;
        }

        const checkboxes = document.querySelectorAll(
          '#po-checklist input[type="checkbox"]:checked',
        );
        if (checkboxes.length === 0) {
          showToast("Pilih minimal 1 buku!");
          return;
        }

        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        const { data: adminRow } = await supabaseClient
          .from("admin_users")
          .select("full_name")
          .eq("id", user.id)
          .single();

        const { data: po, error } = await supabaseClient
          .from("purchase_order")
          .insert({
            nomor_po: nomor,
            penerbit,
            catatan: catatan || null,
            status,
            dibuat_oleh: user.id,
            nama_pembuat: adminRow?.full_name || user.email,
          })
          .select()
          .single();

        if (error) {
          showToast("Gagal membuat PO: " + (error.message || ""), "error");
          return;
        }

        const items = Array.from(checkboxes).map((cb) => {
          const row = cb.closest("label");
          const jumlah =
            parseInt(row.querySelector('input[type="number"]').value) || 1;
          return {
            po_id: po.id,
            masukan_id: cb.value,
            judul_buku: cb.dataset.judul,
            penulis: cb.dataset.penulis || null,
            jumlah,
          };
        });

        await supabaseClient.from("purchase_order_item").insert(items);

        showToast("✅ Purchase Order berhasil dibuat!");
        closeModal("modalBuatPO");
        document.getElementById("po-nomor").value = "";
        document.getElementById("po-penerbit").value = "";
        document.getElementById("po-catatan").value = "";
        loadPurchaseOrder();
      }

      async function ubahStatusPO(id, status) {
        const { error } = await supabaseClient
          .from("purchase_order")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (error) {
          showToast("Gagal update status", "error");
          return;
        }
        showToast("✅ Status PO diperbarui");
        loadPurchaseOrder();
      }
      // ===== MASUKAN BUKU =====

      async function loadMasukanBuku() {
        const { data, error } = await supabaseClient
          .from("masukan_buku")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          showToast("Gagal memuat data masukan", "error");
          return;
        }
        allMasukan = data || [];
        renderMasukan(allMasukan);
      }

      function filterMasukan(status) {
        if (status === "semua") renderMasukan(allMasukan);
        else renderMasukan(allMasukan.filter((d) => d.status === status));
      }

      function renderMasukan(data) {
        const container = document.getElementById("list-masukan-admin");
        if (!data || data.length === 0) {
          container.innerHTML =
            '<p style="color:#94a3b8;">Tidak ada data masukan.</p>';
          return;
        }

        const badgeColor = {
          pending: "#f59e0b",
          diproses: "#3b82f6",
          disetujui: "#10a37f",
          ditolak: "#ef4444",
        };
        const badgeLabel = {
          pending: "⏳ Pending",
          diproses: "🔄 Diproses",
          disetujui: "✅ Disetujui",
          ditolak: "❌ Ditolak",
        };

        container.innerHTML = data
          .map(
            (d) => `
    <div style="padding:16px; border:1px solid var(--border); border-radius:12px; background:white;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
        <div>
          <div style="font-weight:700; font-size:15px;">${d.judul_buku}</div>
          ${d.penulis ? `<div style="font-size:12px; color:#64748b;">✍️ ${d.penulis}</div>` : ""}
          <div style="font-size:12px; color:#64748b;">👤 ${d.nama_user} · ${new Date(d.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        <span style="font-size:12px; font-weight:700; color:${badgeColor[d.status]};">${badgeLabel[d.status]}</span>
      </div>
      ${d.alasan ? `<div style="font-size:13px; color:#475569; margin-bottom:10px;">💬 "${d.alasan}"</div>` : ""}
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <select id="status-${d.id}" style="padding:6px 10px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-family:'Nunito',sans-serif;">
          <option value="pending" ${d.status === "pending" ? "selected" : ""}>⏳ Pending</option>
          <option value="diproses" ${d.status === "diproses" ? "selected" : ""}>🔄 Diproses</option>
          <option value="disetujui" ${d.status === "disetujui" ? "selected" : ""}>✅ Disetujui</option>
          <option value="ditolak" ${d.status === "ditolak" ? "selected" : ""}>❌ Ditolak</option>
        </select>
        <input type="text" id="catatan-${d.id}" placeholder="Catatan untuk pengunjung (opsional)..." value="${d.catatan_admin || ""}" style="flex:1; padding:6px 10px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-family:'Nunito',sans-serif; min-width:180px;">
        <button class="btn btn-primary btn-sm" onclick="simpanMasukan('${d.id}')">💾 Simpan</button>
      </div>
    </div>
  `,
          )
          .join("");
      }

      async function simpanMasukan(id) {
        const status = document.getElementById(`status-${id}`).value;
        const catatan = document.getElementById(`catatan-${id}`).value.trim();

        const { error } = await supabaseClient
          .from("masukan_buku")
          .update({ status, catatan_admin: catatan || null })
          .eq("id", id);

        if (error) {
          showToast("Gagal menyimpan", "error");
          return;
        }
        showToast("✅ Status berhasil diperbarui");
        loadMasukanBuku();
      }

      async function loadRekomendasiOwner() {
        const { data, error } = await supabaseClient
          .from("masukan_buku")
          .select("*")
          .eq("status", "disetujui")
          .order("created_at", { ascending: false });

        const container = document.getElementById("list-rekomendasi-owner");
        if (error || !data || data.length === 0) {
          container.innerHTML =
            '<p style="color:#94a3b8;">Belum ada rekomendasi yang disetujui admin.</p>';
          return;
        }

        container.innerHTML = data
          .map(
            (d, i) => `
    <div style="padding:16px; border:1px solid #bbf7d0; border-radius:12px; background:#f0fdf4; display:flex; gap:16px; align-items:flex-start;">
      <div style="font-size:20px; font-weight:800; color:#10a37f; min-width:32px;">${i + 1}</div>
      <div style="flex:1;">
        <div style="font-weight:700; font-size:15px; color:#065f46;">${d.judul_buku}</div>
        ${d.penulis ? `<div style="font-size:12px; color:#047857;">✍️ ${d.penulis}</div>` : ""}
        ${d.alasan ? `<div style="font-size:13px; color:#374151; margin-top:4px;">💬 "${d.alasan}"</div>` : ""}
        <div style="font-size:11px; color:#6b7280; margin-top:4px;">Diusulkan: ${new Date(d.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
    </div>
  `,
          )
          .join("");
      }

      function exportRekomendasi() {
        const approved = allMasukan.filter((d) => d.status === "disetujui");
        if (approved.length === 0) {
          showToast("Belum ada data untuk diexport", "error");
          return;
        }

        const rows = [
          [
            "No",
            "Judul Buku",
            "Penulis",
            "Alasan",
            "Diusulkan Oleh",
            "Tanggal",
          ],
        ];
        approved.forEach((d, i) => {
          rows.push([
            i + 1,
            d.judul_buku,
            d.penulis || "-",
            d.alasan || "-",
            d.nama_user,
            new Date(d.created_at).toLocaleDateString("id-ID"),
          ]);
        });

        const csv = rows
          .map((r) => r.map((v) => `"${v}"`).join(","))
          .join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "rekomendasi_buku.csv";
        a.click();
        URL.revokeObjectURL(url);
      }
