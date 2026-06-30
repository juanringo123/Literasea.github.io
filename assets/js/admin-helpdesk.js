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

      function resolveHelpdeskProfile(entryOrUserId) {
        const userId =
          typeof entryOrUserId === "string"
            ? entryOrUserId
            : entryOrUserId?.user_id;
        return userId ? helpdeskProfileMap.get(userId) || null : null;
      }

      function resolveHelpdeskUserName(entry) {
        const profile = resolveHelpdeskProfile(entry);
        const rawName = String(entry?.user_name || "").trim();
        const rawEmail = String(entry?.user_email || "").trim();
        const rawUserId = String(entry?.user_id || "")
          .trim()
          .toLowerCase();

        if (profile?.full_name) return profile.full_name;
        if (
          rawName &&
          !looksLikeUuid(rawName) &&
          rawName.toLowerCase() !== rawUserId
        ) {
          return rawName;
        }
        if (profile?.email) return profile.email;
        if (rawEmail) return rawEmail;
        return "Pengguna";
      }

      function resolveHelpdeskUserEmail(entry) {
        const profile = resolveHelpdeskProfile(entry);
        return String(entry?.user_email || profile?.email || "").trim();
      }

      function getProfilePhoto(profile) {
        return String(
          profile?.foto_url ||
            profile?.foto ||
            profile?.photo_url ||
            profile?.avatar_url ||
            profile?.image_url ||
            "",
        ).trim();
      }

      function getStoredMemberPhotoByProfile(profile, entry = null) {
        const candidates = [
          profile?.email,
          profile?.member_id,
          profile?.id,
          entry?.user_email,
          entry?.user_name,
          entry?.user_id,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean);

        for (const candidate of candidates) {
          const stored = localStorage.getItem(
            `literasea_member_photo_${encodeURIComponent(candidate)}`,
          );
          if (stored) return stored;
        }

        return "";
      }

      function getHelpdeskInitials(value) {
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

      function resolveHelpdeskUserPhoto(entry) {
        const profile = resolveHelpdeskProfile(entry);
        return String(
          getProfilePhoto(profile) ||
            entry?.user_photo ||
            entry?.foto_url ||
            entry?.foto ||
            entry?.photo_url ||
            entry?.avatar_url ||
            getStoredMemberPhotoByProfile(profile, entry) ||
            "",
        ).trim();
      }

      function renderHelpdeskAvatar(entry, label) {
        const source = resolveHelpdeskUserPhoto(entry);
        const safeLabel = escapeHtml(label || resolveHelpdeskUserName(entry));
        if (source) {
          return `<div class="helpdesk-avatar"><img src="${escapeHtml(
            source,
          )}" alt="${safeLabel}" onerror="this.remove(); this.parentElement.innerHTML='<span>${escapeHtml(
            getHelpdeskInitials(label || resolveHelpdeskUserName(entry)),
          )}</span>'" /></div>`;
        }
        return `<div class="helpdesk-avatar" aria-hidden="true"><span>${escapeHtml(
          getHelpdeskInitials(label || resolveHelpdeskUserName(entry)),
        )}</span></div>`;
      }

      async function hydrateHelpdeskProfiles(messages) {
        const userIds = [
          ...new Set(
            (Array.isArray(messages) ? messages : [])
              .map((message) => String(message?.user_id || "").trim())
              .filter(Boolean),
          ),
        ];

        if (!userIds.length) {
          helpdeskProfileMap = new Map();
          return;
        }

        const { data, error } = await supabaseClient
          .from("profiles")
          .select("*")
          .in("id", userIds);

        if (error) return;

        helpdeskProfileMap = new Map(
          (data || []).map((profile) => [String(profile.id), profile]),
        );
      }

      async function fetchHelpdeskMessages() {
        const mergedMessages = [];
        const seenKeys = new Set();
        const errors = [];
        let successCount = 0;

        for (const tableName of HELPDESK_TABLE_CANDIDATES) {
          const { data, error } = await supabaseClient
            .from(tableName)
            .select("*")
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

        await hydrateHelpdeskProfiles(mergedMessages);
        return { data: mergedMessages, error: null };
      }

      async function insertAdminHelpdeskMessage(payload) {
        const modernResponse = await supabaseClient
          .from("helpdesk_messages")
          .insert(payload);

        if (!modernResponse.error) return modernResponse;

        return supabaseClient.from("helpdesk_chat").insert({
          user_id: payload.user_id,
          nama_pengguna: payload.user_name,
          pengirim: payload.sender_role,
          pesan: payload.message,
        });
      }

      async function syncHelpdeskState() {
        const { data, error } = await fetchHelpdeskMessages();
        if (error) {
          helpdeskMessages = [];
          helpdeskThreads = [];
          return { error };
        }

        helpdeskMessages = data || [];
        helpdeskThreads = buildHelpdeskThreads(helpdeskMessages);

        if (
          activeHelpdeskThreadUserId &&
          !helpdeskThreads.some(
            (thread) => thread.user_id === activeHelpdeskThreadUserId,
          )
        ) {
          activeHelpdeskThreadUserId = null;
        }

        if (!activeHelpdeskThreadUserId) {
          activeHelpdeskThreadUserId = helpdeskThreads[0]?.user_id || null;
        }

        return { error: null };
      }

      function updateHelpdeskUnreadIndicators() {
        const unreadTotal = helpdeskThreads.reduce(
          (total, thread) => total + (thread.unread_count || 0),
          0,
        );

        const sidebarBadge = document.getElementById("sidebarHelpdeskUnread");
        if (sidebarBadge) {
          sidebarBadge.textContent = String(unreadTotal);
          sidebarBadge.style.display = unreadTotal > 0 ? "inline-flex" : "none";
        }

        const pageBadge = document.getElementById("helpdeskUnreadBadge");
        if (pageBadge) {
          pageBadge.textContent = `${unreadTotal} Belum Dibaca`;
        }
      }

      function buildHelpdeskThreads(messages) {
        const threadMap = new Map();

        messages.forEach((message) => {
          const userId = message.user_id;
          if (!userId) return;

          const existing = threadMap.get(userId) || {
            user_id: userId,
            user_name: resolveHelpdeskUserName(message),
            user_email: resolveHelpdeskUserEmail(message),
            user_photo: resolveHelpdeskUserPhoto(message),
            messages: [],
            unread_count: 0,
            last_message: "",
            last_message_at: null,
          };

          existing.messages.push(message);
          existing.user_name =
            resolveHelpdeskUserName(message) || existing.user_name;
          existing.user_email =
            resolveHelpdeskUserEmail(message) || existing.user_email;
          existing.user_photo =
            resolveHelpdeskUserPhoto(message) || existing.user_photo;

          if (
            !existing.last_message_at ||
            new Date(message.created_at || Date.now()) >
              new Date(existing.last_message_at)
          ) {
            existing.last_message = message.message || "";
            existing.last_message_at = message.created_at || null;
          }

          if (message.sender_role === "user" && !message.read_at_admin) {
            existing.unread_count += 1;
          }

          threadMap.set(userId, existing);
        });

        return [...threadMap.values()]
          .map((thread) => ({
            ...thread,
            user_name: resolveHelpdeskUserName(thread),
            user_email: resolveHelpdeskUserEmail(thread),
            user_photo: resolveHelpdeskUserPhoto(thread),
          }))
          .sort((left, right) => {
            const leftDate = new Date(left.last_message_at || 0).getTime();
            const rightDate = new Date(right.last_message_at || 0).getTime();
            return rightDate - leftDate;
          });
      }

      function renderHelpdeskList() {
        const list = document.querySelector("#page-helpdeskChat .chat-list");
        if (!list) return;

        if (!helpdeskThreads.length) {
          list.innerHTML =
            '<div style="padding:20px; color:#94a3b8; font-size:13px;">Belum ada chat helpdesk.</div>';
          updateHelpdeskUnreadIndicators();
          return;
        }

        updateHelpdeskUnreadIndicators();

        list.innerHTML = helpdeskThreads
          .map((thread) => {
            const isActive = thread.user_id === activeHelpdeskThreadUserId;
            return `
              <div
                class="chat-item${isActive ? " active" : ""}"
                data-user-id="${escapeHtml(thread.user_id)}"
                data-user-name="${escapeHtml(thread.user_name)}"
                data-user-email="${escapeHtml(thread.user_email || "")}"
                onclick="selectChat(this)"
              >
                <div class="chat-item-content">
                  ${renderHelpdeskAvatar(thread, thread.user_name)}
                  <div class="chat-item-main">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                      <div class="chat-item-name">${escapeHtml(thread.user_name)}</div>
                      ${thread.unread_count > 0 ? `<span class="chat-unread">${thread.unread_count}</span>` : ""}
                    </div>
                    <div class="chat-item-preview">${escapeHtml(thread.last_message || "-")}</div>
                    <div class="chat-item-time">${formatHelpdeskTime(thread.last_message_at)}</div>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }

      function renderDashboardHelpdeskList() {
        const container = document.getElementById("dashboardHelpdeskList");
        if (!container) return;

        if (!helpdeskThreads.length) {
          container.innerHTML =
            '<div style="padding:12px;color:#94a3b8">Belum ada chat</div>';
          return;
        }

        container.innerHTML = helpdeskThreads
          .slice(0, 5)
          .map((thread) => {
            const isActive = thread.user_id === activeHelpdeskThreadUserId;
            return `
              <div
                class="chat-item${isActive ? " active" : ""}"
                onclick="openHelpdeskThread('${escapeHtml(thread.user_id)}')"
                style="cursor:pointer"
              >
                <div class="chat-item-content">
                  ${renderHelpdeskAvatar(thread, thread.user_name)}
                  <div class="chat-item-main">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
                      <div class="chat-item-name">${escapeHtml(thread.user_name)}</div>
                      ${thread.unread_count > 0 ? `<span class="chat-unread">${thread.unread_count}</span>` : ""}
                    </div>
                    <div class="chat-item-preview">${escapeHtml(thread.last_message || "-")}</div>
                    <div class="chat-item-time">${formatHelpdeskTime(thread.last_message_at)}</div>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }

      function openHelpdeskThread(userId) {
        if (!userId) return;
        activeHelpdeskThreadUserId = userId;
        showPage("helpdeskChat");
      }

      function renderHelpdeskConversation() {
        const windowName = document.getElementById("chatWindowName");
        const messagesContainer = document.getElementById("chatMessages");
        if (!messagesContainer || !windowName) return;

        const thread = helpdeskThreads.find(
          (item) => item.user_id === activeHelpdeskThreadUserId,
        );

        if (!thread) {
          windowName.textContent = "Pilih percakapan";
          messagesContainer.innerHTML =
            '<div style="padding:18px; color:#94a3b8;">Pilih thread di sebelah kiri untuk melihat percakapan.</div>';
          return;
        }

        windowName.textContent = thread.user_name || "Pengguna";
        const messages = [...thread.messages].sort(
          (left, right) =>
            new Date(left.created_at || 0).getTime() -
            new Date(right.created_at || 0).getTime(),
        );

        messagesContainer.innerHTML = messages
          .map((message) => {
            if (message.sender_role === "admin") {
              return `
                <div class="msg msg-admin">
                  <div class="msg-bubble">${escapeHtml(message.message)}</div>
                  <div class="msg-time">${formatHelpdeskTime(message.created_at)}</div>
                </div>
              `;
            }

            return `
              <div class="msg msg-user">
                ${renderHelpdeskAvatar(message, resolveHelpdeskUserName(message) || thread.user_name || "Pengguna")}
                <div class="msg-content">
                  <div class="msg-name">${escapeHtml(resolveHelpdeskUserName(message) || thread.user_name || "Pengguna")}</div>
                  <div class="msg-bubble">${escapeHtml(message.message)}</div>
                  <div class="msg-time">${formatHelpdeskTime(message.created_at)}</div>
                </div>
              </div>
            `;
          })
          .join("");

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      async function markHelpdeskThreadRead(userId) {
        if (!userId) return;

        const unreadMessages = helpdeskMessages.filter(
          (message) =>
            message.user_id === userId &&
            message.sender_role === "user" &&
            !message.read_at_admin,
        );

        if (!unreadMessages.length) return;

        const readAt = new Date().toISOString();
        const idsByTable = unreadMessages.reduce((map, message) => {
          const sourceTable = message._sourceTable || "helpdesk_messages";
          if (!map.has(sourceTable)) map.set(sourceTable, []);
          map.get(sourceTable).push(message.id);
          return map;
        }, new Map());

        const modernIds = idsByTable.get("helpdesk_messages") || [];
        if (modernIds.length) {
          await supabaseClient
            .from("helpdesk_messages")
            .update({ read_at_admin: readAt })
            .in("id", modernIds);
        }

        helpdeskMessages = helpdeskMessages.map((message) =>
          message.user_id === userId &&
          message.sender_role === "user" &&
          !message.read_at_admin
            ? { ...message, read_at_admin: readAt }
            : message,
        );
        helpdeskThreads = buildHelpdeskThreads(helpdeskMessages);
        updateHelpdeskUnreadIndicators();
        renderDashboardHelpdeskList();
      }

      async function loadHelpdeskChat() {
        const list = document.querySelector("#page-helpdeskChat .chat-list");
        const messagesContainer = document.getElementById("chatMessages");
        if (!list || !messagesContainer) return;

        list.innerHTML =
          '<div style="padding:20px; color:#94a3b8; font-size:13px;">Memuat chat helpdesk...</div>';
        messagesContainer.innerHTML =
          '<div style="padding:18px; color:#94a3b8;">Memuat percakapan...</div>';

        const { error } = await syncHelpdeskState();

        if (error) {
          list.innerHTML =
            '<div style="padding:20px; color:#ef4444; font-size:13px;">Gagal memuat chat helpdesk.</div>';
          messagesContainer.innerHTML =
            '<div style="padding:18px; color:#ef4444;">Gagal memuat percakapan.</div>';
          showToast("Gagal memuat helpdesk: " + error.message, "danger");
          return;
        }

        renderHelpdeskList();
        renderHelpdeskConversation();
        renderDashboardHelpdeskList();

        if (activeHelpdeskThreadUserId) {
          await markHelpdeskThreadRead(activeHelpdeskThreadUserId);
          renderHelpdeskList();
          renderHelpdeskConversation();
          renderDashboardHelpdeskList();
        }
      }

      async function selectChat(item, nama) {
        const userId = item?.dataset?.userId;
        if (!userId) {
          showToast("Thread helpdesk belum tersedia.", "warning");
          return;
        }

        activeHelpdeskThreadUserId = userId;
        renderHelpdeskList();
        renderHelpdeskConversation();
        await markHelpdeskThreadRead(userId);
        renderHelpdeskList();
        renderHelpdeskConversation();
        renderDashboardHelpdeskList();
      }

      async function sendChat() {
        const input = document.getElementById("chatInput");
        const msg = input.value.trim();
        if (!msg) return;

        const thread = helpdeskThreads.find(
          (entry) => entry.user_id === activeHelpdeskThreadUserId,
        );
        if (!thread) {
          showToast("Pilih thread chat terlebih dahulu.", "warning");
          return;
        }

        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) {
          showToast("Sesi admin tidak ditemukan.", "danger");
          return;
        }

        const { error } = await insertAdminHelpdeskMessage({
          user_id: thread.user_id,
          user_name: thread.user_name,
          user_email:
            thread.user_email || resolveHelpdeskUserEmail(thread) || null,
          sender_role: "admin",
          admin_id: user.id,
          admin_name: currentUser?.name || user.email,
          message: msg,
          read_at_admin: new Date().toISOString(),
        });

        if (error) {
          showToast("Gagal mengirim balasan: " + error.message, "danger");
          return;
        }

        input.value = "";
        await loadHelpdeskChat();
      }
