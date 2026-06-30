// ====== CATEGORIES ======
      const categories = [
        {
          name: "Fiksi",
          color: "linear-gradient(135deg,#4f46e5,#7c3aed)",
          count: 0,
        },
        {
          name: "Non-Fiksi",
          color: "linear-gradient(135deg,#0e9e8a,#0d6a8e)",
          count: 0,
        },
        {
          name: "Sejarah",
          color: "linear-gradient(135deg,#10b981,#059669)",
          count: 0,
        },
        {
          name: "Pendidikan",
          color: "linear-gradient(135deg,#2563eb,#1d4ed8)",
          count: 0,
        },
        {
          name: "Pengembangan Diri",
          color: "linear-gradient(135deg,#7c3aed,#6d28d9)",
          count: 0,
        },
        {
          name: "Teknologi",
          color: "linear-gradient(135deg,#8b5cf6,#7c3aed)",
          count: 0,
        },
        {
          name: "Sains",
          color: "linear-gradient(135deg,#a855f7,#9333ea)",
          count: 0,
        },
        {
          name: "Biografi",
          color: "linear-gradient(135deg,#3b82f6,#2563eb)",
          count: 0,
        },
        {
          name: "Agama",
          color: "linear-gradient(135deg,#06b6d4,#0284c7)",
          count: 0,
        },
        {
          name: "Seni & Budaya",
          color: "linear-gradient(135deg,#10b981,#0e9e8a)",
          count: 0,
        },
        {
          name: "Ekonomi",
          color: "linear-gradient(135deg,#14b8a6,#0d9488)",
          count: 0,
        },
        {
          name: "Psikologi",
          color: "linear-gradient(135deg,#6366f1,#4f46e5)",
          count: 0,
        },
      ];

      // ====== RENDER CATEGORIES ======
      function renderCategories() {
        const grid = document.getElementById("category-grid");
        if (!grid) return;
        grid.innerHTML = categories
          .map(
            (cat) => `
    <button
      type="button"
      class="category-card${activeCategoryFilter === cat.name ? " active" : ""}"
      style="background:${cat.color}"
      onclick='openCategoryBooks(${JSON.stringify(cat.name)})'
      aria-label="Lihat buku kategori ${cat.name}"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      <h3>${cat.name}</h3>
      <p>${cat.count} Buku</p>
    </button>
  `,
          )
          .join("");
      }

      function openCategoryBooks(categoryName) {
        activeCategoryFilter = categoryName;
        const searchInput = document.getElementById("search-buku");
        if (searchInput) searchInput.value = "";
        renderCategories();
        navigate("buku");
        updateCategoryFilterBanner();
      }

      function clearCategoryFilter() {
        activeCategoryFilter = "";
        const searchInput = document.getElementById("search-buku");
        if (searchInput) searchInput.value = "";
        renderCategories();
        updateCategoryFilterBanner();
        renderBukuTableUser();
        closeBookCategoryMenu();
      }

      function updateCategoryFilterBanner() {
        const banner = document.getElementById("category-filter-banner");
        const label = document.getElementById("active-category-name");
        const chip = document.getElementById("book-current-category-chip");

        if (banner && label) {
          if (activeCategoryFilter) {
            label.textContent = activeCategoryFilter;
            banner.style.display = "flex";
          } else {
            label.textContent = "Semua kategori";
            banner.style.display = "none";
          }
        }

        if (chip) {
          chip.textContent = activeCategoryFilter || "Semua Kategori";
        }
      }

      function resetNavigationHistory() {
        currentPage = "";
        pageHistory = [];
        activeCategoryFilter = "";
      }

      function setMobileSidebar(open) {
        const sidebar = document.querySelector("#app .sidebar");
        const backdrop = document.querySelector("#app .mobile-sidebar-backdrop");
        const button = document.querySelector("#app .mobile-menu-btn");

        if (!sidebar) return;
        sidebar.classList.toggle("mobile-open", open);
        if (backdrop) backdrop.classList.toggle("show", open);
        document.body.classList.toggle("mobile-sidebar-open", open);
        if (button) {
          button.setAttribute("aria-expanded", String(open));
          button.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
        }
      }

      function toggleMobileSidebar() {
        const sidebar = document.querySelector("#app .sidebar");
        setMobileSidebar(!sidebar?.classList.contains("mobile-open"));
      }

      function closeMobileSidebar() {
        setMobileSidebar(false);
      }

      window.addEventListener("resize", () => {
        if (!window.matchMedia("(max-width: 900px)").matches) {
          closeMobileSidebar();
        }
      });

      // ====== NAVIGATION ======
      function navigate(page, options = {}) {
        const { skipHistory = false, resetHistory = false } = options;

        if (page === "kategori") page = "buku";

        if (isPageBlockedBySuspension(page)) {
          showToast(getSuspensionBlockedMessage());
          closeMobileSidebar();
          return;
        }

        if (resetHistory) {
          pageHistory = [];
        } else if (!skipHistory && currentPage && currentPage !== page) {
          pageHistory.push(currentPage);
        }

        currentPage = page;
        if (page === "dashboard") activeCategoryFilter = "";
        document
          .querySelectorAll(".page-panel")
          .forEach((p) => p.classList.remove("active"));
        document
          .querySelectorAll(".nav-item")
          .forEach((n) => n.classList.remove("active"));

        const panelMap = {
          dashboard: "page-dashboard",
          buku: "page-buku",
          anggota: "page-anggota",
          peminjaman: "page-peminjaman",
          pengembalian: "page-pengembalian",
          baca: "page-baca",
          riwayat: "page-riwayat",
          saranBuku: "page-saranBuku",
          helpdesk: "page-helpdesk",
        };

        const panel = document.getElementById(panelMap[page]);
        if (panel) panel.classList.add("active");

        if (page === "buku") renderBukuTableUser();
        if (page === "peminjaman") {
          kembaliKeStep1Pinjam();
          renderPinjamBukuList();
        }
        if (page === "pengembalian") loadPengembalianUser();
        if (page === "helpdesk") loadHelpdeskMessages();

        const navItems = document.querySelectorAll(".nav-item");
        const navMap = {
          dashboard: 0,
          buku: 1,
          anggota: 2,
          peminjaman: 3,
          pengembalian: 4,
          riwayat: 5,
          saranBuku: 6,
          helpdesk: 7,
        };
        if (navMap[page] !== undefined)
          navItems[navMap[page]].classList.add("active");
        closeMobileSidebar();
        if (page === "saranBuku") loadRiwayatSaran();
      }

      function goBackPage() {
        const previousPage = pageHistory.pop();
        if (!previousPage) {
          navigate("dashboard", { resetHistory: true });
          return;
        }
        navigate(previousPage, { skipHistory: true });
      }

function renderDashboardNews() {
        const grid = document.getElementById("dashboard-news-grid");
        if (!grid) return;

        grid.innerHTML = DASHBOARD_NEWS_ITEMS.map(
          (item) => `
            <article class="dashboard-news-item">
              <div class="dashboard-news-meta">
                <span class="dashboard-news-pill">${escapeHtml(item.tag)}</span>
                <span class="dashboard-news-date">${escapeHtml(item.date)}</span>
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.body)}</p>
            </article>
          `,
        ).join("");
      }

      function isPageBlockedBySuspension(page) {
        return (
          accountSuspensionState.isSuspended &&
          !ACCOUNT_SUSPEND_ALLOWED_PAGES.has(page)
        );
      }

      function getSuspensionBlockedMessage() {
        return "Akun sedang ditangguhkan. Silakan selesaikan pembayaran denda terlebih dahulu.";
      }

      function redirectToAllowedSuspensionPage() {
        if (currentPage !== "pengembalian") {
          navigate("pengembalian", { resetHistory: true });
          return;
        }
        setPengembalianTab("denda");
      }

      function guardSuspendedAction() {
        if (!accountSuspensionState.isSuspended) return false;
        showToast(getSuspensionBlockedMessage());
        redirectToAllowedSuspensionPage();
        return true;
      }

      function computeAccountSuspensionState(loans = []) {
        const blockedLoans = loans.filter((loan) => {
          const fineState = getLoanFineState(loan);
          return (
            fineState.hasOutstandingFine &&
            fineState.dueAgeDays >= ACCOUNT_SUSPEND_THRESHOLD_DAYS
          );
        });

        return {
          isSuspended: blockedLoans.length > 0,
          blockedLoans,
          totalFine: blockedLoans.reduce(
            (sum, loan) => sum + (Number(loan._estimatedFine) || 0),
            0,
          ),
          maxBlockedDays: blockedLoans.reduce(
            (max, loan) => Math.max(max, Number(loan._dueAgeDays) || 0),
            0,
          ),
        };
      }

      function updateAccountSuspensionUI() {
        const dashboardBanner = document.getElementById(
          "account-suspension-banner",
        );
        const pengembalianBanner = document.getElementById(
          "pengembalian-suspension-banner",
        );
        const isSuspended = accountSuspensionState.isSuspended;
        const blockedCount = accountSuspensionState.blockedLoans.length;
        const totalFine = formatRupiah(accountSuspensionState.totalFine);
        const suspensionDetail = isSuspended
          ? `Ada ${blockedCount} denda aktif yang belum selesai lebih dari ${ACCOUNT_SUSPEND_THRESHOLD_DAYS} hari. Total sementara ${totalFine}.`
          : "";

        if (dashboardBanner) {
          if (isSuspended) {
            dashboardBanner.style.display = "block";
            dashboardBanner.innerHTML = `
              <strong>Akun sementara ditangguhkan</strong>
              <p>${escapeHtml(
                suspensionDetail,
              )} Anda tetap bisa membuka dashboard dan pembayaran denda sampai semuanya selesai diproses.</p>
            `;
          } else {
            dashboardBanner.style.display = "none";
          }
        }

        if (pengembalianBanner) {
          if (isSuspended) {
            pengembalianBanner.style.display = "block";
            pengembalianBanner.innerHTML = `
              <strong>Akun ditangguhkan sampai denda diproses</strong>
              <p>${escapeHtml(
                suspensionDetail,
              )} Untuk sementara, hanya tab pembayaran denda yang bisa digunakan.</p>
            `;
          } else {
            pengembalianBanner.style.display = "none";
          }
        }

        document
          .querySelectorAll(".sidebar .nav-item[data-page]")
          .forEach((item) => {
            const page = item.dataset.page || "";
            const disabled = isPageBlockedBySuspension(page);
            item.classList.toggle("is-disabled", disabled);
            item.setAttribute("aria-disabled", disabled ? "true" : "false");
            item.title = disabled
              ? "Akses dikunci sampai pembayaran denda selesai."
              : "";
          });

        const daftarBtn = document.getElementById("tab-pengembalian-daftar");
        const dendaBtn = document.getElementById("tab-pengembalian-denda");
        if (daftarBtn) {
          daftarBtn.disabled = isSuspended;
          daftarBtn.classList.toggle("is-disabled", isSuspended);
        }
        if (dendaBtn) {
          dendaBtn.disabled = false;
          dendaBtn.classList.remove("is-disabled");
        }

        if (isSuspended && currentPage && isPageBlockedBySuspension(currentPage)) {
          navigate("pengembalian", { resetHistory: true });
        }
        if (isSuspended) {
          setPengembalianTab("denda");
        }

        if (isSuspended && !previousSuspensionFlag) {
          showToast(
            "Akun ditangguhkan karena denda melewati 3 hari. Silakan lanjutkan ke pembayaran.",
          );
        } else if (!isSuspended && previousSuspensionFlag) {
          showToast("Status akun kembali aktif.");
        }

        previousSuspensionFlag = isSuspended;
      }
