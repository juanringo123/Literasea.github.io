// =====Pengembalian========
      function parseAdminDateOnly(value) {
        if (!value) return null;
        const raw = String(value).trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const [, year, month, day] = match;
          return new Date(Number(year), Number(month) - 1, Number(day));
        }

        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return null;
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      }

      function getAdminOverdueDays(item) {
        if (
          !item ||
          String(item.status || "")
            .trim()
            .toLowerCase() !== "dipinjam"
        ) {
          return 0;
        }

        const dueDate = parseAdminDateOnly(item.tanggal_kembali);
        if (!dueDate) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - dueDate.getTime();
        return Math.max(0, Math.floor(diffMs / 86400000));
      }

      function formatAdminRupiah(value) {
        return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
      }

      function normalizeAdminFinePaymentStatus(value, fineAmount = 0) {
        const normalized = String(value || "")
          .trim()
          .toLowerCase();

        if (
          normalized === "belum_dibayar" ||
          normalized === "menunggu_verifikasi" ||
          normalized === "lunas"
        ) {
          return normalized;
        }

        return Number(fineAmount) > 0 ? "belum_dibayar" : "belum_dibayar";
      }

      function getAdminFineStatusMeta(status) {
        if (status === "lunas") {
          return { label: "Lunas", className: "badge-green" };
        }
        if (status === "menunggu_verifikasi") {
          return { label: "Menunggu Verifikasi", className: "badge-blue" };
        }
        return { label: "Belum Dibayar", className: "badge-red" };
      }

      async function loadKonfirmasiPengembalian() {
        const container = document.getElementById("daftarPengembalianAdmin");
        if (!container) return;

        const { data, error } = await fetchPeminjamanRows({
          statuses: ["dipinjam", "dikembalikan"],
          ascending: false,
        });

        if (error) {
          console.error(error);
          container.innerHTML = "<p>Gagal memuat data pengembalian.</p>";
          return;
        }

        const rows = (data || [])
          .map((item) => ({
            ...item,
            _fineState: getAdminLoanFineState(item),
          }))
          .filter(
            (item) =>
              item._fineState.normalizedStatus === "dipinjam" ||
              item._fineState.hasOutstandingFine,
          );
        document.getElementById("badgePengembalian").textContent =
          `${rows.length} Tindak Lanjut`;

        if (!rows.length) {
          container.innerHTML =
            "<p>Tidak ada pengembalian atau denda yang perlu ditindaklanjuti</p>";
          return;
        }

        let bookMap = new Map();
        if (allKoleksiBuku.length) {
          bookMap = new Map(
            allKoleksiBuku
              .filter((book) => book._dbId)
              .map((book) => [String(book._dbId), book]),
          );
        }

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
            const fineState = item._fineState || getAdminLoanFineState(item);
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
            const tanggalKembali = item.tanggal_kembali
              ? new Date(item.tanggal_kembali).toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "-";
            const overdueDays = getAdminOverdueDays(item);
            const estimatedFine = fineState.estimatedFine;
            const fineStatus = fineState.fineStatus;
            const fineStatusMeta =
              estimatedFine > 0
                ? getAdminFineStatusMeta(fineStatus)
                : { label: "Tidak Ada Denda", className: "badge-green" };
            const canProcessReturn = fineState.canProcessReturn;
            const isReturned = fineState.isReturned;
            const fineInfo =
              estimatedFine > 0
                ? `${formatAdminRupiah(estimatedFine)} • ${
                    overdueDays > 0
                      ? `${overdueDays} hari terlambat`
                      : isReturned
                        ? "Buku sudah dikembalikan"
                        : "Denda tersimpan"
                  }`
                : "Tidak ada denda";
            const returnStatusMeta = isReturned
              ? { label: "Sudah Dikembalikan", className: "badge-green" }
              : { label: "Masih Dipinjam", className: "badge-blue" };
            let actionButtons = `<button class="btn btn-outline" onclick="showFineDetail(this)">
                    💳 Menunggu Pembayaran
                  </button>`;

            if (isReturned) {
              actionButtons =
                fineStatus === "menunggu_verifikasi"
                  ? `<button
                      class="btn btn-primary"
                      onclick="markFinePaidOnly('${escapeHtml(item.id)}', '${escapeHtml(
                        namaAnggota,
                      ).replace(/'/g, "\\'")}')">
                      💰 Tandai Lunas
                    </button>`
                  : `<button class="btn btn-outline" onclick="showFineDetail(this)">
                      💳 Menunggu Pembayaran
                    </button>`;
            } else if (canProcessReturn) {
              actionButtons = `<button
                    class="btn btn-success"
                    onclick="processReturn('${escapeHtml(item.id)}', '${escapeHtml(
                      namaAnggota,
                    ).replace(/'/g, "\\'")}')">
                    ✅ Proses
                  </button>`;
            } else if (fineStatus === "menunggu_verifikasi") {
              actionButtons = `<button
                    class="btn btn-primary"
                    onclick="markFinePaidAndProcessReturn('${escapeHtml(item.id)}', '${escapeHtml(
                      namaAnggota,
                    ).replace(/'/g, "\\'")}')">
                    💰 Lunas & Proses
                  </button>`;
            }

            return `
              <div class="confirm-item">
                <div class="confirm-info">
                  <h4>${escapeHtml(judulBuku)}</h4>
                  <p>👤 ${escapeHtml(namaAnggota)}${memberId}</p>
                  <p>
                    🔄 Status Pengembalian:
                    <span class="badge ${escapeHtml(
                      returnStatusMeta.className,
                    )}">${escapeHtml(returnStatusMeta.label)}</span>
                  </p>
                  <p>Jatuh Tempo: ${escapeHtml(tanggalKembali)}</p>
                  <p>
                    💰 Denda: ${escapeHtml(fineInfo)}
                    <span class="badge ${escapeHtml(
                      fineStatusMeta.className,
                    )}">${escapeHtml(fineStatusMeta.label)}</span>
                  </p>
                </div>

                <div class="confirm-actions">
                  ${actionButtons}
                </div>
              </div>
            `;
          })
          .join("");
      }

async function processReturn(id, nama = "anggota") {
        if (!id || typeof id !== "string") {
          showToast("ID pengembalian tidak ditemukan.", "warning");
          return;
        }

        const { data: loan, error: loanError } =
          await fetchReturnLoanForAdmin(id);

        if (loanError) {
          showToast(
            "Gagal membaca data pengembalian: " + loanError.message,
            "danger",
          );
          return;
        }
        if (!loan) {
          showToast("Data pengembalian tidak ditemukan.", "warning");
          return;
        }

        const overdueDays = getAdminOverdueDays(loan);
        const estimatedFine =
          overdueDays > 0
            ? overdueDays * TARIF_DENDA_ADMIN
            : Number(loan?.denda) || 0;
        const fineStatus = normalizeAdminFinePaymentStatus(
          loan?.status_pembayaran_denda,
          estimatedFine,
        );

        if (estimatedFine > 0 && fineStatus !== "lunas") {
          showToast(
            "Denda belum lunas. Tandai pembayaran lunas dulu sebelum memproses pengembalian.",
            "warning",
          );
          return;
        }

        const { error } = await updatePeminjamanSafe(id, {
            status: "dikembalikan",
            denda: estimatedFine,
            status_pembayaran_denda:
              estimatedFine > 0
                ? "lunas"
                : loan?.status_pembayaran_denda || "belum_dibayar",
          });

        if (error) {
          showToast("Gagal memproses pengembalian: " + error.message, "danger");
          return;
        }

        await loadKonfirmasiPengembalian();
        loadDashboardStats();
        showToast(`🔄 Pengembalian ${nama} diproses!`, "success");
      }

      async function markFinePaidAndProcessReturn(id, nama = "anggota") {
        if (!id || typeof id !== "string") {
          showToast("ID pembayaran denda tidak ditemukan.", "warning");
          return;
        }

        const { data: loan, error: loanError } =
          await fetchReturnLoanForAdmin(id);

        if (loanError) {
          showToast(
            "Gagal membaca data pengembalian: " + loanError.message,
            "danger",
          );
          return;
        }
        if (!loan) {
          showToast("Data pengembalian tidak ditemukan.", "warning");
          return;
        }

        const estimatedFine = getEstimatedLoanFine(loan);
        if (estimatedFine <= 0) {
          showToast("Nominal denda tidak ditemukan.", "warning");
          return;
        }

        const { error } = await updatePeminjamanSafe(id, {
          status: "dikembalikan",
          denda: estimatedFine,
          status_pembayaran_denda: "lunas",
        });

        if (error) {
          showToast("Gagal menandai denda lunas: " + error.message, "danger");
          return;
        }

        await loadKonfirmasiPengembalian();
        loadDashboardStats();
        showToast(
          `💰 Denda ${nama} ditandai lunas dan pengembalian diproses!`,
          "success",
        );
      }

      async function markFinePaidOnly(id, nama = "anggota") {
        if (!id || typeof id !== "string") {
          showToast("ID pembayaran denda tidak ditemukan.", "warning");
          return;
        }

        const { data: loan, error: loanError } =
          await fetchReturnLoanForAdmin(id);

        if (loanError) {
          showToast(
            "Gagal membaca data pengembalian: " + loanError.message,
            "danger",
          );
          return;
        }
        if (!loan) {
          showToast("Data pengembalian tidak ditemukan.", "warning");
          return;
        }

        const estimatedFine = getEstimatedLoanFine(loan);
        if (estimatedFine <= 0) {
          showToast("Nominal denda tidak ditemukan.", "warning");
          return;
        }

        const { error } = await updatePeminjamanSafe(id, {
          denda: estimatedFine,
          status_pembayaran_denda: "lunas",
        });

        if (error) {
          showToast("Gagal menandai denda lunas: " + error.message, "danger");
          return;
        }

        await loadKonfirmasiPengembalian();
        loadDashboardStats();
        showToast(`💰 Denda ${nama} ditandai lunas!`, "success");
      }

      function showFineDetail(btn) {
        const row = btn.closest(".confirm-item");
        const info = Array.from(row.querySelectorAll(".confirm-info p"))
          .map((item) => item.textContent)
          .join("\n");
        alert(
          "💰 Detail Denda:\n\n" +
            info +
            "\n\nSilakan selesaikan pembayaran atau verifikasi denda terlebih dahulu.",
        );
      }
      /*
      function nonaktifkanAnggota(btn, nama) {
        if (!confirm(`Nonaktifkan anggota ${nama}?`)) return;
        const card = btn.closest(".member-card");
        card.style.opacity = "0.7";
        card.querySelector(".badge").className = "badge badge-red";
        card.querySelector(".badge").textContent = "Nonaktif";
        btn.textContent = "✅ Aktifkan";
        btn.className = "btn btn-success btn-sm";
        btn.onclick = () => aktifkanAnggota(btn, nama);
        showToast(`🚫 ${nama} telah dinonaktifkan`, "warning");
      }

      function aktifkanAnggota(btn, nama) {
        const card = btn.closest(".member-card");
        card.style.opacity = "1";
        card.querySelector(".badge").className = "badge badge-green";
        card.querySelector(".badge").textContent = "Aktif";
        btn.textContent = "🚫 Nonaktifkan";
        btn.className = "btn btn-danger btn-sm";
        btn.onclick = () => nonaktifkanAnggota(btn, nama);
        showToast(`✅ ${nama} kembali aktif`, "success");
      }

      function lihatDetail(nama) {
        alert(
          `👤 Detail Anggota: ${nama}\n\nFitur detail anggota akan membuka profil lengkap beserta riwayat peminjaman di sistem produksi.`,
        );
      }

      */
