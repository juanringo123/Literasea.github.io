// ====== CHAT ======
      let helpdeskMessages = [];

      function normalizeHelpdeskMessage(row, sourceTable) {
        const senderRole = String(row?.sender_role || row?.pengirim || "")
          .trim()
          .toLowerCase();

        return {
          id:
            row?.id ||
            `${sourceTable}-${row?.user_id || "unknown"}-${row?.created_at || Date.now()}`,
          user_id: String(row?.user_id || "").trim(),
          user_name: String(row?.user_name || row?.nama_pengguna || "").trim(),
          user_email: String(row?.user_email || row?.email || "").trim(),
          user_photo: String(
            row?.user_photo ||
              row?.foto_url ||
              row?.foto ||
              row?.photo_url ||
              row?.avatar_url ||
              "",
          ).trim(),
          sender_role: senderRole === "admin" ? "admin" : "user",
          admin_id: row?.admin_id ? String(row.admin_id).trim() : "",
          admin_name: String(row?.admin_name || "").trim(),
          message: String(row?.message || row?.pesan || "").trim(),
          read_at_admin: row?.read_at_admin || null,
          read_at_user: row?.read_at_user || null,
          created_at: row?.created_at || new Date().toISOString(),
          _sourceTable: sourceTable,
        };
      }

      function getInitials(value) {
        const words = String(value || "Pengguna")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        if (!words.length) return "U";
        return words
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase();
      }

      function renderChatAvatar(source, label, extraClass = "") {
        const cleanSource = String(source || "").trim();
        const safeLabel = escapeHtml(label || "Pengguna");
        const className = `chat-avatar ${extraClass}`.trim();
        if (cleanSource) {
          return `<div class="${className}"><img src="${escapeHtml(cleanSource)}" alt="${safeLabel}" /></div>`;
        }
        return `<div class="${className}" aria-hidden="true"><span>${escapeHtml(getInitials(label))}</span></div>`;
      }

      function getHelpdeskUserPhoto(message = null) {
        return getMemberPhotoSource() || message?.user_photo || currentUser?.photo || "";
      }

      function fillChatAvatarElement(avatarEl, source, label) {
        if (!avatarEl) return;
        const cleanSource = String(source || "").trim();
        avatarEl.innerHTML = "";
        if (cleanSource) {
          const img = document.createElement("img");
          img.src = cleanSource;
          img.alt = label || "Foto profil";
          avatarEl.appendChild(img);
          return;
        }

        const span = document.createElement("span");
        span.textContent = getInitials(label);
        avatarEl.appendChild(span);
      }

      function decorateHelpdeskAvatars() {
        const chatBody = document.getElementById("chat-body");
        if (!chatBody) return;

        chatBody.querySelectorAll(".chat-message").forEach((messageEl) => {
          const isUser = messageEl.classList.contains("user");
          const label = isUser ? currentUser?.name || "Pengguna" : "Admin Literasea";
          const source = isUser ? getHelpdeskUserPhoto() : "";
          let avatarEl = messageEl.querySelector(".chat-avatar");

          if (!avatarEl) {
            const stack = document.createElement("div");
            stack.className = "chat-message-stack";

            while (messageEl.firstChild) {
              stack.appendChild(messageEl.firstChild);
            }

            const row = document.createElement("div");
            row.className = "chat-message-row";
            avatarEl = document.createElement("div");
            avatarEl.className = `chat-avatar${isUser ? "" : " admin-avatar"}`;
            row.appendChild(avatarEl);
            row.appendChild(stack);
            messageEl.appendChild(row);
          }

          fillChatAvatarElement(avatarEl, source, label);
        });
      }

      async function fetchUserHelpdeskMessages(userId) {
        const mergedMessages = [];
        const seenKeys = new Set();
        const errors = [];
        let successCount = 0;

        for (const tableName of HELPDESK_TABLE_CANDIDATES) {
          const { data, error } = await supabaseClient
            .from(tableName)
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: true });

          if (error) {
            errors.push(error);
            continue;
          }

          successCount += 1;
          (data || []).forEach((row) => {
            const normalizedMessage = normalizeHelpdeskMessage(row, tableName);
            const dedupeKey = normalizedMessage.id
              ? `${tableName}:${normalizedMessage.id}`
              : `${tableName}:${normalizedMessage.user_id}:${normalizedMessage.sender_role}:${normalizedMessage.created_at}:${normalizedMessage.message}`;

            if (seenKeys.has(dedupeKey)) return;
            seenKeys.add(dedupeKey);
            mergedMessages.push(normalizedMessage);
          });
        }

        if (!successCount) {
          return {
            data: [],
            error: errors[0] || new Error("Tabel helpdesk tidak ditemukan."),
          };
        }

        mergedMessages.sort(
          (left, right) =>
            new Date(left.created_at || 0).getTime() -
            new Date(right.created_at || 0).getTime(),
        );

        return { data: mergedMessages, error: null };
      }

      async function markHelpdeskRepliesRead(messages) {
        const unreadReplyMessages = (Array.isArray(messages) ? messages : []).filter(
          (message) => message.sender_role === "admin" && !message.read_at_user,
        );

        if (!unreadReplyMessages.length) return null;

        const readAt = new Date().toISOString();
        const idsByTable = unreadReplyMessages.reduce((map, message) => {
          const sourceTable = message._sourceTable || "helpdesk_messages";
          if (!map.has(sourceTable)) map.set(sourceTable, []);
          map.get(sourceTable).push(message.id);
          return map;
        }, new Map());

        const modernIds = idsByTable.get("helpdesk_messages") || [];
        if (modernIds.length) {
          await supabaseClient
            .from("helpdesk_messages")
            .update({ read_at_user: readAt })
            .in("id", modernIds);
        }

        return readAt;
      }

      async function insertHelpdeskUserMessage(payload) {
        const modernResponse = await supabaseClient
          .from("helpdesk_messages")
          .insert(payload);

        if (!modernResponse.error) return modernResponse;

        if (
          payload.user_photo &&
          /user_photo|schema cache|column/i.test(modernResponse.error.message || "")
        ) {
          const retryPayload = { ...payload };
          delete retryPayload.user_photo;
          const retryResponse = await supabaseClient
            .from("helpdesk_messages")
            .insert(retryPayload);
          if (!retryResponse.error) return retryResponse;
        }

        const legacyPayload = {
          user_id: payload.user_id,
          nama_pengguna: payload.user_name,
          pengirim: payload.sender_role,
          pesan: payload.message,
          user_photo: payload.user_photo || null,
        };
        const legacyResponse = await supabaseClient
          .from("helpdesk_chat")
          .insert(legacyPayload);

        if (
          legacyResponse.error &&
          /user_photo|schema cache|column/i.test(
            legacyResponse.error.message || "",
          )
        ) {
          delete legacyPayload.user_photo;
          return supabaseClient.from("helpdesk_chat").insert(legacyPayload);
        }

        return legacyResponse;
      }

      function setWelcomeTime() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, "0");
        const m = String(now.getMinutes()).padStart(2, "0");
        document.getElementById("welcome-time").textContent = `⏰ ${h}:${m}`;
      }

      function renderHelpdeskMessages() {
        const chatBody = document.getElementById("chat-body");
        if (!chatBody) return;

        if (!helpdeskMessages.length) {
          chatBody.innerHTML = `
            <div class="chat-intro">
              <div class="chat-intro-header">
                <div class="chat-intro-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <h3>Layanan Chat Helpdesk</h3>
                  <p>Anda dapat menanyakan tentang:</p>
                </div>
              </div>
              <ul>
                <li>Kesulitan akses akun atau login</li>
                <li>Perpanjangan masa peminjaman buku</li>
                <li>Informasi denda dan pembayaran</li>
                <li>Pertanyaan umum tentang perpustakaan</li>
              </ul>
            </div>
            <div class="date-divider"><span>Hari ini</span></div>
            <div class="chat-message admin" id="welcome-msg">
              <div class="msg-sender">Admin Literasea</div>
              <div class="msg-bubble admin-bubble">Halo! Selamat datang di Helpdesk LITERASEA. Ada yang bisa kami bantu?</div>
              <div class="msg-time" id="welcome-time">⏰ --:--</div>
            </div>
          `;
          setWelcomeTime();
          decorateHelpdeskAvatars();
          return;
        }

        const groupedByDay = new Map();
        helpdeskMessages.forEach((message) => {
          const dateKey = new Date(message.created_at || Date.now()).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          if (!groupedByDay.has(dateKey)) groupedByDay.set(dateKey, []);
          groupedByDay.get(dateKey).push(message);
        });

        const sections = [];
        groupedByDay.forEach((messages, dateKey) => {
          sections.push(
            `<div class="date-divider"><span>${escapeHtml(dateKey)}</span></div>` +
              messages
                .map((message) => {
                  const time = new Date(message.created_at || Date.now()).toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                if (message.sender_role === "admin") {
                return `
                  <div class="chat-message admin">
                    <div class="msg-sender">Admin Literasea</div>
                    <div class="msg-bubble admin-bubble">${escapeHtml(message.message)}</div>
                    <div class="msg-time">⏰ ${time}</div>
                  </div>
                `;
              }

              return `
                <div class="chat-message user">
                  <div class="msg-bubble user-bubble">${escapeHtml(message.message)}</div>
                  <div class="msg-time">⏰ ${time}</div>
                </div>
              `;
                })
                .join(""),
          );
        });

        chatBody.innerHTML = sections.join("");
        decorateHelpdeskAvatars();
        chatBody.scrollTop = chatBody.scrollHeight;
      }

      function requestHelpdeskRefresh() {
        if (helpdeskRefreshTimer) clearTimeout(helpdeskRefreshTimer);
        helpdeskRefreshTimer = setTimeout(() => {
          helpdeskRefreshTimer = null;
          if (document.getElementById("app")?.classList.contains("active")) {
            loadHelpdeskMessages();
          }
        }, 120);
      }

      async function startHelpdeskRealtimeSync() {
        if (helpdeskRealtimeChannel) return;

        const {
          data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) return;

        helpdeskRealtimeChannel = supabaseClient
          .channel(`helpdesk-user-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "helpdesk_messages",
              filter: `user_id=eq.${user.id}`,
            },
            requestHelpdeskRefresh,
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "helpdesk_chat",
              filter: `user_id=eq.${user.id}`,
            },
            requestHelpdeskRefresh,
          )
          .subscribe();
      }

      async function fetchUserPeminjamanRows(userId) {
        const orderColumns = ["created_at", "tanggal_pinjam", "tanggal_kembali"];
        let lastError = null;

        for (const orderColumn of orderColumns) {
          const response = await supabaseClient
            .from("peminjaman")
            .select("*")
            .eq("user_id", userId)
            .order(orderColumn, { ascending: false });

          if (!response.error) return response;
          lastError = response.error;
        }

        const fallbackResponse = await supabaseClient
          .from("peminjaman")
          .select("*")
          .eq("user_id", userId);

        return {
          data: fallbackResponse.data,
          error: fallbackResponse.error || lastError,
        };
      }

      async function loadHelpdeskMessages() {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
          helpdeskMessages = [];
          renderHelpdeskMessages();
          return;
        }

        const { data, error } = await fetchUserHelpdeskMessages(user.id);

        if (error) {
          showToast("Gagal memuat helpdesk: " + error.message);
          return;
        }

        helpdeskMessages = data || [];
        const readAt = await markHelpdeskRepliesRead(helpdeskMessages);

        if (readAt) {
          helpdeskMessages = helpdeskMessages.map((message) =>
            message.sender_role === "admin" && !message.read_at_user
              ? { ...message, read_at_user: readAt }
              : message,
          );
        }

        renderHelpdeskMessages();
      }

      async function sendChatLegacy() {
        const input = document.getElementById("chat-input");
        const msg = input.value.trim();
        if (!msg) return;

        const chatBody = document.getElementById("chat-body");
        const now = new Date();
        const t = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        // User message
        const userDiv = document.createElement("div");
        userDiv.className = "chat-message user";
        userDiv.innerHTML = `
    <div class="msg-bubble user-bubble">${escapeHtml(msg)}</div>
    <div class="msg-time user-time">⏰ ${t}</div>
  `;
        chatBody.appendChild(userDiv);

        input.value = "";
        chatBody.scrollTop = chatBody.scrollHeight;

        // Auto-reply
        setTimeout(() => {
          const adminDiv = document.createElement("div");
          adminDiv.className = "chat-message admin";
          adminDiv.innerHTML = `
      <div class="msg-sender">Admin Literasea</div>
      <div class="msg-bubble admin-bubble">Terima kasih pesannya! Kami akan segera menindaklanjuti pertanyaan Anda. Mohon tunggu balasan dalam 1x24 jam. 😊</div>
      <div class="msg-time">⏰ ${t}</div>
    `;
          chatBody.appendChild(adminDiv);
          chatBody.scrollTop = chatBody.scrollHeight;
        }, 1200);
      }
      async function sendChat() {
        const input = document.getElementById("chat-input");
        const msg = input.value.trim();
        if (!msg) return;

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

        const { error } = await insertHelpdeskUserMessage({
          user_id: user.id,
          user_name:
            profile?.full_name || currentUser?.name || user.email.split("@")[0],
          user_email: profile?.email || user.email,
          user_photo: getHelpdeskUserPhoto() || getProfilePhoto(profile),
          sender_role: "user",
          message: msg,
        });

        if (error) {
          showToast("Gagal mengirim pesan helpdesk: " + error.message);
          return;
        }

        input.value = "";
        await loadHelpdeskMessages();
      }
      // ===== SARAN BUKU =====
      async function kirimSaran() {
        const judul = document.getElementById("saran-judul").value.trim();
        const penulis = document.getElementById("saran-penulis").value.trim();
        const alasan = document.getElementById("saran-alasan").value.trim();

        if (!judul) {
          showToast("Judul buku wajib diisi!");
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
          full_name: user.user_metadata?.full_name || user.email.split("@")[0],
        });

        const { error } = await supabaseClient.from("masukan_buku").insert({
          user_id: user.id,
          nama_user: profile?.full_name || user.email,
          judul_buku: judul,
          penulis: penulis || null,
          alasan: alasan || null,
        });

        if (error) {
          showToast("Gagal mengirim saran, coba lagi");
          return;
        }

        showToast("✅ Saran berhasil dikirim!");
        document.getElementById("saran-judul").value = "";
        document.getElementById("saran-penulis").value = "";
        document.getElementById("saran-alasan").value = "";
        loadRiwayatSaran();
      }

      async function loadRiwayatSaran() {
        const container = document.getElementById("list-saran");
        if (!container) return;

        const { data, error } = await supabaseClient
          .from("masukan_buku")
          .select("*")
          .order("created_at", { ascending: false });

        if (error || !data || data.length === 0) {
          container.innerHTML =
            '<p style="color:var(--text-muted); font-size:13px;">Belum ada saran yang dikirim.</p>';
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
    <div style="padding:12px; border:1px solid var(--border); border-radius:10px; background:var(--bg);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span style="font-weight:700; font-size:14px;">${escapeHtml(d.judul_buku)}</span>
        <span style="font-size:11px; font-weight:700; color:${badgeColor[d.status] || "#64748b"};">${badgeLabel[d.status] || d.status}</span>
      </div>
      ${d.penulis ? `<div style="font-size:12px; color:var(--text-muted);">✍️ ${escapeHtml(d.penulis)}</div>` : ""}
      ${d.catatan_admin ? `<div style="font-size:12px; margin-top:6px; padding:6px 8px; background:var(--primary-light); border-radius:6px; color:var(--primary-dark);">💬 Admin: ${escapeHtml(d.catatan_admin)}</div>` : ""}
      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${new Date(d.created_at).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</div>
    </div>
  `,
          )
          .join("");
      }
