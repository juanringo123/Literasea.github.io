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
          availableColumns.map((column) => [
            normalizeColumnName(column),
            column,
          ]),
        );
        const aliases = [
          ...new Set([...(BOOK_FIELD_ALIASES[field] || []), field]),
        ];

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

      function isLikelyDirectImageAssetUrl(url) {
        const normalized = normalizeBookCoverUrl(url);
        if (!normalized) return false;
        if (/^data:image\//i.test(normalized)) return true;

        try {
          const parsed = new URL(normalized);
          const pathname = String(parsed.pathname || "");
          return /\.(avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)(?:$|\?)/i.test(
            pathname,
          );
        } catch (_) {
          return false;
        }
      }

      function isLikelyWebPageUrl(url) {
        const normalized = normalizeBookCoverUrl(url);
        if (!normalized) return false;
        if (isLikelyDirectImageAssetUrl(normalized)) return false;

        try {
          const parsed = new URL(normalized);
          const pathname = String(parsed.pathname || "").toLowerCase();
          if (!pathname || pathname === "/") return true;
          return !/\.(avif|bmp|gif|ico|jpe?g|jfif|png|svg|webp)$/i.test(
            pathname,
          );
        } catch (_) {
          return false;
        }
      }

      function buildAbsoluteBookUrl(baseUrl, candidateUrl) {
        const normalizedCandidate = String(candidateUrl || "").trim();
        if (!normalizedCandidate) return "";

        try {
          return normalizeBookCoverUrl(
            new URL(normalizedCandidate, baseUrl).toString(),
          );
        } catch (_) {
          return normalizeBookCoverUrl(normalizedCandidate);
        }
      }

      async function fetchBookPageHtml(pageUrl) {
        const normalized = normalizeBookCoverUrl(pageUrl);
        if (!normalized) return "";

        const fetchTargets = uniqueUrlList([
          normalized,
          `https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`,
        ]);

        for (const fetchTarget of fetchTargets) {
          try {
            const response = await fetch(fetchTarget, {
              method: "GET",
              cache: "no-store",
            });
            if (!response.ok) continue;

            const html = await response.text();
            if (/<(html|head|body|meta|img)\b/i.test(html)) {
              return html;
            }
          } catch (_) {}
        }

        return "";
      }

      function extractCandidateImageUrlsFromHtml(html, pageUrl) {
        if (!html) return [];

        let documentNode = null;
        try {
          documentNode = new DOMParser().parseFromString(html, "text/html");
        } catch (_) {
          return [];
        }
        if (!documentNode) return [];

        const rawCandidates = [];
        const pushValue = (value) => {
          const absoluteUrl = buildAbsoluteBookUrl(pageUrl, value);
          if (absoluteUrl) rawCandidates.push(absoluteUrl);
        };

        [
          'meta[property="og:image"]',
          'meta[property="og:image:secure_url"]',
          'meta[name="twitter:image"]',
          'meta[name="twitter:image:src"]',
          'link[rel="image_src"]',
        ].forEach((selector) => {
          documentNode.querySelectorAll(selector).forEach((node) => {
            pushValue(
              node.getAttribute("content") || node.getAttribute("href"),
            );
          });
        });

        [
          "img.wp-post-image",
          ".woocommerce-product-gallery__image img",
          ".product img",
          "main img",
          "article img",
          "img",
        ].forEach((selector) => {
          documentNode.querySelectorAll(selector).forEach((node) => {
            pushValue(
              node.getAttribute("src") ||
                node.getAttribute("data-src") ||
                node.getAttribute("data-large_image") ||
                node
                  .getAttribute("srcset")
                  ?.split(",")?.[0]
                  ?.trim()
                  ?.split(" ")?.[0],
            );
          });
        });

        return uniqueUrlList(rawCandidates);
      }

      async function resolveCoverUrlFromPageUrl(pageUrl) {
        const normalized = normalizeBookCoverUrl(pageUrl);
        if (!normalized || !isLikelyWebPageUrl(normalized)) return "";

        const html = await fetchBookPageHtml(normalized);
        if (!html) return "";

        const candidates = extractCandidateImageUrlsFromHtml(html, normalized);
        for (const candidateUrl of candidates) {
          const verifiedUrl = await probeBookCoverUrl(candidateUrl);
          if (verifiedUrl) return verifiedUrl;
        }

        return "";
      }

      async function resolveManualBookCoverInputUrl(url) {
        const normalized = normalizeBookCoverUrl(url);
        if (!normalized) return "";

        const verifiedDirectUrl = await probeBookCoverUrl(normalized);
        if (verifiedDirectUrl) return verifiedDirectUrl;

        return await resolveCoverUrlFromPageUrl(normalized);
      }

      function getManualBookCoverInputErrorMessage(url) {
        const normalized = normalizeBookCoverUrl(url);
        if (!normalized) {
          return "URL cover belum diisi.";
        }
        if (isLikelyWebPageUrl(normalized)) {
          return "Link yang Anda isi masih halaman produk / artikel, bukan file gambar langsung. Coba salin alamat gambarnya (.jpg/.png/.webp) atau biarkan sistem ambil gambar utama dari halaman itu.";
        }
        return "URL gambar tidak bisa diakses. Pastikan itu link gambar langsung yang bisa dibuka publik.";
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

        return String(rawUrl || "")
          .trim()
          .replace(/^http:\/\//i, "https://");
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

      async function isiCoverBukuOtomatis() {
        const button = document.getElementById("book-auto-cover-btn");
        const input = document.getElementById("book-cover-url");
        const manualCoverUrl = normalizeBookCoverUrl(input?.value);
        const book = {
          judul: document.getElementById("book-judul")?.value?.trim(),
          penulis: document.getElementById("book-penulis")?.value?.trim(),
          isbn: document.getElementById("book-isbn")?.value?.trim(),
        };

        if (!manualCoverUrl && !book.judul && !book.isbn) {
          showToast(
            "Isi judul atau ISBN dulu supaya cover bisa dicari.",
            "warning",
          );
          return;
        }

        if (button) {
          button.disabled = true;
          button.textContent = manualCoverUrl
            ? "⏳ Mengecek URL..."
            : "⏳ Mencari...";
        }

        try {
          if (manualCoverUrl) {
            const resolvedManualUrl =
              await resolveManualBookCoverInputUrl(manualCoverUrl);

            if (!resolvedManualUrl) {
              showToast(
                getManualBookCoverInputErrorMessage(manualCoverUrl),
                "warning",
              );
              return;
            }

            if (input) input.value = resolvedManualUrl;
            showToast(
              "🖼️ URL cover dari link yang Anda isi berhasil dipakai!",
              "success",
            );
            return;
          }

          const resolvedUrl = await resolveOriginalBookCoverUrl(book);
          if (!resolvedUrl) {
            showToast(
              "Cover asli belum ketemu. Coba isi ISBN yang lebih lengkap.",
              "warning",
            );
            return;
          }

          if (input) input.value = resolvedUrl;
          showToast("🖼️ URL cover asli berhasil diisi!", "success");
        } catch (error) {
          showToast(
            "Gagal mencari cover otomatis: " + (error?.message || error),
            "danger",
          );
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = "🖼️ Cek URL / Cari Cover";
          }
        }
      }

      function buildBookMatchData(row) {
        const matchData = {};
        [
          "judul",
          "penulis",
          "isbn",
          "penerbit",
          "kategori",
          "stok",
          "cover_url",
          "deskripsi",
        ].forEach((field) => {
          const column = findBookColumn(row, field);
          const value = column ? row[column] : undefined;
          if (
            column &&
            value !== null &&
            value !== undefined &&
            String(value).trim() !== ""
          ) {
            matchData[column] = value;
          }
        });
        return matchData;
      }

      function normalizeBookRow(row, tableName, columns, index) {
        const dbId = getBookValue(row, "id");
        return {
          _dbId: dbId ? String(dbId) : "",
          _idColumn: findBookColumn(row, "id") || "id",
          _tableName: tableName,
          _columns:
            columns && columns.length ? columns : [...BOOK_FALLBACK_COLUMNS],
          _matchData: buildBookMatchData(row),
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
          const { data, error } = await supabaseClient
            .from(tableName)
            .select("*");
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

        const writableTable =
          results.find((result) => result.tableName === "buku") ||
          sortedResults[0];

        activeBookTableName = writableTable.tableName;
        activeBookColumns = writableTable.columns.length
          ? writableTable.columns
          : [...BOOK_FALLBACK_COLUMNS];

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
              .map((value) =>
                String(value || "")
                  .trim()
                  .toLowerCase(),
              )
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

      function buildBookPayloadFromColumns(book, columns = activeBookColumns) {
        const payload = {};
        const fieldValues = {
          judul: book.judul,
          penulis: book.penulis,
          isbn: book.isbn || null,
          penerbit: book.penerbit || null,
          kategori: book.kategori,
          stok: book.stok,
          cover_url: normalizeBookCoverUrl(book.cover_url) || null,
          deskripsi: book.deskripsi || null,
        };

        Object.entries(fieldValues).forEach(([field, value]) => {
          const column = resolveBookColumnName(columns, field);
          if (column) payload[column] = value;
        });

        return Object.keys(payload).length ? payload : null;
      }

      function uniquePayloads(payloads) {
        const seen = new Set();
        return payloads.filter((payload) => {
          if (!payload) return false;
          const key = JSON.stringify(payload);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      function buildBookPayloadCandidates(book, columns = activeBookColumns) {
        const normalizedCoverUrl = normalizeBookCoverUrl(book.cover_url);
        const mappedPayload = buildBookPayloadFromColumns(book, columns);

        if (mappedPayload) {
          return uniquePayloads([mappedPayload]);
        }

        const defaultPayload = {
          judul: book.judul,
          penulis: book.penulis,
          isbn: book.isbn || null,
          penerbit: book.penerbit || null,
          kategori: book.kategori,
          stok: book.stok,
          deskripsi: book.deskripsi || null,
        };
        const legacyBukuPayload = {
          title: book.judul,
          author: book.penulis,
          isbn: book.isbn || null,
          publisher: book.penerbit || null,
          genre: book.kategori,
          stok: book.stok,
          deskripsi: book.deskripsi || null,
        };
        const englishPayload = {
          title: book.judul,
          author: book.penulis,
          isbn: book.isbn || null,
          publisher: book.penerbit || null,
          genre: book.kategori,
          stock: book.stok,
          description: book.deskripsi || null,
        };

        const payloads = [defaultPayload, legacyBukuPayload, englishPayload];

        if (normalizedCoverUrl) {
          payloads.splice(
            0,
            0,
            { ...defaultPayload, cover_url: normalizedCoverUrl },
            { ...defaultPayload, image_url: normalizedCoverUrl },
            { ...defaultPayload, url_gambar: normalizedCoverUrl },
            { ...legacyBukuPayload, cover_url: normalizedCoverUrl },
            { ...legacyBukuPayload, image_url: normalizedCoverUrl },
            { ...englishPayload, cover_url: normalizedCoverUrl },
            { ...englishPayload, image_url: normalizedCoverUrl },
          );
        }

        return uniquePayloads(payloads);
      }

      async function insertBookToDatabase(book, context = {}) {
        const tableName = context.tableName || activeBookTableName || "buku";
        const columns = context.columns || activeBookColumns;
        const dbId = context.dbId || "";
        const idColumn = context.idColumn || "id";
        const matchData = context.matchData || {};
        const payloads = buildBookPayloadCandidates(book, columns);

        let lastError = null;
        const collectedErrors = [];
        for (const payload of payloads) {
          const query = supabaseClient.from(tableName);
          const response = dbId
            ? await query.update(payload).eq(idColumn, dbId)
            : Object.keys(matchData).length
              ? await query.update(payload).match(matchData)
              : await query.insert([payload]);
          const { error } = response;

          if (!error) return { error: null };
          lastError = error;
          collectedErrors.push(error.message || String(error));
        }

        if (
          lastError &&
          (String(lastError.code || "").trim() === "42501" ||
            /permission|policy|not allowed|forbidden|row-level security|row level security/i.test(
              String(lastError.message || ""),
            ))
        ) {
          return {
            error: new Error(
              `Akses simpan ke tabel ${tableName} ditolak Supabase. Jalankan SQL migrasi policy buku terlebih dahulu.`,
            ),
          };
        }

        if (collectedErrors.length > 1) {
          return {
            error: new Error(collectedErrors.join(" | ")),
          };
        }

        return { error: lastError };
      }

      function formatMemberDate(value) {
        if (!value) return "-";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }

      function getMemberAvatarStyle(seed) {
        const text = String(seed || "member");
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
          hash =
            (hash + text.charCodeAt(index)) % MEMBER_AVATAR_GRADIENTS.length;
        }
        return MEMBER_AVATAR_GRADIENTS[hash];
      }

      function requestMemberRefresh() {
        if (memberRefreshTimer) clearTimeout(memberRefreshTimer);
        memberRefreshTimer = setTimeout(() => {
          memberRefreshTimer = null;
          loadMembers();
          loadDashboardStats();
          if (
            document
              .getElementById("page-semuaAnggota")
              ?.classList.contains("active")
          ) {
            loadOwnerMembers();
          }
          if (
            document
              .getElementById("page-semuaTransaksi")
              ?.classList.contains("active")
          ) {
            loadOwnerTransactions();
          }
        }, 120);
      }

      function requestBookRefresh() {
        if (bookRefreshTimer) clearTimeout(bookRefreshTimer);
        bookRefreshTimer = setTimeout(() => {
          bookRefreshTimer = null;
          loadDashboardStats();
          loadKoleksiBuku();
        }, 120);
      }

      function requestHelpdeskRefresh() {
        if (helpdeskRefreshTimer) clearTimeout(helpdeskRefreshTimer);
        helpdeskRefreshTimer = setTimeout(() => {
          helpdeskRefreshTimer = null;
          if (
            document
              .getElementById("page-helpdeskChat")
              ?.classList.contains("active")
          ) {
            loadHelpdeskChat();
            return;
          }
          loadDashboardHelpdesk();
        }, 120);
      }

      function startMemberRealtimeSync() {
        if (memberRealtimeChannel) return;
        memberRealtimeChannel = supabaseClient
          .channel("admin-member-sync")
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles" },
            requestMemberRefresh,
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "peminjaman" },
            requestMemberRefresh,
          )
          .subscribe();
      }

      function startBookRealtimeSync() {
        if (bookRealtimeChannel) return;
        bookRealtimeChannel = supabaseClient.channel("admin-book-sync");
        BOOK_TABLE_CANDIDATES.forEach((tableName) => {
          bookRealtimeChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: tableName },
            requestBookRefresh,
          );
        });
        bookRealtimeChannel.subscribe();
      }

      function startHelpdeskRealtimeSync() {
        if (helpdeskRealtimeChannel) return;
        helpdeskRealtimeChannel = supabaseClient.channel("admin-helpdesk-sync");
        HELPDESK_TABLE_CANDIDATES.forEach((tableName) => {
          helpdeskRealtimeChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table: tableName },
            requestHelpdeskRefresh,
          );
        });
        helpdeskRealtimeChannel.subscribe();
      }

      function normalizeBorrowingStatus(status) {
        return String(status || "")
          .trim()
          .toLowerCase() === "pending"
          ? "menunggu"
          : String(status || "")
              .trim()
              .toLowerCase();
      }

      function matchesBorrowingStatuses(status, requestedStatuses = []) {
        if (!Array.isArray(requestedStatuses) || !requestedStatuses.length)
          return true;

        const normalizedStatus = normalizeBorrowingStatus(status);
        const normalizedTargets = requestedStatuses.map(
          normalizeBorrowingStatus,
        );
        return normalizedTargets.includes(normalizedStatus);
      }

      function getBorrowingStatusMeta(status) {
        const normalizedStatus = normalizeBorrowingStatus(status);

        if (normalizedStatus === "menunggu") {
          return {
            className: "badge-yellow",
            label: "⏳ Pending",
          };
        }

        if (normalizedStatus === "dipinjam") {
          return {
            className: "badge-green",
            label: "✅ Disetujui",
          };
        }

        if (normalizedStatus === "ditolak") {
          return {
            className: "badge-red",
            label: "❌ Ditolak",
          };
        }

        if (normalizedStatus === "dikembalikan") {
          return {
            className: "badge-blue",
            label: "↩ Dikembalikan",
          };
        }

        return {
          className: "badge-blue",
          label: normalizedStatus
            ? escapeHtml(
                normalizedStatus.charAt(0).toUpperCase() +
                  normalizedStatus.slice(1),
              )
            : "-",
        };
      }

      function isMissingColumnError(error, columnName) {
        const message = String(error?.message || error || "").toLowerCase();
        const normalizedColumn = String(columnName || "").toLowerCase();
        return (
          message.includes(normalizedColumn) &&
          (message.includes("does not exist") ||
            message.includes("schema cache") ||
            message.includes("column"))
        );
      }

      async function fetchPeminjamanRows({
        statuses = null,
        status = null,
        userId = null,
        ascending = false,
      } = {}) {
        const orderColumns = [
          "created_at",
          "tanggal_pinjam",
          "tanggal_kembali",
        ];
        const requestedStatuses =
          Array.isArray(statuses) && statuses.length ? statuses : null;
        const safeStatuses = requestedStatuses
          ? requestedStatuses
              .map(normalizeBorrowingStatus)
              .filter(
                (value, index, array) =>
                  value && array.indexOf(value) === index,
              )
          : null;
        let lastError = null;

        for (const orderColumn of orderColumns) {
          let query = supabaseClient.from("peminjaman").select("*");
          if (Array.isArray(safeStatuses) && safeStatuses.length) {
            query = query.in("status", safeStatuses);
          }
          if (status) {
            query = query.eq("status", normalizeBorrowingStatus(status));
          }
          if (userId) {
            query = query.eq("user_id", userId);
          }

          const response = await query.order(orderColumn, { ascending });
          if (!response.error) {
            return {
              ...response,
              data: (response.data || []).filter((row) =>
                matchesBorrowingStatuses(row.status, requestedStatuses),
              ),
            };
          }
          lastError = response.error;
        }

        let fallbackQuery = supabaseClient.from("peminjaman").select("*");
        if (Array.isArray(safeStatuses) && safeStatuses.length) {
          fallbackQuery = fallbackQuery.in("status", safeStatuses);
        }
        if (status) {
          fallbackQuery = fallbackQuery.eq(
            "status",
            normalizeBorrowingStatus(status),
          );
        }
        if (userId) {
          fallbackQuery = fallbackQuery.eq("user_id", userId);
        }

        const fallbackResponse = await fallbackQuery;
        return {
          data: (fallbackResponse.data || []).filter((row) =>
            matchesBorrowingStatuses(row.status, requestedStatuses),
          ),
          error: fallbackResponse.error || lastError,
        };
      }

      let peminjamanFineStatusColumnAvailable = null;

      async function fetchReturnLoanForAdmin(id) {
        const fetchWithoutFineStatus = async () => {
          const fallbackResponse = await supabaseClient
            .from("peminjaman")
            .select("id, tanggal_kembali, status, denda")
            .eq("id", id)
            .maybeSingle();

          return {
            ...fallbackResponse,
            data: fallbackResponse.data
              ? {
                  ...fallbackResponse.data,
                  status_pembayaran_denda: "belum_dibayar",
                  _hasFinePaymentStatusColumn: false,
                }
              : fallbackResponse.data,
          };
        };

        if (peminjamanFineStatusColumnAvailable === false) {
          return fetchWithoutFineStatus();
        }

        const response = await supabaseClient
          .from("peminjaman")
          .select("id, tanggal_kembali, status, denda, status_pembayaran_denda")
          .eq("id", id)
          .maybeSingle();

        if (!isMissingColumnError(response.error, "status_pembayaran_denda")) {
          if (!response.error) {
            peminjamanFineStatusColumnAvailable = true;
          }
          return {
            ...response,
            data: response.data
              ? {
                  ...response.data,
                  _hasFinePaymentStatusColumn: true,
                }
              : response.data,
          };
        }

        peminjamanFineStatusColumnAvailable = false;
        return fetchWithoutFineStatus();
      }

      async function updatePeminjamanSafe(id, payload) {
        const shouldVerifyFinePaymentStatus =
          Object.prototype.hasOwnProperty.call(
            payload,
            "status_pembayaran_denda",
          );
        const selectColumns = shouldVerifyFinePaymentStatus
          ? "id, status, denda, status_pembayaran_denda"
          : "id, status, denda";

        if (
          shouldVerifyFinePaymentStatus &&
          peminjamanFineStatusColumnAvailable === false
        ) {
          const fallbackPayload = { ...payload };
          const requestedFineStatus = fallbackPayload.status_pembayaran_denda;
          delete fallbackPayload.status_pembayaran_denda;

          if (requestedFineStatus === "lunas") {
            fallbackPayload.denda = 0;
          }

          const fallbackResponse = await supabaseClient
            .from("peminjaman")
            .update(fallbackPayload)
            .eq("id", id)
            .select("id, status, denda")
            .maybeSingle();

          if (fallbackResponse.error) {
            return fallbackResponse;
          }

          if (!fallbackResponse.data) {
            return {
              data: null,
              error: {
                message:
                  "Data peminjaman tidak ditemukan atau tidak bisa diperbarui.",
              },
            };
          }

          return {
            ...fallbackResponse,
            data: {
              ...fallbackResponse.data,
              status_pembayaran_denda:
                requestedFineStatus === "lunas" ? "lunas" : "belum_dibayar",
              _hasFinePaymentStatusColumn: false,
            },
          };
        }

        const response = await supabaseClient
          .from("peminjaman")
          .update(payload)
          .eq("id", id)
          .select(selectColumns)
          .maybeSingle();

        if (
          isMissingColumnError(response.error, "status_pembayaran_denda") &&
          shouldVerifyFinePaymentStatus
        ) {
          const fallbackPayload = { ...payload };
          const requestedFineStatus = fallbackPayload.status_pembayaran_denda;
          delete fallbackPayload.status_pembayaran_denda;
          peminjamanFineStatusColumnAvailable = false;

          if (requestedFineStatus === "lunas") {
            fallbackPayload.denda = 0;
          }

          const fallbackResponse = await supabaseClient
            .from("peminjaman")
            .update(fallbackPayload)
            .eq("id", id)
            .select("id, status, denda")
            .maybeSingle();

          if (fallbackResponse.error) {
            return fallbackResponse;
          }

          if (!fallbackResponse.data) {
            return {
              data: null,
              error: {
                message:
                  "Data peminjaman tidak ditemukan atau tidak bisa diperbarui.",
              },
            };
          }

          return {
            ...fallbackResponse,
            data: {
              ...fallbackResponse.data,
              status_pembayaran_denda:
                requestedFineStatus === "lunas"
                  ? "lunas"
                  : "belum_dibayar",
              _hasFinePaymentStatusColumn: false,
            },
          };
        }

        if (response.error) {
          return response;
        }

        if (shouldVerifyFinePaymentStatus) {
          peminjamanFineStatusColumnAvailable = true;
        }

        if (!response.data) {
          return {
            data: null,
            error: {
              message:
                "Data peminjaman tidak ditemukan atau tidak bisa diperbarui.",
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
                "Status pembayaran denda gagal berubah. Muat ulang halaman admin lalu coba lagi.",
            },
          };
        }

        return response;
      }

      async function loadDashboardBorrowRequests() {
        const tbody = document.getElementById("dashboardBorrowRequestsBody");
        if (!tbody) return;

        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="color: var(--text-muted); font-size: 13px">
              Memuat data peminjaman...
            </td>
          </tr>
        `;

        const { data, error } = await fetchPeminjamanRows({
          statuses: ["menunggu", "pending", "dipinjam", "ditolak"],
          ascending: false,
        });

        if (error) {
          tbody.innerHTML = `
            <tr>
              <td colspan="4" style="color:#ef4444; font-size: 13px">
                Gagal memuat data peminjaman.
              </td>
            </tr>
          `;
          console.error("Gagal memuat widget dashboard peminjaman:", error);
          return;
        }

        const rows = (data || []).slice(0, 5);
        if (!rows.length) {
          tbody.innerHTML = `
            <tr>
              <td colspan="4" style="color: var(--text-muted); font-size: 13px">
                Belum ada data peminjaman terbaru.
              </td>
            </tr>
          `;
          return;
        }

        let bookRows = allKoleksiBuku;
        if (!bookRows.length) {
          try {
            bookRows = await loadBookRowsFromDatabase();
          } catch (loadError) {
            console.warn("Gagal menyiapkan data buku dashboard:", loadError);
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
            .select("id, full_name, email")
            .in("id", userIds);

          profileMap = new Map(
            (profiles || []).map((profile) => [String(profile.id), profile]),
          );
        }

        tbody.innerHTML = rows
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
            const statusMeta = getBorrowingStatusMeta(item.status);
            const canReview = matchesBorrowingStatuses(item.status, [
              "menunggu",
              "pending",
            ]);

            return `
              <tr>
                <td>${escapeHtml(namaAnggota)}</td>
                <td>${escapeHtml(judulBuku)}</td>
                <td>
                  <span class="badge ${statusMeta.className}">${statusMeta.label}</span>
                </td>
                <td>
                  ${
                    canReview
                      ? `
                        <button
                          class="btn btn-success btn-sm"
                          onclick="approveAction('${escapeHtml(item.id)}')"
                        >
                          ✓
                        </button>
                        <button
                          class="btn btn-danger btn-sm"
                          onclick="rejectAction('${escapeHtml(item.id)}')"
                        >
                          ✗
                        </button>
                      `
                      : '<span style="color: var(--text-muted); font-size: 13px">—</span>'
                  }
                </td>
              </tr>
            `;
          })
          .join("");
      }

function setBookModalMode(mode) {
        const modalTitle = document.querySelector(
          "#modalTambahBuku .modal-title",
        );
        const saveButton = document.querySelector(
          "#modalTambahBuku .btn.btn-primary",
        );
        if (modalTitle) {
          modalTitle.textContent =
            mode === "edit" ? "✏️ Edit Buku" : "➕ Tambah Buku Baru";
        }
        if (saveButton) {
          saveButton.textContent = mode === "edit" ? "💾 Update" : "💾 Simpan";
        }
      }

      function clearBookForm() {
        document.getElementById("book-judul").value = "";
        document.getElementById("book-penulis").value = "";
        document.getElementById("book-isbn").value = "";
        document.getElementById("book-penerbit").value = "";
        document.getElementById("book-kategori").selectedIndex = 0;
        document.getElementById("book-stok").value = "";
        document.getElementById("book-cover-url").value = "";
        document.getElementById("book-deskripsi").value = "";
      }

      function fillBookForm(book) {
        document.getElementById("book-judul").value = book.judul || "";
        document.getElementById("book-penulis").value = book.penulis || "";
        document.getElementById("book-isbn").value = book.isbn || "";
        document.getElementById("book-penerbit").value = book.penerbit || "";
        document.getElementById("book-stok").value = Number(book.stok) || 0;
        document.getElementById("book-cover-url").value = book.cover_url || "";
        document.getElementById("book-deskripsi").value = book.deskripsi || "";

        const kategoriSelect = document.getElementById("book-kategori");
        const kategoriValue = String(book.kategori || "")
          .trim()
          .toLowerCase();
        const match = Array.from(kategoriSelect.options).find((option) => {
          const optionValue = String(option.value || option.text || "")
            .trim()
            .toLowerCase();
          return optionValue === kategoriValue;
        });
        if (match) {
          kategoriSelect.value = match.value;
        }
      }

      function editBuku(btn) {
        const row = btn.closest("tr");
        const bookId = row?.dataset?.bookId;
        const bookLocalId = row?.dataset?.bookLocalId || row?.dataset?.bookId;
        const bookTable =
          row?.dataset?.bookTable || activeBookTableName || "buku";
        const bookIdColumn = row?.dataset?.bookIdColumn || "id";
        const book = allKoleksiBuku.find(
          (item) =>
            (item.id === bookLocalId || item._dbId === bookId) &&
            item._tableName === bookTable,
        );

        if (!book) {
          showToast("Buku tidak ditemukan untuk diedit.", "warning");
          return;
        }

        editingBookContext = {
          tableName: book._tableName || bookTable,
          dbId: book._dbId || bookId,
          idColumn: book._idColumn || bookIdColumn,
          columns: book._columns || activeBookColumns,
          matchData: book._matchData || {},
        };

        fillBookForm(book);
        setBookModalMode("edit");
        openModal("modalTambahBuku");
      }

      async function hapusBuku(btn) {
        if (!confirm("Hapus buku ini dari koleksi?")) return;

        const row = btn.closest("tr");
        const bookId = row?.dataset?.bookId;
        const bookLocalId = row?.dataset?.bookLocalId || row?.dataset?.bookId;
        const bookTable =
          row?.dataset?.bookTable || activeBookTableName || "buku";
        const bookIdColumn = row?.dataset?.bookIdColumn || "id";
        const book = allKoleksiBuku.find(
          (item) =>
            (item.id === bookLocalId || item._dbId === bookId) &&
            item._tableName === bookTable,
        );
        const dbId = book?._dbId || bookId || "";

        if (dbId) {
          const { error } = await supabaseClient
            .from(bookTable)
            .delete()
            .eq(bookIdColumn, dbId);
          if (error) {
            showToast("Gagal menghapus buku: " + error.message, "danger");
            return;
          }
        } else if (book?._matchData && Object.keys(book._matchData).length) {
          const { error } = await supabaseClient
            .from(bookTable)
            .delete()
            .match(book._matchData);
          if (error) {
            showToast("Gagal menghapus buku: " + error.message, "danger");
            return;
          }
        } else {
          showToast(
            "Buku ini tidak punya kolom ID, jadi belum bisa dihapus dari web.",
            "warning",
          );
          return;
        }

        localStorage.setItem(
          "literasea_books_updated",
          JSON.stringify({
            ts: Date.now(),
            source: "admin-delete",
          }),
        );

        if (row) {
          row.style.opacity = "0";
          row.style.transition = ".3s";
          setTimeout(() => row.remove(), 300);
        }

        loadDashboardStats();
        loadKoleksiBuku();
        renderSemuaBuku();
        showToast("🗑️ Buku berhasil dihapus!", "danger");
      }
      /*
      function simpanBukuLegacy() {
        showToast("💾 Buku berhasil disimpan!", "success");
        closeModal("modalTambahBuku");
      }

      */
      async function simpanBuku() {
        const judul = document.getElementById("book-judul").value.trim();
        const penulis = document.getElementById("book-penulis").value.trim();
        const isbn = document.getElementById("book-isbn").value.trim();
        const penerbit = document.getElementById("book-penerbit").value.trim();
        const kategori = document.getElementById("book-kategori").value.trim();
        const stok = Math.max(
          0,
          parseInt(document.getElementById("book-stok").value || "0", 10) || 0,
        );
        const cover_url = normalizeBookCoverUrl(
          document.getElementById("book-cover-url").value,
        );
        const deskripsi = document
          .getElementById("book-deskripsi")
          .value.trim();

        if (!judul || !penulis || !kategori) {
          showToast("Lengkapi judul, penulis, dan kategori dulu.", "warning");
          return;
        }

        const accessibleCoverUrl = cover_url
          ? await resolveManualBookCoverInputUrl(cover_url)
          : "";
        if (cover_url && !accessibleCoverUrl) {
          showToast(getManualBookCoverInputErrorMessage(cover_url), "warning");
          return;
        }

        const isEditing = Boolean(editingBookContext);
        const { error } = await insertBookToDatabase(
          {
            judul,
            penulis,
            isbn,
            penerbit,
            kategori,
            stok,
            cover_url: accessibleCoverUrl || cover_url,
            deskripsi,
          },
          editingBookContext || {},
        );

        if (error) {
          showToast(
            `Gagal ${isEditing ? "mengubah" : "menyimpan"} buku: ` +
              error.message,
            "danger",
          );
          return;
        }

        localStorage.setItem(
          "literasea_books_updated",
          JSON.stringify({
            ts: Date.now(),
            source: isEditing ? "admin-update" : "admin",
          }),
        );
        editingBookContext = null;
        loadDashboardStats();
        loadKoleksiBuku();
        renderSemuaBuku();

        showToast(
          isEditing
            ? "Buku berhasil diupdate di database!"
            : "Buku berhasil disimpan ke database!",
          "success",
        );
        closeModal("modalTambahBuku");
        clearBookForm();
        setBookModalMode("add");
      }

function filterTable(input) {
        const searchValue = (
          input?.value ||
          document.getElementById("book-search-input")?.value ||
          ""
        )
          .trim()
          .toLowerCase();
        const categoryValue =
          document
            .getElementById("book-category-filter")
            ?.value?.trim()
            .toLowerCase() || "";

        document.querySelectorAll("#tabelBuku tbody tr").forEach((row) => {
          const rowText = row.textContent.toLowerCase();
          const rowCategory =
            row.dataset.bookCategory?.toLowerCase() ||
            row.querySelector("td:nth-child(3)")?.textContent?.toLowerCase() ||
            "";
          const matchesSearch = !searchValue || rowText.includes(searchValue);
          const matchesCategory =
            !categoryValue ||
            categoryValue === "semua kategori" ||
            rowCategory.includes(categoryValue);

          row.style.display = matchesSearch && matchesCategory ? "" : "none";
        });
      }
