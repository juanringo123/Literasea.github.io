// ====== STATE ======
      let currentUser = null;
      let activeCategoryFilter = "";
      let currentPage = "";
      let pageHistory = [];
      // Tidak lagi pakai localStorage untuk users — pakai Supabase Auth
      const BOOKS_SYNC_KEY = "literasea_books_updated";
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
      let bukuRealtimeChannel = null;
      let bukuRefreshTimer = null;
      let helpdeskRealtimeChannel = null;
      let helpdeskRefreshTimer = null;
      const bookCoverLookupCache = new Map();
      const bookCoverLookupMisses = new Set();
      const bookCoverLookupPending = new Set();
      const HELPDESK_TABLE_CANDIDATES = ["helpdesk_messages", "helpdesk_chat"];
      const DASHBOARD_NEWS_ITEMS = [
        {
          tag: "Layanan",
          date: "26 Juni 2026",
          title: "Jam layanan akhir pekan diperpanjang",
          body: "Perpustakaan kini buka sampai pukul 18.00 setiap Sabtu agar proses pinjam, kembali, dan pembayaran denda lebih fleksibel.",
        },
        {
          tag: "Koleksi",
          date: "25 Juni 2026",
          title: "Rak pengembangan diri bertambah",
          body: "Beberapa judul baru tentang produktivitas, karier, dan public speaking sudah tersedia dan bisa diajukan untuk dipinjam.",
        },
        {
          tag: "Pengumuman",
          date: "24 Juni 2026",
          title: "Denda wajib diselesaikan maksimal 3 hari",
          body: "Jika denda belum diproses lebih dari 3 hari setelah jatuh tempo, akun akan ditangguhkan sementara sampai pembayaran selesai diverifikasi.",
        },
      ];
      const ACCOUNT_SUSPEND_THRESHOLD_DAYS = 3;
      const ACCOUNT_SUSPEND_ALLOWED_PAGES = new Set([
        "dashboard",
        "pengembalian",
      ]);
      let accountSuspensionState = {
        isSuspended: false,
        blockedLoans: [],
        totalFine: 0,
        maxBlockedDays: 0,
      };
      let previousSuspensionFlag = false;

      function requestBukuRefresh() {
        if (bukuRefreshTimer) clearTimeout(bukuRefreshTimer);
        bukuRefreshTimer = setTimeout(() => {
          bukuRefreshTimer = null;
          if (document.getElementById("app")?.classList.contains("active")) {
            loadBukuUser();
          }
        }, 100);
      }

      function startBukuRealtimeSync() {
        if (bukuRealtimeChannel) return;
        bukuRealtimeChannel = supabaseClient.channel("books-user-sync");
        BOOK_TABLE_CANDIDATES.forEach((table) => {
          bukuRealtimeChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            requestBukuRefresh,
          );
        });
        bukuRealtimeChannel.subscribe();
      }

      window.addEventListener("storage", (event) => {
        if (
          event.key === BOOKS_SYNC_KEY &&
          document.getElementById("app")?.classList.contains("active")
        ) {
          requestBukuRefresh();
        }
      });

      function normalizeColumnName(value) {
        return String(value || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
      }

      function resolveBookColumnName(columns, field) {
        const availableColumns = Array.isArray(columns) ? columns : [];
        if (!availableColumns.length) return null;

        const directMatch = availableColumns.find((column) => column === field);
        if (directMatch) return directMatch;

        const normalizedColumns = new Map(
          availableColumns.map((column) => [normalizeColumnName(column), column]),
        );
        const aliases = [...new Set([...(BOOK_FIELD_ALIASES[field] || []), field])];

        for (const alias of aliases) {
          const normalizedAlias = normalizeColumnName(alias);
          if (normalizedColumns.has(normalizedAlias)) {
            return normalizedColumns.get(normalizedAlias);
          }
        }

        return null;
      }

      function findBookColumn(row, field) {
        return resolveBookColumnName(Object.keys(row || {}), field);
      }

      function getBookValue(row, field) {
        const column = findBookColumn(row, field);
        return column ? row[column] : "";
      }

      function getBookStockValue(row) {
        const column = findBookColumn(row, "stok");
        if (!column) return 1;

        const rawValue = row[column];
        if (
          rawValue === null ||
          rawValue === undefined ||
          String(rawValue).trim() === ""
        ) {
          return 1;
        }

        const numericValue = Number(rawValue);
        return Number.isFinite(numericValue) ? Math.max(0, numericValue) : 1;
      }

      let googleBooksRateLimitedUntil = 0;

      function normalizeBookCoverUrl(value) {
        const normalized = String(value || "")
          .trim()
          .replace(/^['"]|['"]$/g, "");
        if (!normalized) return "";
        if (/^\/\//.test(normalized)) return `https:${normalized}`;
        return normalized.replace(/^http:\/\//i, "https://");
      }

      function uniqueUrlList(urls) {
        const seen = new Set();
        return (Array.isArray(urls) ? urls : []).filter((url) => {
          const normalized = normalizeBookCoverUrl(url);
          if (!normalized || seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        });
      }

      function buildBookCoverProxyUrl(url) {
        const normalized = normalizeBookCoverUrl(url);
        if (!normalized) return "";
        if (/^https:\/\/images\.weserv\.nl\/\?url=/i.test(normalized)) {
          return normalized;
        }
        return `https://images.weserv.nl/?url=${encodeURIComponent(
          normalized.replace(/^https?:\/\//i, ""),
        )}&default=404`;
      }

      function buildRenderableBookCoverUrls(url) {
        const normalized = normalizeBookCoverUrl(url);
        if (!normalized) return [];
        return uniqueUrlList([normalized, buildBookCoverProxyUrl(normalized)]);
      }

      function normalizeBookSearchText(value) {
        return String(value || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, " ")
          .trim();
      }

      function cleanBookIsbn(value) {
        return String(value || "")
          .toUpperCase()
          .replace(/[^0-9X]/g, "");
      }

      function buildOpenLibraryCoverUrlByIsbn(isbn, size = "L", strict = true) {
        const cleanIsbn = cleanBookIsbn(isbn);
        if (!cleanIsbn) return "";
        return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(cleanIsbn)}-${size}.jpg${strict ? "?default=false" : ""}`;
      }

      function buildOpenLibraryCoverUrlById(coverId, size = "L") {
        const normalizedId = String(coverId || "").trim();
        if (!normalizedId) return "";
        return `https://covers.openlibrary.org/b/id/${encodeURIComponent(normalizedId)}-${size}.jpg`;
      }

      function getGoogleBooksApiKey() {
        return String(
          window.LITERASEA_GOOGLE_BOOKS_API_KEY ||
            localStorage.getItem("literasea_google_books_api_key") ||
            "",
        ).trim();
      }

      function buildGoogleBooksImageUrl(imageLinks = {}) {
        const rawUrl =
          imageLinks.extraLarge ||
          imageLinks.large ||
          imageLinks.medium ||
          imageLinks.small ||
          imageLinks.thumbnail ||
          imageLinks.smallThumbnail ||
          "";

        return String(rawUrl || "").trim().replace(/^http:\/\//i, "https://");
      }

      function getBookCoverCacheKey(book) {
        return [
          cleanBookIsbn(book?.isbn),
          normalizeBookSearchText(book?.judul),
          normalizeBookSearchText(book?.penulis),
        ].join("|");
      }

      function getCachedBookCoverUrl(book) {
        const cacheKey = getBookCoverCacheKey(book);
        return cacheKey ? bookCoverLookupCache.get(cacheKey) || "" : "";
      }

      function probeBookCoverUrl(url, timeoutMs = 6000) {
        return new Promise((resolve) => {
          const candidates = buildRenderableBookCoverUrls(url);
          if (!candidates.length) {
            resolve("");
            return;
          }

          let settled = false;
          let activeImg = null;
          let timer = null;
          const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (activeImg) {
              activeImg.onload = null;
              activeImg.onerror = null;
            }
            resolve(result);
          };

          const tryCandidate = (index) => {
            if (index >= candidates.length) {
              finish("");
              return;
            }

            const candidateUrl = candidates[index];
            activeImg = new Image();
            timer = setTimeout(() => {
              if (activeImg) {
                activeImg.onload = null;
                activeImg.onerror = null;
              }
              tryCandidate(index + 1);
            }, timeoutMs);

            activeImg.onload = () => {
              finish(candidateUrl.replace("?default=false", ""));
            };
            activeImg.onerror = () => {
              clearTimeout(timer);
              tryCandidate(index + 1);
            };
            activeImg.referrerPolicy = "no-referrer";
            activeImg.src = candidateUrl;
          };

          tryCandidate(0);
        });
      }

      async function fetchGoogleBooksCandidates(query) {
        if (!query) return [];
        if (Date.now() < googleBooksRateLimitedUntil) return [];

        const params = new URLSearchParams({
          q: query,
          maxResults: "5",
          printType: "books",
          projection: "lite",
          fields:
            "items(volumeInfo/title,volumeInfo/authors,volumeInfo/industryIdentifiers,volumeInfo/imageLinks)",
        });

        const apiKey = getGoogleBooksApiKey();
        if (apiKey) params.set("key", apiKey);

        const response = await fetch(
          `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
        );
        if (response.status === 429) {
          googleBooksRateLimitedUntil = Date.now() + 10 * 60 * 1000;
          return [];
        }
        if (!response.ok) return [];

        const payload = await response.json();
        return Array.isArray(payload?.items) ? payload.items : [];
      }

      async function searchGoogleBooksCoverUrl(book) {
        const title = String(book?.judul || "").trim();
        const author = String(book?.penulis || "").trim();
        const isbn = cleanBookIsbn(book?.isbn);
        const queries = [];

        if (isbn) queries.push(`isbn:${isbn}`);
        if (title && author) {
          queries.push(`intitle:"${title}" inauthor:"${author}"`);
        }
        if (title) queries.push(`intitle:"${title}"`);

        const normalizedTitle = normalizeBookSearchText(title);
        const normalizedAuthor = normalizeBookSearchText(author);

        for (const query of queries) {
          const items = await fetchGoogleBooksCandidates(query);
          const candidates = items
            .map((item) => {
              const volumeInfo = item?.volumeInfo || {};
              const bookTitle = normalizeBookSearchText(volumeInfo?.title);
              const bookAuthor = normalizeBookSearchText(
                Array.isArray(volumeInfo?.authors)
                  ? volumeInfo.authors.join(" ")
                  : "",
              );
              const identifiers = Array.isArray(volumeInfo?.industryIdentifiers)
                ? volumeInfo.industryIdentifiers.map((identifier) =>
                    cleanBookIsbn(identifier?.identifier),
                  )
                : [];
              let score = 0;

              if (isbn && identifiers.includes(isbn)) score += 100;
              if (normalizedTitle && bookTitle === normalizedTitle) score += 60;
              else if (
                normalizedTitle &&
                (bookTitle.includes(normalizedTitle) ||
                  normalizedTitle.includes(bookTitle))
              ) {
                score += 35;
              }
              if (normalizedAuthor && bookAuthor.includes(normalizedAuthor)) {
                score += 25;
              }

              return { item, score };
            })
            .sort((left, right) => right.score - left.score);

          for (const candidate of candidates) {
            const imageUrl = buildGoogleBooksImageUrl(
              candidate.item?.volumeInfo?.imageLinks,
            );
            const verifiedUrl = await probeBookCoverUrl(imageUrl);
            if (verifiedUrl) return verifiedUrl;
          }
        }

        return "";
      }

      async function searchOpenLibraryCoverUrl(book) {
        const title = String(book?.judul || "").trim();
        const author = String(book?.penulis || "").trim();
        if (!title && !author) return "";

        const params = new URLSearchParams();
        if (title) params.set("title", title);
        if (author) params.set("author", author);
        params.set("limit", "5");
        params.set("fields", "title,author_name,cover_i,isbn");

        const response = await fetch(
          `https://openlibrary.org/search.json?${params.toString()}`,
        );
        if (!response.ok) return "";

        const payload = await response.json();
        const docs = Array.isArray(payload?.docs) ? payload.docs : [];
        if (!docs.length) return "";

        const normalizedTitle = normalizeBookSearchText(title);
        const normalizedAuthor = normalizeBookSearchText(author);
        const normalizedIsbn = cleanBookIsbn(book?.isbn);

        const candidates = docs
          .map((doc) => {
            let score = 0;
            const docTitle = normalizeBookSearchText(doc?.title);
            const docAuthor = normalizeBookSearchText(
              Array.isArray(doc?.author_name) ? doc.author_name.join(" ") : "",
            );
            const docIsbnList = Array.isArray(doc?.isbn)
              ? doc.isbn.map((value) => cleanBookIsbn(value))
              : [];

            if (normalizedTitle && docTitle === normalizedTitle) score += 60;
            else if (
              normalizedTitle &&
              (docTitle.includes(normalizedTitle) ||
                normalizedTitle.includes(docTitle))
            ) {
              score += 35;
            }

            if (normalizedAuthor && docAuthor.includes(normalizedAuthor)) {
              score += 25;
            }

            if (normalizedIsbn && docIsbnList.includes(normalizedIsbn)) {
              score += 80;
            }

            if (doc?.cover_i) score += 20;

            return { doc, score };
          })
          .sort((left, right) => right.score - left.score);

        for (const candidate of candidates) {
          const coverIdUrl = buildOpenLibraryCoverUrlById(
            candidate.doc?.cover_i,
          );
          const coverIdMatch = await probeBookCoverUrl(coverIdUrl);
          if (coverIdMatch) return coverIdMatch;

          const isbnMatch = Array.isArray(candidate.doc?.isbn)
            ? candidate.doc.isbn.find((value) => cleanBookIsbn(value))
            : "";
          const isbnUrl = buildOpenLibraryCoverUrlByIsbn(isbnMatch);
          const verifiedIsbnUrl = await probeBookCoverUrl(isbnUrl);
          if (verifiedIsbnUrl) return verifiedIsbnUrl;
        }

        return "";
      }

      async function resolveOriginalBookCoverUrl(book) {
        const googleBooksUrl = await searchGoogleBooksCoverUrl(book);
        if (googleBooksUrl) return googleBooksUrl;

        const directIsbnUrl = buildOpenLibraryCoverUrlByIsbn(book?.isbn);
        const verifiedIsbnUrl = await probeBookCoverUrl(directIsbnUrl);
        if (verifiedIsbnUrl) return verifiedIsbnUrl;

        return await searchOpenLibraryCoverUrl(book);
      }

      async function ensureBookCoverResolved(book) {
        const manualCoverUrl = normalizeBookCoverUrl(book?.cover_url);
        if (manualCoverUrl) return manualCoverUrl;

        const cacheKey = getBookCoverCacheKey(book);
        if (!cacheKey) return "";

        const cachedUrl = bookCoverLookupCache.get(cacheKey);
        if (cachedUrl) return cachedUrl;
        if (bookCoverLookupMisses.has(cacheKey)) return "";
        if (bookCoverLookupPending.has(cacheKey)) return "";

        bookCoverLookupPending.add(cacheKey);
        try {
          const resolvedUrl = await resolveOriginalBookCoverUrl(book);
          if (resolvedUrl) {
            bookCoverLookupMisses.delete(cacheKey);
            bookCoverLookupCache.set(cacheKey, resolvedUrl);
            if (currentPage === "buku") renderBukuTableUser();

            const modal = document.getElementById("bookDetailModal");
            const cover = document.getElementById("detailCover");
            if (
              modal?.classList.contains("open") &&
              modal.dataset.bookId === String(book.id) &&
              cover
            ) {
              cover.onerror = () => {
                cover.onerror = null;
                cover.src = buildBookCoverDataUri(book);
              };
              cover.src = resolvedUrl;
            }
          } else {
            bookCoverLookupMisses.add(cacheKey);
          }
          return resolvedUrl || "";
        } catch (error) {
          bookCoverLookupMisses.add(cacheKey);
          return "";
        } finally {
          bookCoverLookupPending.delete(cacheKey);
        }
      }

      function handleBookCoverImageError(img, fallbackSrc) {
        if (!img) return;

        const sourceUrl = img.dataset.coverUrl || "";
        const candidates = buildRenderableBookCoverUrls(sourceUrl);
        const triedIndex = Number(img.dataset.coverErrorIndex || "0");
        const nextCandidate = candidates[triedIndex + 1];

        if (nextCandidate) {
          img.dataset.coverErrorIndex = String(triedIndex + 1);
          img.src = nextCandidate;
          return;
        }

        img.onerror = null;
        img.src = fallbackSrc;
      }

      function normalizeBookRow(row, tableName, columns, index) {
        const dbId = getBookValue(row, "id");
        return {
          _dbId: dbId ? String(dbId) : "",
          _tableName: tableName,
          _columns: columns && columns.length ? columns : [...BOOK_FALLBACK_COLUMNS],
          id: dbId ? String(dbId) : `${tableName}-${index + 1}`,
          judul: String(getBookValue(row, "judul") || "").trim(),
          penulis: String(getBookValue(row, "penulis") || "").trim(),
          isbn: String(getBookValue(row, "isbn") || "").trim(),
          penerbit: String(getBookValue(row, "penerbit") || "").trim(),
          kategori: String(getBookValue(row, "kategori") || "").trim(),
          stok: getBookStockValue(row),
          cover_url: normalizeBookCoverUrl(getBookValue(row, "cover_url")),
          deskripsi: String(getBookValue(row, "deskripsi") || "").trim(),
        };
      }

      async function loadBookRowsFromDatabase() {
        const results = [];
        const errors = [];

        for (const tableName of BOOK_TABLE_CANDIDATES) {
          const { data, error } = await supabaseClient.from(tableName).select("*");
          if (error) {
            errors.push(`${tableName}: ${error.message}`);
            continue;
          }

          results.push({
            tableName,
            rows: data || [],
            columns: Object.keys((data && data[0]) || {}),
          });

          if (tableName === "buku" || (data || []).length) {
            break;
          }
        }

        if (!results.length) {
          throw new Error(errors.join(" | ") || "Tabel buku tidak ditemukan.");
        }

        const tableOrder = new Map(
          BOOK_TABLE_CANDIDATES.map((name, index) => [name, index]),
        );
        const sortedResults = [...results].sort((left, right) => {
          const orderDiff =
            (tableOrder.get(left.tableName) ?? 99) -
            (tableOrder.get(right.tableName) ?? 99);
          if (orderDiff !== 0) return orderDiff;
          return (right.rows?.length || 0) - (left.rows?.length || 0);
        });

        const seenKeys = new Set();
        const mergedRows = [];
        sortedResults.forEach((result) => {
          result.rows.forEach((row, index) => {
            const normalizedRow = normalizeBookRow(
              row,
              result.tableName,
              result.columns,
              index,
            );
            const dedupeKey = [
              normalizedRow.judul,
              normalizedRow.penulis,
              normalizedRow.isbn,
              normalizedRow.kategori,
            ]
              .map((value) => String(value || "").trim().toLowerCase())
              .join("|");
            if (seenKeys.has(dedupeKey)) return;
            seenKeys.add(dedupeKey);
            mergedRows.push(normalizedRow);
          });
        });

        return mergedRows.sort((left, right) =>
          left.judul.localeCompare(right.judul, "id"),
        );
      }
