async function loadKonfirmasiPeminjaman() {
        const container = document.getElementById("daftarPeminjamanAdmin");
        const badge = document.getElementById("badgePeminjamanMenunggu");
        if (!container) return;

        container.innerHTML =
          '<p style="color:#94a3b8">Memuat pengajuan peminjaman...</p>';

        const { data, error } = await fetchPeminjamanRows({
          statuses: ["menunggu", "pending"],
          ascending: false,
        });

        if (error) {
          container.innerHTML = `<p style="color:#ef4444">Gagal memuat data peminjaman: ${escapeHtml(error.message || "Unknown error")}</p>`;
          if (badge) badge.textContent = "0 Menunggu";
          showToast(
            "Gagal memuat konfirmasi peminjaman: " + error.message,
            "danger",
          );
          console.error(error);
          return;
        }

        const rows = data || [];
        if (badge) badge.textContent = `${rows.length} Menunggu`;

        if (!rows.length) {
          container.innerHTML =
            '<p style="color:#94a3b8">Belum ada pengajuan peminjaman.</p>';
          return;
        }

        let bookRows = allKoleksiBuku;
        if (!bookRows.length) {
          try {
            bookRows = await loadBookRowsFromDatabase();
          } catch (loadError) {
            console.warn(
              "Gagal menyiapkan data buku untuk konfirmasi:",
              loadError,
            );
          }
        }

        const bookMap = new Map(
          (bookRows || [])
            .filter((book) => book?._dbId)
            .map((book) => [String(book._dbId), book]),
        );

        const userIds = [
          ...new Set(rows.map((item) => item.user_id).filter(Boolean)),
        ];
        let profileMap = new Map();
        if (userIds.length) {
          const { data: profiles } = await supabaseClient
            .from("profiles")
            .select("id, full_name, email, member_id")
            .in("id", userIds);

          profileMap = new Map(
            (profiles || []).map((profile) => [String(profile.id), profile]),
          );
        }

        container.innerHTML = rows
          .map((item) => {
            const linkedBook = bookMap.get(String(item.buku_id || ""));
            const linkedProfile = profileMap.get(String(item.user_id || ""));
            const judulBuku =
              item.judul_buku || linkedBook?.judul || "Judul tidak tersedia";
            const namaAnggota =
              item.nama_anggota ||
              linkedProfile?.full_name ||
              linkedProfile?.email ||
              item.user_id ||
              "Anggota";
            const memberId = linkedProfile?.member_id
              ? ` (${escapeHtml(linkedProfile.member_id)})`
              : "";
            const durasiHari = Number(item.durasi_hari) || 7;
            const tanggalPinjam = item.tanggal_pinjam
              ? new Date(item.tanggal_pinjam).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "-";

            return `
              <div class="confirm-item">
                <div class="confirm-info">
                  <h4>${escapeHtml(judulBuku)}</h4>
                  <p>👤 ${escapeHtml(namaAnggota)}${memberId}</p>
                  <p>📅 Diajukan: ${escapeHtml(tanggalPinjam)}</p>
                  <p>⏳ Durasi: ${durasiHari} hari</p>
                </div>
                <div class="confirm-actions">
                  <button
                    class="btn btn-success"
                    onclick="approveAction('${escapeHtml(item.id)}')"
                  >
                    ✓ Setujui
                  </button>
                  <button
                    class="btn btn-danger"
                    onclick="rejectAction('${escapeHtml(item.id)}')"
                  >
                    ✕ Tolak
                  </button>
                </div>
              </div>
            `;
          })
          .join("");
      }

// ===== ADMIN ACTIONS =====
      async function approveAction(id) {
        if (!id || typeof id !== "string") {
          showToast("ID peminjaman tidak ditemukan.", "warning");
          return;
        }

        const { data: peminjaman, error: fetchError } = await supabaseClient
          .from("peminjaman")
          .select("id, tanggal_pinjam, tanggal_kembali, durasi_hari")
          .eq("id", id)
          .maybeSingle();

        if (fetchError) {
          showToast(
            "Gagal membaca data peminjaman: " + fetchError.message,
            "danger",
          );
          return;
        }
        if (!peminjaman) {
          showToast("Data peminjaman tidak ditemukan.", "warning");
          return;
        }

        const tanggalPinjam =
          peminjaman?.tanggal_pinjam || new Date().toISOString().split("T")[0];
        const durasiHari = Number(peminjaman?.durasi_hari) || 7;
        let tanggalKembali = peminjaman?.tanggal_kembali || null;

        if (!tanggalKembali) {
          const baseDate = new Date(`${tanggalPinjam}T00:00:00`);
          if (!Number.isNaN(baseDate.getTime())) {
            baseDate.setDate(baseDate.getDate() + durasiHari);
            tanggalKembali = baseDate.toISOString().split("T")[0];
          }
        }

        const updatePayload = {
          status: "dipinjam",
          tanggal_pinjam: tanggalPinjam,
          tanggal_kembali: tanggalKembali,
        };

        const { error } = await supabaseClient
          .from("peminjaman")
          .update(updatePayload)
          .eq("id", id);

        if (error) {
          showToast(error.message, "danger");
          return;
        }

        await loadKonfirmasiPeminjaman();
        await loadKonfirmasiPengembalian();
        loadDashboardStats();
        showToast("✅ Peminjaman disetujui!", "success");
      }

      async function rejectAction(id) {
        if (!id || typeof id !== "string") {
          showToast("ID peminjaman tidak ditemukan.", "warning");
          return;
        }

        const { error } = await supabaseClient
          .from("peminjaman")
          .update({ status: "ditolak" })
          .eq("id", id);

        if (error) {
          showToast("Gagal menolak peminjaman: " + error.message, "danger");
          return;
        }

        await loadKonfirmasiPeminjaman();
        loadDashboardStats();
        showToast("❌ Pengajuan peminjaman ditolak.", "warning");
      }
