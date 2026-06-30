// ---- PENGEMBALIAN: status peminjaman milik user ----
      async function loadPengembalianUser() {
        const tbody = document.getElementById("pengembalian-tbody");
        if (!tbody) return;

        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) return;

        const [loanResponse, helpdeskResponse] = await Promise.all([
          fetchUserPeminjamanRows(user.id),
          fetchUserHelpdeskMessages(user.id),
        ]);
        const { data, error } = loanResponse;

        if (error) {
          pengembalianLoansCache = [];
          activeBorrowedBookIds = new Set();
          pengembalianFineRequestMap = new Map();
          accountSuspensionState = {
            isSuspended: false,
            blockedLoans: [],
            totalFine: 0,
            maxBlockedDays: 0,
          };
          updateAccountSuspensionUI();
          renderFinePaymentPanel();
          tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Gagal memuat data peminjaman: ${escapeHtml(error.message || "Unknown error")}</p></div></td></tr>`;
          return;
        }

        pengembalianFineRequestMap = new Map();
        if (!helpdeskResponse?.error) {
          (helpdeskResponse.data || []).forEach((message) => {
            if (message.sender_role !== "user") return;
            const parsed = parseFinePaymentHelpdeskMessage(message.message);
            if (!parsed?.loanId) return;
            const existing = pengembalianFineRequestMap.get(parsed.loanId);
            if (
              !existing ||
              new Date(message.created_at).getTime() >
                new Date(existing.created_at || 0).getTime()
            ) {
              pengembalianFineRequestMap.set(parsed.loanId, {
                ...parsed,
                created_at: message.created_at,
              });
            }
          });
        }

        const normalizedRows = (data || []).map((row) => {
          const dueDateValue = getLoanDueDateValue(row);
          const overdueDays = getLoanOverdueDays(row, dueDateValue, new Date());
          const dueAgeDays = getDaysSinceDueDate(dueDateValue, new Date());
          const persistedFine = Number(row.denda) || 0;
          const estimatedFine =
            overdueDays > 0 ? overdueDays * TARIF_DENDA_USER : persistedFine;
          const finePaymentStatus = normalizeFinePaymentStatus(
            row.status_pembayaran_denda,
            estimatedFine,
          );
          return {
            ...row,
            _dueDateValue: dueDateValue,
            _overdueDays: overdueDays,
            _dueAgeDays: dueAgeDays,
            _estimatedFine: estimatedFine,
            _finePaymentStatus: finePaymentStatus,
            _fineRequest:
              pengembalianFineRequestMap.get(String(row.id)) || null,
          };
        });

        pengembalianLoansCache = normalizedRows;
        syncActiveBorrowedBookIds(normalizedRows);
        accountSuspensionState = computeAccountSuspensionState(normalizedRows);
        updateAccountSuspensionUI();
        renderFinePaymentPanel();

        const aktif = normalizedRows.filter(
          (d) => d.status === "dipinjam",
        ).length;
        document.getElementById("stat-pinjam").textContent = aktif;

        if (!normalizedRows.length) {
          tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>Anda belum pernah meminjam buku</p></div></td></tr>`;
          return;
        }

        const badgeLabel = {
          pending: "Menunggu",
          menunggu: "Menunggu",
          dipinjam: "Dipinjam",
          ditolak: "Ditolak",
          dikembalikan: "Selesai",
        };
        const badgeColor = {
          pending: "#f59e0b",
          menunggu: "#f59e0b",
          dipinjam: "#2563eb",
          ditolak: "#ef4444",
          dikembalikan: "#10a37f",
        };

        tbody.innerHTML = normalizedRows
          .map((d) => {
            const fineState = getLoanFineState(d);
            let statusText = badgeLabel[d.status] || d.status;
            let statusColor = badgeColor[d.status] || "#64748b";
            if (fineState.isReturned && fineState.hasOutstandingFine) {
              if (fineState.finePaymentStatus === "menunggu_verifikasi") {
                statusText = "Verifikasi Denda";
                statusColor = "#0f766e";
              } else {
                statusText = "Denda Belum Lunas";
                statusColor = "#b45309";
              }
            } else if (d.status === "dipinjam" && d._estimatedFine > 0) {
              if (d._finePaymentStatus === "lunas") {
                statusText = "Denda Lunas";
                statusColor = "#059669";
              } else if (d._finePaymentStatus === "menunggu_verifikasi") {
                statusText = "Verifikasi Pembayaran";
                statusColor = "#0f766e";
              } else {
                statusText = `Terlambat ${d._overdueDays} hari`;
                statusColor = "#dc2626";
              }
            }
            const fineNote =
              d._estimatedFine > 0
                ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${escapeHtml(
                    getFinePaymentStatusLabel(d._finePaymentStatus),
                  )}${
                    d._fineRequest
                      ? ` • via ${escapeHtml(
                          getFinePaymentMethodLabel(d._fineRequest.methodKey),
                        )}`
                      : ""
                  }</div>`
                : "";
            return `
    <tr>
      <td><strong>${escapeHtml(d.judul_buku)}</strong></td>
      <td>${formatDateID(d.tanggal_pinjam)}</td>
      <td>${formatDateID(d._dueDateValue)}</td>
      <td><span style="font-weight:700; font-size:12px; color:${statusColor};">${escapeHtml(
        statusText,
      )}</span></td>
      <td>${
        d._estimatedFine > 0
          ? `${formatRupiah(d._estimatedFine)}${fineNote}`
          : "-"
      }</td>
      <td>${
        d.status === "dipinjam"
          ? buildReadButtonHtml(getLoanBookId(d), d.judul_buku)
          : "-"
      }</td>
    </tr>`;
          })
          .join("");
      }
