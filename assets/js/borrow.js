// ====== BUKU & PEMINJAMAN (terhubung ke Supabase) ======
      let allBukuUser = [];
      let bukuTerpilih = null;
      let bukuUserStats = {
        totalStok: 0,
        totalKategori: 0,
        totalAnggota: 0,
        totalPinjamAktif: 0,
        totalJudul: 0,
      };
      const TARIF_DENDA_USER = 5000;
      const FINE_PAYMENT_METHODS = {
        qris: {
          label: "QRIS",
          instruction:
            "Pilih QRIS bila ingin scan pembayaran saat bertemu admin perpustakaan.",
        },
        transfer: {
          label: "Transfer Bank",
          instruction:
            "Pilih transfer bank lalu tunggu admin mengirim detail rekening melalui helpdesk.",
        },
        ewallet: {
          label: "E-Wallet",
          instruction:
            "Pilih e-wallet untuk pembayaran via DANA, OVO, atau GoPay sesuai arahan admin.",
        },
        cash: {
          label: "Tunai di Perpustakaan",
          instruction:
            "Pilih tunai jika Anda akan membayar langsung ke petugas saat mengembalikan buku.",
        },
      };
      let pengembalianLoansCache = [];
      let pengembalianFineRequestMap = new Map();
      let activeBorrowedBookIds = new Set();

      function normalizeLoanBookId(value) {
        return String(value || "").trim();
      }

      function getLoanBookId(row) {
        return normalizeLoanBookId(row?.buku_id || row?.book_id || row?.id_buku);
      }

      function isBookCurrentlyBorrowed(book) {
        if (!book) return false;
        const ids = [book._dbId, book.id].map(normalizeLoanBookId).filter(Boolean);
        return ids.some((id) => activeBorrowedBookIds.has(id));
      }

      function syncActiveBorrowedBookIds(rows) {
        activeBorrowedBookIds = new Set(
          (rows || [])
            .filter(
              (row) =>
                String(row?.status || "").trim().toLowerCase() === "dipinjam",
            )
            .map(getLoanBookId)
            .filter(Boolean),
        );
      }

      function openBlankReader(bookId = "", title = "") {
        const titleEl = document.getElementById("reader-book-title");
        if (titleEl) {
          titleEl.textContent = title ? `Buku: ${title}` : "Halaman baca kosong";
        }
        navigate("baca");
      }

      function buildReadButtonHtml(bookId = "", title = "") {
        return `<button class="btn btn-primary btn-sm" onclick='openBlankReader(${escapeHtml(
          JSON.stringify(normalizeLoanBookId(bookId)),
        )}, ${escapeHtml(JSON.stringify(String(title || "Buku")))})'>Baca</button>`;
      }

      function parseDateOnly(value) {
        if (!value) return null;
        if (value instanceof Date) {
          const cloned = new Date(value.getTime());
          cloned.setHours(0, 0, 0, 0);
          return cloned;
        }

        const raw = String(value).trim();
        if (!raw) return null;

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

      function formatDateID(value) {
        const parsed = parseDateOnly(value);
        return parsed ? parsed.toLocaleDateString("id-ID") : "-";
      }

      function formatDateTimeID(value) {
        if (!value) return "-";
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return "-";
        return parsed.toLocaleString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      function formatRupiah(value) {
        const amount = Number(value) || 0;
        return `Rp ${amount.toLocaleString("id-ID")}`;
      }

      function addDaysToDateValue(value, daysToAdd) {
        const parsed = parseDateOnly(value);
        if (!parsed) return null;
        parsed.setDate(parsed.getDate() + (Number(daysToAdd) || 0));
        return parsed;
      }

      function getLoanDueDateValue(loan) {
        if (!loan) return null;
        const directDueDate = loan.tanggal_jatuh_tempo || loan.tanggal_kembali;
        if (directDueDate) return parseDateOnly(directDueDate);
        if (!loan.tanggal_pinjam) return null;
        return addDaysToDateValue(
          loan.tanggal_pinjam,
          Number(loan.durasi_hari) || 7,
        );
      }

      function getLoanOverdueDays(loan, dueDateValue, baseDate = new Date()) {
        if (!loan || loan.status !== "dipinjam" || !dueDateValue) return 0;
        const today = parseDateOnly(baseDate) || new Date();
        const dueDate = parseDateOnly(dueDateValue);
        if (!dueDate) return 0;
        const diffMs = today.getTime() - dueDate.getTime();
        return Math.max(0, Math.floor(diffMs / 86400000));
      }

      function getDaysSinceDueDate(dueDateValue, baseDate = new Date()) {
        const dueDate = parseDateOnly(dueDateValue);
        if (!dueDate) return 0;
        const today = parseDateOnly(baseDate) || new Date();
        const diffMs = today.getTime() - dueDate.getTime();
        return Math.max(0, Math.floor(diffMs / 86400000));
      }

      function getFinePaymentMethodLabel(methodKey) {
        return FINE_PAYMENT_METHODS[methodKey]?.label || "Metode Lain";
      }

      function getFinePaymentInstructionText(methodKey) {
        return (
          FINE_PAYMENT_METHODS[methodKey]?.instruction ||
          "Pilih metode pembayaran yang ingin Anda gunakan."
        );
      }

      function normalizeFinePaymentStatus(value, fineAmount = 0) {
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

      function hasFinePaymentStatusValue(value) {
        return value !== null && value !== undefined && String(value).trim() !== "";
      }

      function isMissingFinePaymentStatusColumnError(error) {
        const message = String(error?.message || error || "").toLowerCase();
        return (
          message.includes("status_pembayaran_denda") &&
          (message.includes("does not exist") ||
            message.includes("schema cache") ||
            message.includes("column"))
        );
      }

      function getLoanFineState(loan) {
        const estimatedFine = Math.max(
          0,
          Number(loan?._estimatedFine ?? loan?.denda) || 0,
        );
        const rawFinePaymentStatus =
          loan?._finePaymentStatus ?? loan?.status_pembayaran_denda;
        const hasFinePaymentStatusColumn =
          loan?._hasFinePaymentStatusColumn ??
          hasFinePaymentStatusValue(rawFinePaymentStatus);
        let finePaymentStatus = normalizeFinePaymentStatus(
          rawFinePaymentStatus,
          estimatedFine,
        );
        if (
          estimatedFine > 0 &&
          !hasFinePaymentStatusColumn &&
          loan?._fineRequest
        ) {
          finePaymentStatus = "menunggu_verifikasi";
        }
        const normalizedStatus = String(loan?.status || "")
          .trim()
          .toLowerCase();
        const dueAgeDays = Number.isFinite(Number(loan?._dueAgeDays))
          ? Number(loan._dueAgeDays)
          : getDaysSinceDueDate(loan?._dueDateValue, new Date());
        return {
          estimatedFine,
          finePaymentStatus,
          normalizedStatus,
          dueAgeDays,
          isReturned: normalizedStatus === "dikembalikan",
          hasOutstandingFine:
            estimatedFine > 0 && finePaymentStatus !== "lunas",
        };
      }

      function getFinePaymentStatusLabel(status) {
        if (status === "menunggu_verifikasi") return "Menunggu Verifikasi";
        if (status === "lunas") return "Lunas";
        return "Belum Dibayar";
      }

      function buildFinePaymentHelpdeskMessage(loan, methodKey, amount) {
        const loanId = String(loan?.id || "").trim();
        const judul = loan?.judul_buku || "Buku";
        const dueDateText = formatDateID(loan?._dueDateValue);
        return `Pengajuan pembayaran denda untuk \"${judul}\" via ${getFinePaymentMethodLabel(methodKey)}. Total saat ini ${formatRupiah(amount)}. Jatuh tempo ${dueDateText}. [DENDA:${loanId}|${methodKey}|${amount}]`;
      }

      function parseFinePaymentHelpdeskMessage(message) {
        const raw = String(message || "").trim();
        const match = raw.match(/\[DENDA:([^|\]]+)\|([^|\]]+)\|(\d+)\]/i);
        if (!match) return null;
        return {
          loanId: String(match[1] || "").trim(),
          methodKey: String(match[2] || "").trim().toLowerCase(),
          amount: Number(match[3]) || 0,
        };
      }

      function setPengembalianTab(tabName) {
        if (accountSuspensionState.isSuspended && tabName !== "denda") {
          showToast(
            "Saat akun ditangguhkan, Anda hanya bisa mengakses pembayaran denda.",
          );
          tabName = "denda";
        }

        const daftarBtn = document.getElementById("tab-pengembalian-daftar");
        const dendaBtn = document.getElementById("tab-pengembalian-denda");
        const daftarPanel = document.getElementById("pengembalian-panel-daftar");
        const dendaPanel = document.getElementById("pengembalian-panel-denda");
        const showFinePanel = tabName === "denda";

        daftarBtn?.classList.toggle("active", !showFinePanel);
        dendaBtn?.classList.toggle("active", showFinePanel);
        daftarPanel?.classList.toggle("active", !showFinePanel);
        dendaPanel?.classList.toggle("active", showFinePanel);
      }

      function refreshFinePaymentInstruction(loanId) {
        const select = document.getElementById(`fine-method-${loanId}`);
        const helper = document.getElementById(`fine-helper-${loanId}`);
        if (!select || !helper) return;
        helper.textContent = getFinePaymentInstructionText(select.value);
      }

      function renderFinePaymentPanel() {
        const summary = document.getElementById("fine-payment-summary");
        const list = document.getElementById("fine-payment-list");
        const countBadge = document.getElementById("pengembalianFineCount");
        if (!summary || !list || !countBadge) return;

        const fineLoans = pengembalianLoansCache.filter((loan) =>
          getLoanFineState(loan).hasOutstandingFine,
        );
        countBadge.textContent = fineLoans.length.toLocaleString("id-ID");

        if (!fineLoans.length) {
          summary.innerHTML = `
            <div>
              <div class="fine-summary-title">Belum ada denda aktif</div>
              <div class="fine-summary-note">
                Jika ada buku yang melewati jatuh tempo, form pembayaran denda akan muncul di sini.
              </div>
            </div>
            <div class="fine-summary-amount">${formatRupiah(0)}</div>
          `;
          list.innerHTML = `
            <div class="empty-state fine-empty-state">
              <p>Semua pinjaman Anda masih aman. Belum ada denda yang perlu dibayarkan.</p>
            </div>
          `;
          return;
        }

        const totalFine = fineLoans.reduce(
          (sum, loan) => sum + (Number(loan._estimatedFine) || 0),
          0,
        );

        summary.innerHTML = `
          <div>
            <div class="fine-summary-title">Total denda aktif Anda</div>
            <div class="fine-summary-note">
              Pilih metode pembayaran untuk setiap denda aktif. Setelah dikirim, admin bisa menindaklanjuti lewat helpdesk.
            </div>
          </div>
          <div class="fine-summary-amount">${formatRupiah(totalFine)}</div>
        `;

        list.innerHTML = fineLoans
          .map((loan) => {
            const fineState = getLoanFineState(loan);
            const request = loan._fineRequest || null;
            const paymentStatus = fineState.finePaymentStatus;
            const selectedMethod = request?.methodKey || "qris";
            const requestInfo =
              paymentStatus === "menunggu_verifikasi"
                ? request
                  ? `Pembayaran sedang menunggu verifikasi admin. Pengajuan terakhir via ${getFinePaymentMethodLabel(
                      request.methodKey || selectedMethod,
                    )} pada ${formatDateTimeID(request.created_at)}.`
                  : "Pembayaran sedang menunggu verifikasi admin. Jika belum ada respons, Anda bisa mengirim ulang pengajuan."
                : request
                  ? `Pengajuan terakhir via ${getFinePaymentMethodLabel(
                      request.methodKey,
                    )} pada ${formatDateTimeID(request.created_at)}.`
                  : "Belum ada pengajuan pembayaran untuk denda ini.";
            const actionLabel =
              paymentStatus === "menunggu_verifikasi" || request
                ? "Kirim Ulang Pengajuan"
                : "Ajukan Pembayaran";
            const badgeLabel =
              paymentStatus === "menunggu_verifikasi"
                ? "Menunggu Verifikasi"
                : "Perlu Dibayar";

            return `
              <div class="fine-payment-card">
                <div class="fine-payment-head">
                  <div>
                    <div class="fine-payment-title">${escapeHtml(
                      loan.judul_buku || "Tanpa Judul",
                    )}</div>
                    <div class="fine-payment-meta">
                      <div><strong>Jatuh tempo:</strong> ${formatDateID(
                        loan._dueDateValue,
                      )}</div>
                      <div><strong>Usia denda:</strong> ${fineState.dueAgeDays} hari</div>
                      <div><strong>Total denda:</strong> ${formatRupiah(
                        loan._estimatedFine,
                      )}</div>
                      <div><strong>Status pengembalian:</strong> ${
                        fineState.isReturned
                          ? "Buku sudah dikembalikan"
                          : "Buku masih dipinjam"
                      }</div>
                    </div>
                  </div>
                  <span class="fine-payment-badge ${
                    paymentStatus === "menunggu_verifikasi"
                      ? "requested"
                      : "overdue"
                  }">
                    ${escapeHtml(badgeLabel)}
                  </span>
                </div>
                <div class="fine-payment-body">
                  <div>
                    <div class="fine-payment-status">${escapeHtml(
                      requestInfo,
                    )}</div>
                    <div class="fine-payment-helper" id="fine-helper-${escapeHtml(
                      loan.id,
                    )}">${escapeHtml(
                      getFinePaymentInstructionText(selectedMethod),
                    )}</div>
                  </div>
                  <div class="fine-payment-actions">
                    <select
                      class="fine-payment-select"
                      id="fine-method-${escapeHtml(loan.id)}"
                      onchange="refreshFinePaymentInstruction('${escapeHtml(
                        loan.id,
                      )}')"
                    >
                      ${Object.entries(FINE_PAYMENT_METHODS)
                        .map(
                          ([key, method]) =>
                            `<option value="${escapeHtml(key)}" ${
                              key === selectedMethod ? "selected" : ""
                            }>${escapeHtml(method.label)}</option>`,
                        )
                        .join("")}
                    </select>
                    <button
                      class="fine-payment-btn"
                      id="fine-submit-${escapeHtml(loan.id)}"
                      onclick="kirimPembayaranDenda('${escapeHtml(loan.id)}')"
                    >
                      ${escapeHtml(actionLabel)}
                    </button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }

      async function updateUserFinePaymentData(loanId, userId, payload) {
        const shouldVerifyFinePaymentStatus =
          Object.prototype.hasOwnProperty.call(
            payload,
            "status_pembayaran_denda",
          );
        const selectColumns = shouldVerifyFinePaymentStatus
          ? "id, denda, status_pembayaran_denda"
          : "id, denda";

        const response = await supabaseClient
          .from("peminjaman")
          .update(payload)
          .eq("id", loanId)
          .eq("user_id", userId)
          .select(selectColumns)
          .maybeSingle();

        if (
          !isMissingFinePaymentStatusColumnError(response.error) ||
          !shouldVerifyFinePaymentStatus
        ) {
          if (response.error) return response;
          if (!response.data) {
            return {
              data: null,
              error: {
                message:
                  "Data pinjaman tidak ditemukan atau tidak bisa diperbarui.",
              },
            };
          }
          if (
            shouldVerifyFinePaymentStatus &&
            response.data.status_pembayaran_denda !==
              payload.status_pembayaran_denda
          ) {
            return {
              data: response.data,
              error: {
                message:
                  "Status pembayaran denda gagal berubah. Muat ulang halaman lalu coba lagi.",
              },
            };
          }
          return response;
        }

        const fallbackPayload = { ...payload };
        delete fallbackPayload.status_pembayaran_denda;

        const fallbackResponse = await supabaseClient
          .from("peminjaman")
          .update(fallbackPayload)
          .eq("id", loanId)
          .eq("user_id", userId)
          .select("id, denda")
          .maybeSingle();

        if (!fallbackResponse.error) {
          if (!fallbackResponse.data) {
            return {
              data: null,
              error: {
                message:
                  "Data pinjaman tidak ditemukan atau tidak bisa diperbarui.",
              },
            };
          }
          console.warn(
            "Kolom status_pembayaran_denda belum tersedia di Supabase. Pengajuan denda tetap dikirim lewat helpdesk.",
          );
        }

        return fallbackResponse;
      }

      async function kirimPembayaranDenda(loanId) {
        const loan = pengembalianLoansCache.find(
          (item) => String(item.id) === String(loanId),
        );
        if (!loan) {
          showToast("Data pinjaman tidak ditemukan");
          return;
        }
        const fineState = getLoanFineState(loan);
        if (fineState.estimatedFine <= 0) {
          showToast("Pinjaman ini belum terkena denda");
          return;
        }
        if (fineState.finePaymentStatus === "lunas") {
          showToast("Denda untuk pinjaman ini sudah lunas");
          return;
        }
        if (!fineState.hasOutstandingFine) {
          showToast("Tidak ada denda aktif untuk pinjaman ini");
          return;
        }

        const methodSelect = document.getElementById(`fine-method-${loanId}`);
        const submitButton = document.getElementById(`fine-submit-${loanId}`);
        const methodKey = methodSelect?.value || "qris";
        const amount = fineState.estimatedFine;

        if (!amount) {
          showToast("Nominal denda belum tersedia");
          return;
        }

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = "Mengirim...";
        }

        try {
          const {
            data: { user },
          } = await supabaseClient.auth.getUser();

          if (!user) {
            showToast("Silakan login terlebih dahulu");
            return;
          }

          const profile = await ensureMemberProfile(user, {
            full_name: currentUser?.name || user.email.split("@")[0],
          });

          const updatePayload = { denda: amount };
          if (loan._hasFinePaymentStatusColumn !== false) {
            updatePayload.status_pembayaran_denda = "menunggu_verifikasi";
          }

          const { error: updateError } = await updateUserFinePaymentData(
            loanId,
            user.id,
            updatePayload,
          );

          if (updateError) {
            showToast("Gagal menyimpan data denda: " + updateError.message);
            return;
          }

          const { error: helpdeskError } = await insertHelpdeskUserMessage({
            user_id: user.id,
            user_name:
              profile?.full_name || currentUser?.name || user.email.split("@")[0],
            user_email: profile?.email || user.email,
            sender_role: "user",
            message: buildFinePaymentHelpdeskMessage(loan, methodKey, amount),
          });

          if (helpdeskError) {
            showToast(
              "Nominal denda tersimpan, tapi pengajuan ke admin gagal: " +
                helpdeskError.message,
            );
            return;
          }

          showToast("Pengajuan pembayaran denda berhasil dikirim");
          await loadPengembalianUser();
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Ajukan Pembayaran";
          }
        }
      }

      function getFilteredBukuUserData() {
        const cari = (document.getElementById("search-buku")?.value || "")
          .trim()
          .toLowerCase();
        const kategori = activeCategoryFilter.trim().toLowerCase();

        return allBukuUser.filter((book) => {
          const matchKategori =
            !kategori ||
            (book.kategori || "").trim().toLowerCase() === kategori;
          const matchCari =
            !cari ||
            (book.judul || "").toLowerCase().includes(cari) ||
            (book.penulis || "").toLowerCase().includes(cari) ||
            (book.kategori || "").toLowerCase().includes(cari);
          return matchKategori && matchCari;
        });
      }

      function getBookCoverPalette(categoryName) {
        const paletteMap = {
          fiksi: ["#4f46e5", "#7c3aed"],
          "non-fiksi": ["#0f766e", "#0d9488"],
          sejarah: ["#059669", "#10b981"],
          pendidikan: ["#2563eb", "#1d4ed8"],
          teknologi: ["#7c3aed", "#8b5cf6"],
          sains: ["#9333ea", "#a855f7"],
          biografi: ["#2563eb", "#60a5fa"],
          agama: ["#0284c7", "#06b6d4"],
          "seni & budaya": ["#0d9488", "#14b8a6"],
          ekonomi: ["#0f766e", "#14b8a6"],
          psikologi: ["#4f46e5", "#6366f1"],
        };

        return (
          paletteMap[String(categoryName || "").trim().toLowerCase()] || [
            "#0e7490",
            "#1a7fa8",
          ]
        );
      }

      function buildBookCoverDataUri(book) {
        const [startColor, endColor] = getBookCoverPalette(book?.kategori);
        const title = String(book?.judul || "Buku Literasea").trim();
        const author = String(book?.penulis || "Perpustakaan").trim();
        const category = String(book?.kategori || "Koleksi").trim();
        const initials = title
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((word) => word.charAt(0).toUpperCase())
          .join("") || "BK";

        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 300">
            <defs>
              <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${startColor}" />
                <stop offset="100%" stop-color="${endColor}" />
              </linearGradient>
            </defs>
            <rect width="420" height="300" rx="32" fill="url(#g)" />
            <circle cx="360" cy="52" r="72" fill="rgba(255,255,255,0.14)" />
            <circle cx="70" cy="250" r="88" fill="rgba(255,255,255,0.1)" />
            <text x="34" y="52" fill="rgba(255,255,255,0.85)" font-size="18" font-weight="800" letter-spacing="2">${escapeHtml(category.toUpperCase()).slice(0, 18)}</text>
            <text x="34" y="158" fill="#ffffff" font-size="84" font-weight="900">${escapeHtml(initials)}</text>
            <text x="34" y="206" fill="#ffffff" font-size="26" font-weight="800">${escapeHtml(title).slice(0, 26)}</text>
            <text x="34" y="236" fill="rgba(255,255,255,0.82)" font-size="18" font-weight="600">${escapeHtml(author).slice(0, 28)}</text>
          </svg>
        `;

        return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
      }

      function getBookCoverSource(book) {
        const coverUrl = normalizeBookCoverUrl(book?.cover_url);
        return coverUrl || getCachedBookCoverUrl(book) || buildBookCoverDataUri(book);
      }

      function renderBookShelfStats() {
        const statTotal = document.getElementById("book-stat-total");
        const statCategories = document.getElementById("book-stat-categories");
        const statMembers = document.getElementById("book-stat-members");
        const statBorrows = document.getElementById("book-stat-active-borrows");

        if (statTotal) {
          statTotal.textContent = bukuUserStats.totalStok.toLocaleString("id-ID");
        }
        if (statCategories) {
          statCategories.textContent = bukuUserStats.totalKategori.toLocaleString("id-ID");
        }
        if (statMembers) {
          statMembers.textContent = bukuUserStats.totalAnggota.toLocaleString("id-ID");
        }
        if (statBorrows) {
          statBorrows.textContent = bukuUserStats.totalPinjamAktif.toLocaleString("id-ID");
        }
      }

      function renderBookCategorySidebar() {
        const list = document.getElementById("book-category-list");
        if (!list) return;

        const items = [
          {
            name: "Semua Kategori",
            count: bukuUserStats.totalJudul,
            isActive: !activeCategoryFilter,
            onClick: "clearCategoryFilter()",
          },
          ...categories.map((category) => ({
            name: category.name,
            count: category.count,
            isActive: activeCategoryFilter === category.name,
            onClick: `selectBookShelfCategory(${JSON.stringify(category.name)})`,
          })),
        ];

        list.innerHTML = items
          .map(
            (item) => `
              <button
                type="button"
                class="book-category-item${item.isActive ? " active" : ""}"
                onclick='${item.onClick}'
              >
                <div class="book-category-item-text">
                  <span class="book-category-item-name">${escapeHtml(item.name)}</span>
                  <span class="book-category-item-count">${Number(item.count || 0).toLocaleString("id-ID")} buku</span>
                </div>
                <span class="book-category-item-badge">${Number(item.count || 0).toLocaleString("id-ID")}</span>
              </button>
            `,
          )
          .join("");
      }

      function selectBookShelfCategory(categoryName) {
        activeCategoryFilter = categoryName || "";
        updateCategoryFilterBanner();
        renderCategories();
        renderBukuTableUser();
        closeBookCategoryMenu();
      }

      function toggleBookCategoryMenu(forceOpen) {
        const panel = document.getElementById("book-category-panel");
        const overlay = document.getElementById("book-category-overlay");
        if (!panel || !overlay) return;

        const shouldOpen =
          typeof forceOpen === "boolean"
            ? forceOpen
            : !panel.classList.contains("open");

        panel.classList.toggle("open", shouldOpen);
        overlay.classList.toggle("open", shouldOpen);
      }

      function closeBookCategoryMenu() {
        toggleBookCategoryMenu(false);
      }

      async function loadBukuUser() {
        let data = [];
        let anggotaCount = 0;
        let aktifPinjam = 0;
        let peminjamanRows = [];

        try {
          const {
            data: { user },
          } = await supabaseClient.auth.getUser();

          const [bookRows, anggotaResult, peminjamanResult] = await Promise.all([
            loadBookRowsFromDatabase(),
            supabaseClient
              .from("profiles")
              .select("id", { count: "exact", head: true }),
            user
              ? fetchUserPeminjamanRows(user.id)
              : Promise.resolve({ data: [], error: null }),
          ]);
          data = bookRows;
          anggotaCount = anggotaResult.count || 0;
          peminjamanRows = peminjamanResult.data || [];
          aktifPinjam = peminjamanRows.filter((row) =>
            ["dipinjam", "menunggu", "pending"].includes(
              String(row.status || "").trim().toLowerCase(),
            ),
          ).length;
        } catch (error) {
          showToast("Gagal memuat data buku: " + error.message);
          return;
        }

        allBukuUser = data || [];
        syncActiveBorrowedBookIds(peminjamanRows);
        const totalStok = allBukuUser.reduce(
          (total, book) => total + (Number(book.stok) || 0),
          0,
        );
        const totalKategori = new Set(
          allBukuUser
            .map((book) => String(book.kategori || "").trim())
            .filter(Boolean),
        ).size;

        bukuUserStats = {
          totalStok,
          totalKategori,
          totalAnggota: anggotaCount || 0,
          totalPinjamAktif: aktifPinjam,
          totalJudul: allBukuUser.length,
        };

        renderBookShelfStats();
        updateCategoryCounts();
        renderBukuTableUser();
        renderPinjamBukuList();
        const statBuku = document.getElementById("stat-buku");
        if (statBuku) statBuku.textContent = totalStok.toLocaleString("id-ID");
        const statAnggota = document.getElementById("stat-anggota");
        if (statAnggota)
          statAnggota.textContent = (anggotaCount || 0).toLocaleString("id-ID");
      }

      function renderBukuTableUser() {
        const grid = document.getElementById("books-grid-user");
        const emptyState = document.getElementById("books-grid-empty");
        if (!grid || !emptyState) return;

        if (accountSuspensionState.isSuspended) {
          grid.innerHTML = `
            <div class="empty-state" style="display:flex;">
              <div>
                <p style="font-size:17px; font-weight:800; color:var(--text); margin-bottom:6px;">Akses koleksi sedang dikunci</p>
                <p>Selesaikan pembayaran denda terlebih dahulu untuk membuka kembali daftar buku.</p>
              </div>
            </div>
          `;
          emptyState.style.display = "none";
          return;
        }

        const data = getFilteredBukuUserData();
        updateCategoryFilterBanner();
        renderBookCategorySidebar();

        data
          .filter((book) => !normalizeBookCoverUrl(book.cover_url))
          .slice(0, 8)
          .forEach((book) => {
            ensureBookCoverResolved(book);
          });

        if (data.length === 0) {
          grid.innerHTML = "";
          emptyState.style.display = "block";
          return;
        }

        emptyState.style.display = "none";
        grid.innerHTML = data
          .map(
            (b) => `
              <article class="book-card" data-book-id="${escapeHtml(b.id)}" onclick="openBookDetailModal(this.dataset.bookId)">
                <div class="book-card-cover" data-book-id="${escapeHtml(b.id)}">
                  <img
                    src="${escapeHtml(getBookCoverSource(b))}"
                    alt="Cover ${escapeHtml(b.judul || "Buku")}"
                    data-cover-url="${escapeHtml(normalizeBookCoverUrl(b.cover_url))}"
                    data-cover-error-index="0"
                    referrerpolicy="no-referrer"
                    onerror="handleBookCoverImageError(this,'${escapeHtml(buildBookCoverDataUri(b))}')"
                  />
                  <span class="book-card-cover-badge">${escapeHtml(b.kategori || "Koleksi")}</span>
                </div>
                <div class="book-card-content">
                  <div class="book-card-title">${escapeHtml(b.judul || "Tanpa Judul")}</div>
                  <div class="book-card-author">${escapeHtml(b.penulis || "Penulis tidak tersedia")}</div>
                </div>
              </article>
            `,
          )
          .join("");
      }
      function filterBuku() {
        renderBukuTableUser();
      }

      function openBookDetailModal(bookId) {
        if (guardSuspendedAction()) return;

        const book = allBukuUser.find((item) => item.id === bookId);
        if (!book) {
          showToast("Detail buku tidak ditemukan");
          return;
        }

        const modal = document.getElementById("bookDetailModal");
        const cover = document.getElementById("detailCover");
        const category = document.getElementById("detailCategory");
        const title = document.getElementById("detailTitle");
        const author = document.getElementById("detailAuthor");
        const description = document.getElementById("detailDescription");
        const isbn = document.getElementById("detailIsbn");
        const publisher = document.getElementById("detailPublisher");
        const stock = document.getElementById("detailStock");
        const borrowBtn = document.getElementById("detailBorrowBtn");

        if (
          !modal ||
          !cover ||
          !category ||
          !title ||
          !author ||
          !description ||
          !isbn ||
          !publisher ||
          !stock ||
          !borrowBtn
        ) {
          return;
        }

        modal.dataset.bookId = String(book.id || "");
        cover.dataset.coverUrl = normalizeBookCoverUrl(book.cover_url || "");
        cover.dataset.coverErrorIndex = "0";
        cover.referrerPolicy = "no-referrer";
        cover.onerror = () =>
          handleBookCoverImageError(cover, buildBookCoverDataUri(book));
        cover.src = getBookCoverSource(book);
        cover.alt = `Cover ${book.judul || "Buku"}`;
        category.textContent = book.kategori || "Koleksi";
        title.textContent = book.judul || "Tanpa Judul";
        author.textContent = book.penulis || "Penulis tidak tersedia";
        description.textContent =
          book.deskripsi || "Belum ada sinopsis untuk buku ini.";
        isbn.textContent = book.isbn || "-";
        publisher.textContent = book.penerbit || "-";

        const isBorrowed = isBookCurrentlyBorrowed(book);

        if (isBorrowed) {
          stock.textContent = "Sedang Anda Pinjam";
          stock.style.color = "#2563eb";
        } else if (Number(book.stok || 0) > 0) {
          stock.textContent = `${Number(book.stok || 0).toLocaleString("id-ID")} Buku Tersedia`;
          stock.style.color = "#059669";
        } else {
          stock.textContent = "Habis Dipinjam";
          stock.style.color = "#ef4444";
        }

        if (isBorrowed) {
          borrowBtn.disabled = false;
          borrowBtn.className = "book-detail-cta";
          borrowBtn.textContent = "Baca";
          borrowBtn.onclick = () => {
            closeBookDetailModal();
            openBlankReader(book._dbId || book.id, book.judul || "Buku");
          };
        } else if (book._dbId && Number(book.stok || 0) > 0) {
          borrowBtn.disabled = false;
          borrowBtn.className = "book-detail-cta";
          borrowBtn.textContent = "Pinjam Sekarang";
          borrowBtn.onclick = () => {
            closeBookDetailModal();
            navigate("peminjaman");
            pilihBukuPinjam(book.id);
          };
        } else {
          borrowBtn.disabled = true;
          borrowBtn.className = "book-detail-cta disabled";
          borrowBtn.textContent =
            Number(book.stok || 0) > 0 ? "ID Belum Ada" : "Habis Dipinjam";
          borrowBtn.onclick = null;
        }

        modal.classList.add("open");
        document.body.style.overflow = "hidden";
        if (!normalizeBookCoverUrl(book.cover_url)) {
          ensureBookCoverResolved(book);
        }
      }

      function closeBookDetailModal() {
        const modal = document.getElementById("bookDetailModal");
        if (!modal) return;
        modal.classList.remove("open");
        modal.dataset.bookId = "";
        document.body.style.overflow = "";
      }

      function updateCategoryCounts() {
        categories.forEach((cat) => {
          const targetCategory = cat.name.trim().toLowerCase();
          cat.count = allBukuUser
            .filter(
              (b) => (b.kategori || "").trim().toLowerCase() === targetCategory,
            )
            .reduce((total, book) => total + (Number(book.stok) || 0), 0);
        });
        renderCategories();
        renderBookCategorySidebar();
      }

      // ---- STEP 1: daftar buku untuk dipinjam ----
      function renderPinjamBukuList() {
        const tbody = document.getElementById("pinjam-buku-tbody");
        if (!tbody) return;

        if (accountSuspensionState.isSuspended) {
          tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Akun ditangguhkan. Selesaikan pembayaran denda untuk mengajukan peminjaman baru.</p></div></td></tr>`;
          return;
        }

        const cari = (
          document.getElementById("search-pinjam-buku")?.value || ""
        ).toLowerCase();
        const data = allBukuUser.filter(
          (b) =>
            b._dbId &&
            b.stok > 0 &&
            (!cari ||
              b.judul.toLowerCase().includes(cari) ||
              b.penulis.toLowerCase().includes(cari)),
        );
        if (data.length === 0) {
          tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>Tidak ada buku yang tersedia untuk dipinjam</p></div></td></tr>`;
          return;
        }
        tbody.innerHTML = data
          .map(
            (b) => `
    <tr>
      <td><strong>${escapeHtml(b.judul)}</strong></td>
      <td>${escapeHtml(b.penulis)}</td>
      <td>${escapeHtml(b.kategori)}</td>
      <td>${b.stok}</td>
      <td><button class="btn btn-primary btn-sm" onclick="pilihBukuPinjam('${b.id}')">Pilih</button></td>
    </tr>
  `,
          )
          .join("");
      }
      function filterPinjamBuku() {
        renderPinjamBukuList();
      }

      function pilihBukuPinjam(id) {
        if (guardSuspendedAction()) return;

        const b = allBukuUser.find((x) => x.id === id);
        if (!b) {
          showToast("Buku tidak ditemukan, coba muat ulang halaman");
          return;
        }
        if (b.stok <= 0) {
          showToast("Maaf, stok buku ini sudah habis");
          return;
        }
        bukuTerpilih = b;
        document.getElementById("pinjam-judul-terpilih").textContent = b.judul;
        document.getElementById("pinjam-penulis-terpilih").textContent =
          "✍️ " + b.penulis;
        document.getElementById("pinjam-step1-body").style.display = "none";
        document.getElementById("pinjam-step2-body").style.display = "block";
        document.getElementById("step1").classList.remove("active");
        document.getElementById("step1").classList.add("inactive");
        document.getElementById("step2").classList.remove("inactive");
        document.getElementById("step2").classList.add("active");
      }

      function kembaliKeStep1Pinjam() {
        bukuTerpilih = null;
        document.getElementById("pinjam-step1-body").style.display = "block";
        document.getElementById("pinjam-step2-body").style.display = "none";
        document.getElementById("step2").classList.remove("active");
        document.getElementById("step2").classList.add("inactive");
        document.getElementById("step1").classList.remove("inactive");
        document.getElementById("step1").classList.add("active");
      }

      async function submitPengajuanPinjam() {
        if (guardSuspendedAction()) return;

        if (!bukuTerpilih) {
          showToast("Pilih buku terlebih dahulu");
          return;
        }
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) {
          showToast("Silakan login terlebih dahulu");
          return;
        }

        const profile = await ensureMemberProfile(user, {
          full_name: currentUser?.name || user.email.split("@")[0],
        });
        const durasi =
          parseInt(document.getElementById("pinjam-durasi").value) || 7;
        const catatan = document.getElementById("pinjam-catatan").value.trim();

        const tanggalPinjam = new Date();

        const tanggalKembali = new Date();
        tanggalKembali.setDate(tanggalKembali.getDate() + Number(durasi));

        const { error } = await supabaseClient.from("peminjaman").insert({
          user_id: user.id,
          buku_id: bukuTerpilih._dbId || bukuTerpilih.id,
          judul_buku: bukuTerpilih.judul || null,
          nama_anggota: profile?.full_name || currentUser?.name || user.email,
          tanggal_pinjam: tanggalPinjam.toISOString().split("T")[0],
          tanggal_kembali: tanggalKembali.toISOString().split("T")[0],
          durasi_hari: Number(durasi) || 7,
          status: "menunggu",
          catatan: catatan || null,
          denda: 0,
        });

        if (error) {
          console.error("INSERT ERROR:", error);
          showToast("Gagal mengajukan peminjaman: " + error.message);
          return;
        }

        showToast("✅ Pengajuan peminjaman terkirim! Tunggu konfirmasi admin.");
        document.getElementById("pinjam-catatan").value = "";
        kembaliKeStep1Pinjam();
        loadBukuUser();
        navigate("pengembalian");
      }
