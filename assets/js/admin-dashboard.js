function setDashboardValue(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      }

      function isSameLocalDay(dateValue) {
        if (!dateValue) return false;
        const date = new Date(dateValue);
        const today = new Date();
        return (
          date.getFullYear() === today.getFullYear() &&
          date.getMonth() === today.getMonth() &&
          date.getDate() === today.getDate()
        );
      }

      function getMonthStart(baseDate = new Date(), monthOffset = 0) {
        const base = new Date(baseDate);
        return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
      }

      function isSameMonth(dateValue, monthStart) {
        const date = parseAdminDateOnly(dateValue);
        if (!date || !monthStart) return false;
        return (
          date.getFullYear() === monthStart.getFullYear() &&
          date.getMonth() === monthStart.getMonth()
        );
      }

      function getMonthLabel(monthStart) {
        if (!monthStart) return "-";
        const label = monthStart.toLocaleDateString("id-ID", {
          month: "short",
        });
        return label.charAt(0).toUpperCase() + label.slice(1);
      }

      function getBorrowReferenceDate(row) {
        return (
          parseAdminDateOnly(row?.tanggal_pinjam) ||
          parseAdminDateOnly(row?.created_at) ||
          parseAdminDateOnly(row?.tanggal_kembali)
        );
      }

      function getEstimatedLoanFine(row) {
        const overdueDays = getAdminOverdueDays(row);
        if (overdueDays > 0) {
          return overdueDays * TARIF_DENDA_ADMIN;
        }
        return Math.max(0, Number(row?.denda) || 0);
      }

      function getAdminLoanFineState(row) {
        const normalizedStatus = normalizeBorrowingStatus(row?.status);
        const estimatedFine = getEstimatedLoanFine(row);
        const fineStatus = normalizeAdminFinePaymentStatus(
          row?.status_pembayaran_denda,
          estimatedFine,
        );
        return {
          normalizedStatus,
          estimatedFine,
          fineStatus,
          isReturned: normalizedStatus === "dikembalikan",
          hasOutstandingFine: estimatedFine > 0 && fineStatus !== "lunas",
          canProcessReturn:
            normalizedStatus !== "dikembalikan" &&
            (estimatedFine <= 0 || fineStatus === "lunas"),
        };
      }

      function getBorrowStatusMeta(status) {
        const normalizedStatus = normalizeBorrowingStatus(status);
        return {
          isApproved: ["dipinjam", "dikembalikan"].includes(normalizedStatus),
          isRejected: normalizedStatus === "ditolak",
          isWaiting: ["menunggu", "pending"].includes(normalizedStatus),
          isActive: normalizedStatus === "dipinjam",
          isReturned: normalizedStatus === "dikembalikan",
        };
      }

      function getMetricTrend(currentValue, previousValue, options = {}) {
        const {
          emptyLabel = "Belum ada data perbandingan",
          suffix = "vs bulan lalu",
          mode = "percent",
        } = options;

        const current = Number(currentValue) || 0;
        const previous = Number(previousValue) || 0;

        if (current === 0 && previous === 0) {
          return {
            text: emptyLabel,
            className: "change-neutral",
          };
        }

        if (mode === "points") {
          const diff = current - previous;
          if (diff === 0) {
            return {
              text: `0 poin ${suffix}`,
              className: "change-neutral",
            };
          }

          return {
            text: `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toLocaleString("id-ID")} poin ${suffix}`,
            className: diff > 0 ? "change-up" : "change-down",
          };
        }

        if (previous === 0) {
          return {
            text: `${current > 0 ? "▲" : ""} ${current.toLocaleString("id-ID")} baru ${suffix === "vs bulan lalu" ? "bulan ini" : suffix}`,
            className: current > 0 ? "change-up" : "change-neutral",
          };
        }

        const diff = current - previous;
        if (diff === 0) {
          return {
            text: `0% ${suffix}`,
            className: "change-neutral",
          };
        }

        const percent = Math.round((Math.abs(diff) / previous) * 100);
        return {
          text: `${diff > 0 ? "▲" : "▼"} ${percent}% ${suffix}`,
          className: diff > 0 ? "change-up" : "change-down",
        };
      }

      function setMetricChange(id, changeMeta) {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = changeMeta?.text || "-";
        element.className = `metric-change ${changeMeta?.className || "change-neutral"}`;
      }

      function getOwnerCategoryBadgeClass(category) {
        const normalized = String(category || "")
          .trim()
          .toLowerCase();

        if (!normalized) return "badge-blue";
        if (normalized.includes("non")) return "badge-yellow";
        if (
          normalized.includes("fiksi") ||
          normalized.includes("sci") ||
          normalized.includes("fantasy")
        ) {
          return "badge-purple";
        }
        return "badge-blue";
      }

      function renderOwnerLoanChart(monthlySeries) {
        const barsContainer = document.getElementById("owner-loan-chart-bars");
        const labelsContainer = document.getElementById(
          "owner-loan-chart-labels",
        );
        if (!barsContainer || !labelsContainer) return;

        const series =
          Array.isArray(monthlySeries) && monthlySeries.length
            ? monthlySeries
            : Array.from({ length: 6 }, (_, index) => ({
                label: `M${index + 1}`,
                value: 0,
              }));

        const maxValue = Math.max(
          ...series.map((item) => Number(item.value) || 0),
          1,
        );

        barsContainer.innerHTML = series
          .map((item) => {
            const value = Number(item.value) || 0;
            const height = Math.max(8, Math.round((value / maxValue) * 100));
            return `<div class="chart-bar" style="height: ${height}%; flex: 1" title="${escapeHtml(item.label)}: ${value.toLocaleString("id-ID")}"></div>`;
          })
          .join("");

        labelsContainer.innerHTML = series
          .map((item) => `<span>${escapeHtml(item.label)}</span>`)
          .join("");
      }

      function renderOwnerTopBooks(rows) {
        const tbody = document.getElementById("ownerTopBooksBody");
        if (!tbody) return;

        if (!Array.isArray(rows) || !rows.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; color:#94a3b8;">
                Belum ada data peminjaman buku.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = rows
          .map(
            (row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(row.judul || "-")}</td>
                <td>${escapeHtml(row.penulis || "-")}</td>
                <td><span class="badge ${getOwnerCategoryBadgeClass(row.kategori)}">${escapeHtml(row.kategori || "-")}</span></td>
                <td>${Number(row.total).toLocaleString("id-ID")}x</td>
              </tr>
            `,
          )
          .join("");
      }

      function getMonthKeyFromDate(dateValue) {
        const date = parseAdminDateOnly(dateValue);
        if (!date) return "";
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }

      function getLoanFineReferenceDate(row) {
        return (
          parseAdminDateOnly(row?.tanggal_kembali) ||
          getBorrowReferenceDate(row)
        );
      }

      function formatMonthKeyLabel(monthKey) {
        const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
        if (!match) return "Semua Bulan";

        const [, year, month] = match;
        const date = new Date(Number(year), Number(month) - 1, 1);
        const label = date.toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
        });
        return label.charAt(0).toUpperCase() + label.slice(1);
      }

      function formatLaporanPeminjamanDate(value) {
        const date = parseAdminDateOnly(value);
        if (!date) return "—";
        return date.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }

      function getLoanFineDays(row) {
        const activeOverdueDays = getAdminOverdueDays(row);
        if (activeOverdueDays > 0) return activeOverdueDays;

        const estimatedFine =
          Number(row?._estimatedFine) || getEstimatedLoanFine(row);
        if (estimatedFine <= 0) return 0;

        return Math.max(1, Math.round(estimatedFine / TARIF_DENDA_ADMIN));
      }

      function getLaporanDendaStatusMeta(status) {
        const normalized = normalizeAdminFinePaymentStatus(status);
        if (normalized === "lunas") {
          return { className: "badge-green", label: "Lunas" };
        }
        if (normalized === "menunggu_verifikasi") {
          return { className: "badge-blue", label: "Menunggu Verifikasi" };
        }
        return { className: "badge-yellow", label: "Belum Dibayar" };
      }

      function getLaporanPeminjamanStatusMeta(row) {
        const normalizedStatus = normalizeBorrowingStatus(row?.status);
        const estimatedFine =
          Number(row?._estimatedFine) || getEstimatedLoanFine(row);

        if (normalizedStatus === "dikembalikan") {
          return estimatedFine > 0
            ? { className: "badge-yellow", label: "Terlambat" }
            : { className: "badge-green", label: "Tepat Waktu" };
        }

        if (normalizedStatus === "dipinjam") {
          return getAdminOverdueDays(row) > 0
            ? { className: "badge-red", label: "Terlambat" }
            : { className: "badge-blue", label: "Aktif" };
        }

        return getBorrowingStatusMeta(normalizedStatus);
      }

      function populateLaporanPeminjamanMonthOptions(rows) {
        const select = document.getElementById("laporanPeminjamanMonthSelect");
        if (!select) return;

        const monthKeys = [
          ...new Set((rows || []).map((row) => row._monthKey).filter(Boolean)),
        ].sort((left, right) => right.localeCompare(left));

        if (!monthKeys.length) {
          laporanPeminjamanSelectedMonth = "";
          select.innerHTML = `<option value="">Belum ada data</option>`;
          return;
        }

        if (!monthKeys.includes(laporanPeminjamanSelectedMonth)) {
          laporanPeminjamanSelectedMonth = monthKeys[0];
        }

        select.innerHTML = monthKeys
          .map(
            (monthKey) =>
              `<option value="${escapeHtml(monthKey)}" ${
                monthKey === laporanPeminjamanSelectedMonth ? "selected" : ""
              }>${escapeHtml(formatMonthKeyLabel(monthKey))}</option>`,
          )
          .join("");
      }

      function renderLaporanPeminjaman() {
        const tbody = document.getElementById("laporanPeminjamanBody");
        if (!tbody) return;

        laporanPeminjamanFilteredRows = laporanPeminjamanSelectedMonth
          ? laporanPeminjamanRows.filter(
              (row) => row._monthKey === laporanPeminjamanSelectedMonth,
            )
          : [...laporanPeminjamanRows];

        const totalPeminjaman = laporanPeminjamanFilteredRows.length;
        const sudahDikembalikan = laporanPeminjamanFilteredRows.filter(
          (row) => normalizeBorrowingStatus(row.status) === "dikembalikan",
        ).length;
        const masihDipinjam = laporanPeminjamanFilteredRows.filter(
          (row) => normalizeBorrowingStatus(row.status) === "dipinjam",
        ).length;

        setDashboardValue(
          "laporanPeminjamanTotalValue",
          totalPeminjaman.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "laporanPeminjamanReturnedValue",
          sudahDikembalikan.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "laporanPeminjamanActiveValue",
          masihDipinjam.toLocaleString("id-ID"),
        );

        if (!laporanPeminjamanFilteredRows.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center; color:#94a3b8;">
                Belum ada data peminjaman pada bulan ini.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = laporanPeminjamanFilteredRows
          .map((row) => {
            const statusMeta = getLaporanPeminjamanStatusMeta(row);
            return `
              <tr>
                <td>${escapeHtml(row._memberName || "-")}</td>
                <td>${escapeHtml(row._bookTitle || "-")}</td>
                <td>${escapeHtml(formatLaporanPeminjamanDate(row.tanggal_pinjam || row.created_at))}</td>
                <td>${escapeHtml(formatLaporanPeminjamanDate(row.tanggal_kembali))}</td>
                <td><span class="badge ${escapeHtml(statusMeta.className)}">${escapeHtml(statusMeta.label)}</span></td>
                <td>${row._estimatedFine > 0 ? escapeHtml(formatAdminRupiah(row._estimatedFine)) : "—"}</td>
              </tr>
            `;
          })
          .join("");
      }

      function handleLaporanPeminjamanMonthChange(value) {
        laporanPeminjamanSelectedMonth = String(value || "").trim();
        renderLaporanPeminjaman();
      }

      function exportLaporanPeminjaman() {
        if (!laporanPeminjamanFilteredRows.length) {
          showToast("Belum ada data laporan untuk diexport", "warning");
          return;
        }

        const rows = [
          ["Anggota", "Buku", "Tgl Pinjam", "Tgl Kembali", "Status", "Denda"],
          ...laporanPeminjamanFilteredRows.map((row) => {
            const statusMeta = getLaporanPeminjamanStatusMeta(row);
            return [
              row._memberName || "-",
              row._bookTitle || "-",
              formatLaporanPeminjamanDate(row.tanggal_pinjam || row.created_at),
              formatLaporanPeminjamanDate(row.tanggal_kembali),
              statusMeta.label,
              row._estimatedFine > 0
                ? formatAdminRupiah(row._estimatedFine)
                : "—",
            ];
          }),
        ];

        const csv = rows
          .map((columns) =>
            columns
              .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `laporan_peminjaman_${laporanPeminjamanSelectedMonth || "semua"}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }

      async function loadLaporanPeminjaman() {
        const tbody = document.getElementById("laporanPeminjamanBody");
        if (!tbody) return;

        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; color:#94a3b8;">
              Memuat laporan peminjaman...
            </td>
          </tr>
        `;

        const { data, error } = await fetchPeminjamanRows({
          statuses: ["dipinjam", "dikembalikan"],
          ascending: false,
        });

        if (error) {
          laporanPeminjamanRows = [];
          laporanPeminjamanFilteredRows = [];
          laporanPeminjamanSelectedMonth = "";
          const select = document.getElementById(
            "laporanPeminjamanMonthSelect",
          );
          if (select) {
            select.innerHTML = `<option value="">Gagal memuat bulan</option>`;
          }
          setDashboardValue("laporanPeminjamanTotalValue", "0");
          setDashboardValue("laporanPeminjamanReturnedValue", "0");
          setDashboardValue("laporanPeminjamanActiveValue", "0");
          tbody.innerHTML = `
            <tr>
              <td colspan="6" style="text-align:center; color:#ef4444;">
                Gagal memuat laporan peminjaman.
              </td>
            </tr>
          `;
          console.error("Gagal memuat laporan peminjaman:", error);
          return;
        }

        let bookRows = allKoleksiBuku;
        if (!bookRows.length) {
          try {
            bookRows = await loadBookRowsFromDatabase();
          } catch (loadError) {
            console.warn("Gagal menyiapkan data buku laporan:", loadError);
          }
        }

        const bookMap = new Map(
          (bookRows || [])
            .filter((book) => book?._dbId)
            .map((book) => [String(book._dbId), book]),
        );

        const reportRows = data || [];
        const userIds = [
          ...new Set(reportRows.map((row) => row.user_id).filter(Boolean)),
        ];
        let profileMap = new Map();

        if (userIds.length) {
          const { data: profiles } = await supabaseClient
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);

          profileMap = new Map(
            (profiles || []).map((profile) => [String(profile.id), profile]),
          );
        }

        laporanPeminjamanRows = reportRows
          .map((row) => {
            const linkedBook = bookMap.get(String(row.buku_id || ""));
            const linkedProfile = profileMap.get(String(row.user_id || ""));
            const borrowDate = getBorrowReferenceDate(row);
            return {
              ...row,
              _borrowDate: borrowDate,
              _monthKey: getMonthKeyFromDate(borrowDate),
              _bookTitle:
                row.judul_buku || linkedBook?.judul || "Buku tidak tersedia",
              _memberName:
                row.nama_anggota ||
                linkedProfile?.full_name ||
                linkedProfile?.email ||
                "Anggota",
              _estimatedFine: getEstimatedLoanFine(row),
            };
          })
          .filter((row) => row._monthKey)
          .sort(
            (left, right) =>
              (right._borrowDate?.getTime() || 0) -
              (left._borrowDate?.getTime() || 0),
          );

        populateLaporanPeminjamanMonthOptions(laporanPeminjamanRows);
        renderLaporanPeminjaman();
      }

      function populateLaporanDendaMonthOptions(rows) {
        const select = document.getElementById("laporanDendaMonthSelect");
        if (!select) return;

        const monthKeys = [
          ...new Set((rows || []).map((row) => row._monthKey).filter(Boolean)),
        ].sort((left, right) => right.localeCompare(left));

        if (!monthKeys.length) {
          laporanDendaSelectedMonth = "";
          select.innerHTML = `<option value="">Belum ada data</option>`;
          return;
        }

        if (!monthKeys.includes(laporanDendaSelectedMonth)) {
          laporanDendaSelectedMonth = monthKeys[0];
        }

        select.innerHTML = monthKeys
          .map(
            (monthKey) =>
              `<option value="${escapeHtml(monthKey)}" ${
                monthKey === laporanDendaSelectedMonth ? "selected" : ""
              }>${escapeHtml(formatMonthKeyLabel(monthKey))}</option>`,
          )
          .join("");
      }

      function renderLaporanDenda() {
        const tbody = document.getElementById("laporanDendaBody");
        if (!tbody) return;

        laporanDendaFilteredRows = laporanDendaSelectedMonth
          ? laporanDendaRows.filter(
              (row) => row._monthKey === laporanDendaSelectedMonth,
            )
          : [...laporanDendaRows];

        const totalDenda = laporanDendaFilteredRows.reduce(
          (total, row) => total + (Number(row._estimatedFine) || 0),
          0,
        );
        const sudahDibayar = laporanDendaFilteredRows
          .filter(
            (row) =>
              normalizeAdminFinePaymentStatus(
                row.status_pembayaran_denda,
                row._estimatedFine,
              ) === "lunas",
          )
          .reduce((total, row) => total + (Number(row._estimatedFine) || 0), 0);
        const belumDibayar = totalDenda - sudahDibayar;

        setDashboardValue(
          "laporanDendaTotalValue",
          formatAdminRupiah(totalDenda),
        );
        setDashboardValue(
          "laporanDendaPaidValue",
          formatAdminRupiah(sudahDibayar),
        );
        setDashboardValue(
          "laporanDendaUnpaidValue",
          formatAdminRupiah(belumDibayar),
        );

        if (!laporanDendaFilteredRows.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; color:#94a3b8;">
                Belum ada data denda pada bulan ini.
              </td>
            </tr>
          `;
          return;
        }

        tbody.innerHTML = laporanDendaFilteredRows
          .map((row) => {
            const statusMeta = getLaporanDendaStatusMeta(
              normalizeAdminFinePaymentStatus(
                row.status_pembayaran_denda,
                row._estimatedFine,
              ),
            );
            return `
              <tr>
                <td>${escapeHtml(row._memberName || "-")}</td>
                <td>${escapeHtml(row._bookTitle || "-")}</td>
                <td>${getLoanFineDays(row).toLocaleString("id-ID")} hari</td>
                <td>${escapeHtml(formatAdminRupiah(row._estimatedFine))}</td>
                <td><span class="badge ${escapeHtml(statusMeta.className)}">${escapeHtml(statusMeta.label)}</span></td>
              </tr>
            `;
          })
          .join("");
      }

      function handleLaporanDendaMonthChange(value) {
        laporanDendaSelectedMonth = String(value || "").trim();
        renderLaporanDenda();
      }

      function exportLaporanDenda() {
        if (!laporanDendaFilteredRows.length) {
          showToast("Belum ada data denda untuk diexport", "warning");
          return;
        }

        const rows = [
          ["Anggota", "Buku", "Keterlambatan", "Denda", "Status Bayar"],
          ...laporanDendaFilteredRows.map((row) => {
            const statusMeta = getLaporanDendaStatusMeta(
              normalizeAdminFinePaymentStatus(
                row.status_pembayaran_denda,
                row._estimatedFine,
              ),
            );
            return [
              row._memberName || "-",
              row._bookTitle || "-",
              `${getLoanFineDays(row).toLocaleString("id-ID")} hari`,
              formatAdminRupiah(row._estimatedFine),
              statusMeta.label,
            ];
          }),
        ];

        const csv = rows
          .map((columns) =>
            columns
              .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n");

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `laporan_denda_${laporanDendaSelectedMonth || "semua"}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      }

      async function loadLaporanDenda() {
        const tbody = document.getElementById("laporanDendaBody");
        if (!tbody) return;

        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align:center; color:#94a3b8;">
              Memuat laporan denda...
            </td>
          </tr>
        `;

        const { data, error } = await fetchPeminjamanRows({
          statuses: ["dipinjam", "dikembalikan"],
          ascending: false,
        });

        if (error) {
          laporanDendaRows = [];
          laporanDendaFilteredRows = [];
          laporanDendaSelectedMonth = "";
          const select = document.getElementById("laporanDendaMonthSelect");
          if (select) {
            select.innerHTML = `<option value="">Gagal memuat bulan</option>`;
          }
          setDashboardValue("laporanDendaTotalValue", "Rp 0");
          setDashboardValue("laporanDendaPaidValue", "Rp 0");
          setDashboardValue("laporanDendaUnpaidValue", "Rp 0");
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; color:#ef4444;">
                Gagal memuat laporan denda.
              </td>
            </tr>
          `;
          console.error("Gagal memuat laporan denda:", error);
          return;
        }

        let bookRows = allKoleksiBuku;
        if (!bookRows.length) {
          try {
            bookRows = await loadBookRowsFromDatabase();
          } catch (loadError) {
            console.warn("Gagal menyiapkan data buku denda:", loadError);
          }
        }

        const bookMap = new Map(
          (bookRows || [])
            .filter((book) => book?._dbId)
            .map((book) => [String(book._dbId), book]),
        );

        const fineRows = (data || []).filter(
          (row) => getEstimatedLoanFine(row) > 0,
        );
        const userIds = [
          ...new Set(fineRows.map((row) => row.user_id).filter(Boolean)),
        ];
        let profileMap = new Map();

        if (userIds.length) {
          const { data: profiles } = await supabaseClient
            .from("profiles")
            .select("id, full_name, email")
            .in("id", userIds);

          profileMap = new Map(
            (profiles || []).map((profile) => [String(profile.id), profile]),
          );
        }

        laporanDendaRows = fineRows
          .map((row) => {
            const linkedBook = bookMap.get(String(row.buku_id || ""));
            const linkedProfile = profileMap.get(String(row.user_id || ""));
            const fineReferenceDate = getLoanFineReferenceDate(row);
            return {
              ...row,
              _estimatedFine: getEstimatedLoanFine(row),
              _monthKey: getMonthKeyFromDate(fineReferenceDate),
              _memberName:
                row.nama_anggota ||
                linkedProfile?.full_name ||
                linkedProfile?.email ||
                "Anggota",
              _bookTitle:
                row.judul_buku || linkedBook?.judul || "Buku tidak tersedia",
              _fineReferenceDate: fineReferenceDate,
            };
          })
          .filter((row) => row._monthKey)
          .sort(
            (left, right) =>
              (right._fineReferenceDate?.getTime() || 0) -
              (left._fineReferenceDate?.getTime() || 0),
          );

        populateLaporanDendaMonthOptions(laporanDendaRows);
        renderLaporanDenda();
      }

      async function loadDashboardStats() {
        const [bukuRows, anggotaResult, peminjamanResult] = await Promise.all([
          loadBookRowsFromDatabase().catch(() => []),
          supabaseClient.from("profiles").select("id, created_at"),
          fetchPeminjamanRows({ ascending: false }),
        ]);

        if (!allKoleksiBuku.length && bukuRows.length) {
          allKoleksiBuku = bukuRows;
        }

        const totalKoleksi = bukuRows.reduce(
          (total, row) => total + (Number(row.stok) || 0),
          0,
        );
        const totalBuku = bukuRows.length;
        const anggotaRows = anggotaResult.data || [];
        const anggotaAktif = anggotaRows.length;
        const peminjamanRows = peminjamanResult.data || [];
        const dipinjamHariIni = peminjamanRows.filter(
          (row) =>
            row.status === "dipinjam" && isSameLocalDay(row.tanggal_pinjam),
        ).length;
        const menungguKonfirmasi = peminjamanRows.filter((row) =>
          matchesBorrowingStatuses(row.status, ["menunggu"]),
        ).length;
        const now = new Date();
        const currentMonth = getMonthStart(now, 0);
        const previousMonth = getMonthStart(now, -1);
        const loanRowsForDemand = peminjamanRows.filter(
          (row) => !getBorrowStatusMeta(row.status).isRejected,
        );
        const approvedLoanRows = peminjamanRows.filter(
          (row) => getBorrowStatusMeta(row.status).isApproved,
        );
        const currentMonthLoans = loanRowsForDemand.filter((row) =>
          isSameMonth(getBorrowReferenceDate(row), currentMonth),
        ).length;
        const previousMonthLoans = loanRowsForDemand.filter((row) =>
          isSameMonth(getBorrowReferenceDate(row), previousMonth),
        ).length;
        const currentMonthNewMembers = anggotaRows.filter((row) =>
          isSameMonth(row.created_at, currentMonth),
        ).length;
        const previousMonthNewMembers = anggotaRows.filter((row) =>
          isSameMonth(row.created_at, previousMonth),
        ).length;
        const fineRowsCurrentMonth = peminjamanRows.filter((row) => {
          const dueDate = parseAdminDateOnly(row.tanggal_kembali);
          const referenceDate = dueDate || getBorrowReferenceDate(row);
          return isSameMonth(referenceDate, currentMonth);
        });
        const fineRowsPreviousMonth = peminjamanRows.filter((row) => {
          const dueDate = parseAdminDateOnly(row.tanggal_kembali);
          const referenceDate = dueDate || getBorrowReferenceDate(row);
          return isSameMonth(referenceDate, previousMonth);
        });
        const totalDendaBulanIni = fineRowsCurrentMonth.reduce(
          (total, row) => total + getEstimatedLoanFine(row),
          0,
        );
        const fineRowsWithValueCurrent = fineRowsCurrentMonth.filter(
          (row) => getEstimatedLoanFine(row) > 0,
        );
        const fineRowsWithValuePrevious = fineRowsPreviousMonth.filter(
          (row) => getEstimatedLoanFine(row) > 0,
        );
        const dendaLunasCurrent = fineRowsWithValueCurrent.filter(
          (row) =>
            normalizeAdminFinePaymentStatus(
              row.status_pembayaran_denda,
              getEstimatedLoanFine(row),
            ) === "lunas",
        ).length;
        const dendaLunasPrevious = fineRowsWithValuePrevious.filter(
          (row) =>
            normalizeAdminFinePaymentStatus(
              row.status_pembayaran_denda,
              getEstimatedLoanFine(row),
            ) === "lunas",
        ).length;
        const paidRateCurrent = fineRowsWithValueCurrent.length
          ? Math.round(
              (dendaLunasCurrent / fineRowsWithValueCurrent.length) * 100,
            )
          : 0;
        const paidRatePrevious = fineRowsWithValuePrevious.length
          ? Math.round(
              (dendaLunasPrevious / fineRowsWithValuePrevious.length) * 100,
            )
          : 0;
        const activeFineRows = peminjamanRows.filter((row) => {
          const estimatedFine = getEstimatedLoanFine(row);
          const fineStatus = normalizeAdminFinePaymentStatus(
            row.status_pembayaran_denda,
            estimatedFine,
          );
          return estimatedFine > 0 && fineStatus !== "lunas";
        });
        const dendaAktif = activeFineRows.reduce(
          (total, row) => total + getEstimatedLoanFine(row),
          0,
        );
        const monthlySeries = Array.from({ length: 6 }, (_, index) => {
          const monthStart = getMonthStart(now, index - 5);
          const total = loanRowsForDemand.filter((row) =>
            isSameMonth(getBorrowReferenceDate(row), monthStart),
          ).length;
          return {
            label: getMonthLabel(monthStart),
            value: total,
          };
        });
        const bookMap = new Map(
          bukuRows
            .filter((book) => book?._dbId)
            .map((book) => [String(book._dbId), book]),
        );
        const topBooksMap = new Map();

        const topBookSourceRows = approvedLoanRows.length
          ? approvedLoanRows
          : loanRowsForDemand;

        topBookSourceRows.forEach((row) => {
          const book = bookMap.get(String(row.buku_id || ""));
          const key =
            String(row.buku_id || "").trim() ||
            String(row.judul_buku || "")
              .trim()
              .toLowerCase();
          if (!key) return;

          const existing = topBooksMap.get(key) || {
            judul: row.judul_buku || book?.judul || "Tanpa Judul",
            penulis: book?.penulis || "-",
            kategori: book?.kategori || "-",
            total: 0,
          };

          existing.total += 1;
          if (
            (!existing.penulis || existing.penulis === "-") &&
            book?.penulis
          ) {
            existing.penulis = book.penulis;
          }
          if (
            (!existing.kategori || existing.kategori === "-") &&
            book?.kategori
          ) {
            existing.kategori = book.kategori;
          }
          if (
            (!existing.judul || existing.judul === "Tanpa Judul") &&
            book?.judul
          ) {
            existing.judul = book.judul;
          }

          topBooksMap.set(key, existing);
        });
        const topBooks = [...topBooksMap.values()]
          .sort((left, right) => right.total - left.total)
          .slice(0, 5);

        setDashboardValue(
          "stat-total-koleksi",
          totalKoleksi.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "stat-anggota-aktif",
          anggotaAktif.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "stat-dipinjam-hari-ini",
          dipinjamHariIni.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "stat-menunggu-konfirmasi",
          menungguKonfirmasi.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "owner-total-buku",
          totalBuku.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "owner-anggota-aktif",
          anggotaAktif.toLocaleString("id-ID"),
        );
        setDashboardValue(
          "owner-total-denda-bulan-ini",
          formatAdminRupiah(totalDendaBulanIni),
        );
        setDashboardValue(
          "owner-metric-loans-value",
          currentMonthLoans.toLocaleString("id-ID"),
        );
        setMetricChange(
          "owner-metric-loans-change",
          getMetricTrend(currentMonthLoans, previousMonthLoans),
        );
        setDashboardValue(
          "owner-metric-paid-rate-value",
          `${paidRateCurrent}%`,
        );
        setMetricChange(
          "owner-metric-paid-rate-change",
          getMetricTrend(paidRateCurrent, paidRatePrevious, {
            mode: "points",
            emptyLabel: "Belum ada data denda bulan ini",
          }),
        );
        setDashboardValue(
          "owner-metric-new-members-value",
          currentMonthNewMembers.toLocaleString("id-ID"),
        );
        setMetricChange(
          "owner-metric-new-members-change",
          getMetricTrend(currentMonthNewMembers, previousMonthNewMembers),
        );
        setDashboardValue(
          "owner-metric-active-fines-value",
          formatAdminRupiah(dendaAktif),
        );
        setMetricChange("owner-metric-active-fines-change", {
          text: activeFineRows.length
            ? `${activeFineRows.length.toLocaleString("id-ID")} pinjaman belum lunas`
            : "Belum ada pinjaman bermasalah",
          className: activeFineRows.length ? "change-down" : "change-neutral",
        });

        renderOwnerLoanChart(monthlySeries);
        renderOwnerTopBooks(topBooks);

        loadDashboardBorrowRequests();
      }

      async function loadKoleksiBuku() {
        const tbody = document.getElementById("tabelBukuBody");
        if (!tbody) return;

        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Memuat data buku...</td></tr>';

        try {
          allKoleksiBuku = await loadBookRowsFromDatabase();
        } catch (error) {
          tbody.innerHTML =
            '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Gagal memuat data buku.</td></tr>';
          showToast("Gagal memuat buku: " + error.message, "danger");
          return;
        }

        renderKoleksiBuku();
        renderSemuaBuku();
      }

      function renderKoleksiBuku() {
        const tbody = document.getElementById("tabelBukuBody");
        if (!tbody) return;

        if (!allKoleksiBuku.length) {
          tbody.innerHTML =
            '<tr><td colspan="6" style="text-align:center; color:#94a3b8;">Belum ada buku di database.</td></tr>';
          return;
        }

        tbody.innerHTML = allKoleksiBuku
          .map((book) => {
            const stok = Number(book.stok) || 0;
            const status = stok > 0 ? "Tersedia" : "Habis";
            const statusClass = stok > 0 ? "badge-green" : "badge-red";
            const category = book.kategori || "-";

            return `
            <tr data-book-id="${escapeHtml(book._dbId)}" data-book-local-id="${escapeHtml(book.id)}" data-book-id-column="${escapeHtml(book._idColumn)}" data-book-table="${escapeHtml(book._tableName)}" data-book-category="${escapeHtml(category)}">
                <td><strong>${escapeHtml(book.judul || "-")}</strong></td>
                <td>${escapeHtml(book.penulis || "-")}</td>
                <td><span class="badge badge-blue">${escapeHtml(category)}</span></td>
                <td>${stok}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
                <td>
                  <button class="btn btn-outline btn-sm" onclick="editBuku(this)">✏️</button>
                  <button class="btn btn-danger btn-sm" onclick="hapusBuku(this)">🗑️</button>
                </td>
              </tr>
            `;
          })
          .join("");

        filterTable(document.getElementById("book-search-input"));
      }

      function renderSemuaBuku() {
        const tbody = document.getElementById("semuaBukuBody");
        if (!tbody) return;

        const searchValue = (
          document.getElementById("owner-book-search-input")?.value || ""
        )
          .trim()
          .toLowerCase();
        const filteredBooks = allKoleksiBuku.filter((book) => {
          if (!searchValue) return true;
          const rowText = [
            book.id,
            book.judul,
            book.penulis,
            book.isbn,
            book.penerbit,
            book.kategori,
            book.stok,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return rowText.includes(searchValue);
        });

        if (!filteredBooks.length) {
          tbody.innerHTML =
            '<tr><td colspan="7" style="text-align:center; color:#94a3b8;">Belum ada buku di database.</td></tr>';
          return;
        }

        tbody.innerHTML = filteredBooks
          .map((book) => {
            const stok = Number(book.stok) || 0;
            const status = stok > 0 ? "Aktif" : "Habis";
            const statusClass = stok > 0 ? "badge-green" : "badge-red";

            return `
              <tr>
                <td>${escapeHtml(book.id || "-")}</td>
                <td><strong>${escapeHtml(book.judul || "-")}</strong></td>
                <td>${escapeHtml(book.penulis || "-")}</td>
                <td>${escapeHtml(book.isbn || "-")}</td>
                <td><span class="badge badge-blue">${escapeHtml(book.kategori || "-")}</span></td>
                <td>${stok}</td>
                <td><span class="badge ${statusClass}">${status}</span></td>
              </tr>
            `;
          })
          .join("");
      }

      window.addEventListener("storage", (event) => {
        if (event.key === MEMBER_SYNC_KEY) {
          requestMemberRefresh();
        }
        if (event.key === BOOKS_SYNC_KEY) {
          loadDashboardStats();
          loadKoleksiBuku();
        }
      });

      const MEMBER_AVATAR_GRADIENTS = [
        "linear-gradient(135deg, #0ea5e9, #6366f1)",
        "linear-gradient(135deg, #7c3aed, #a855f7)",
        "linear-gradient(135deg, #10b981, #14b8a6)",
        "linear-gradient(135deg, #2563eb, #1d4ed8)",
        "linear-gradient(135deg, #06b6d4, #0ea5e9)",
        "linear-gradient(135deg, #8b5cf6, #7c3aed)",
      ];

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

// ===== PAGE NAVIGATION =====

      function setAdminMobileSidebar(open) {
        const sidebar = document.querySelector("#appScreen .sidebar");
        const backdrop = document.querySelector(
          "#appScreen .admin-sidebar-backdrop",
        );
        const button = document.querySelector("#appScreen .admin-mobile-menu-btn");

        if (!sidebar) return;
        sidebar.classList.toggle("mobile-open", open);
        if (backdrop) backdrop.classList.toggle("show", open);
        document.body.classList.toggle("admin-mobile-sidebar-open", open);
        if (button) {
          button.setAttribute("aria-expanded", String(open));
          button.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
        }
      }

      function toggleAdminMobileSidebar() {
        const sidebar = document.querySelector("#appScreen .sidebar");
        setAdminMobileSidebar(!sidebar?.classList.contains("mobile-open"));
      }

      function closeAdminMobileSidebar() {
        setAdminMobileSidebar(false);
      }

      window.addEventListener("resize", () => {
        if (!window.matchMedia("(max-width: 900px)").matches) {
          closeAdminMobileSidebar();
        }
      });

      function showPage(pageId) {
        document
          .querySelectorAll(".page")
          .forEach((p) => p.classList.remove("active"));
        document
          .querySelectorAll(".nav-item")
          .forEach((n) => n.classList.remove("active"));

        const page = document.getElementById("page-" + pageId);
        if (page) page.classList.add("active");

        // Highlight nav item
        document.querySelectorAll(".nav-item").forEach((item) => {
          if (
            item.getAttribute("onclick") &&
            item.getAttribute("onclick").includes(pageId)
          ) {
            item.classList.add("active");
          }
        });

        // Update topbar
        const titles = {
          adminDashboard: "📊 Dashboard Admin",
          kelolaKoleksi: "📚 Kelola Koleksi Buku",
          konfirmasiPeminjaman: "✅ Konfirmasi Peminjaman",
          konfirmasiPengembalian: "🔄 Konfirmasi Pengembalian",
          kelolaAnggota: "👥 Kelola Anggota",
          helpdeskChat: "💬 Helpdesk Chat",
          ownerDashboard: "📈 Dashboard & Statistik",
          kelolaAdmin: "🛡️ Kelola Admin",
          laporanPeminjaman: "📋 Laporan Peminjaman",
          laporanDenda: "💰 Laporan Denda",
          semuaBuku: "📚 Semua Data Buku",
          semuaAnggota: "👥 Semua Data Anggota",
          semuaTransaksi: "🔖 Semua Transaksi",
          masukanBuku: "📬 Masukan Buku",
          rekomendasiPembelian: "📊 Rekomendasi Pembelian",
          purchaseOrder: "🛒 Purchase Order",
          penerimaanBuku: "📦 Penerimaan Buku",
        };
        document.getElementById("topbarTitle").textContent =
          titles[pageId] || pageId;
        if (pageId === "adminDashboard" || pageId === "ownerDashboard") {
          loadDashboardStats();
          loadDashboardHelpdesk();
        }
        if (pageId === "kelolaKoleksi" || pageId === "semuaBuku")
          loadKoleksiBuku();
        if (pageId === "konfirmasiPeminjaman") loadKonfirmasiPeminjaman();
        if (pageId === "konfirmasiPengembalian") loadKonfirmasiPengembalian();
        if (pageId === "kelolaAnggota") loadMembers();
        if (pageId === "laporanPeminjaman") loadLaporanPeminjaman();
        if (pageId === "laporanDenda") loadLaporanDenda();
        if (pageId === "semuaAnggota") loadOwnerMembers();
        if (pageId === "semuaTransaksi") loadOwnerTransactions();
        if (pageId === "masukanBuku") loadMasukanBuku();
        if (pageId === "helpdeskChat") loadHelpdeskChat();
        if (pageId === "rekomendasiPembelian") loadRekomendasiOwner();
        if (pageId === "purchaseOrder") loadPurchaseOrder();
        if (pageId === "penerimaanBuku") loadPenerimaanBuku();
        closeAdminMobileSidebar();
      }

      // ===== MODAL =====
      function openModal(id) {
        if (id === "modalBuatPO") loadRekomendasiUntukPO();
        if (id === "modalTambahBuku") {
          if (editingBookContext) {
            setBookModalMode("edit");
          } else {
            editingBookContext = null;
            clearBookForm();
            setBookModalMode("add");
          }
        }
        document.getElementById(id).classList.add("active");
      }
      function closeModal(id) {
        document.getElementById(id).classList.remove("active");
        if (id === "modalTambahBuku") {
          editingBookContext = null;
          clearBookForm();
          setBookModalMode("add");
        }
      }
      document.querySelectorAll(".modal-overlay").forEach((m) => {
        m.addEventListener("click", (e) => {
          if (e.target === m) m.classList.remove("active");
        });
      });

// ===== THEME =====
      function toggleTheme() {
        isDark = !isDark;
        document.documentElement.setAttribute(
          "data-theme",
          isDark ? "dark" : "",
        );
        document.querySelector(".btn-theme").textContent = isDark ? "☀️" : "🌙";
      }

      // ===== TOAST =====
      function showToast(msg, type = "success") {
        const colors = {
          success: "#10b981",
          danger: "#ef4444",
          warning: "#f59e0b",
          info: "#0e7490",
        };
        const toast = document.createElement("div");
        toast.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${colors[type] || colors.success}; color:white;
    padding:14px 20px; border-radius:12px; font-weight:700; font-size:14px;
    box-shadow:0 8px 24px rgba(0,0,0,.2); animation:slideUp .3s ease;
    font-family:'Nunito',sans-serif; max-width:320px;`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
          toast.style.opacity = "0";
          toast.style.transition = ".3s";
          setTimeout(() => toast.remove(), 300);
        }, 3000);
      }

      // ===== CLOCK =====
      function updateClock() {
        const now = new Date();
        document.getElementById("currentTime").textContent =
          now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
      }
      updateClock();
      setInterval(updateClock, 1000);

      async function loadDashboardHelpdesk() {
        const container = document.getElementById("dashboardHelpdeskList");
        if (!container) return;

        container.innerHTML =
          '<div style="padding:12px;color:#94a3b8">Memuat chat...</div>';

        const { error } = await syncHelpdeskState();
        if (error) {
          container.innerHTML =
            '<div style="padding:12px;color:red">Gagal memuat chat</div>';
          return;
        }

        updateHelpdeskUnreadIndicators();
        renderDashboardHelpdeskList();

        if (
          document
            .getElementById("page-helpdeskChat")
            ?.classList.contains("active")
        ) {
          renderHelpdeskList();
          renderHelpdeskConversation();
        }
      }
