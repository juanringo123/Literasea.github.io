async function loadMembers() {
        const memberList = document.getElementById("memberList");
        if (!memberList) return;

        memberList.innerHTML =
          '<div class="member-empty">Memuat data anggota...</div>';

        const [
          { data: profiles, error: profilesError },
          { data: borrowings, error: borrowingsError },
        ] = await Promise.all([
          supabaseClient
            .from("profiles")
            .select("id, full_name, email, phone, member_id, created_at")
            .order("created_at", { ascending: false }),
          supabaseClient.from("peminjaman").select("user_id, status"),
        ]);

        if (profilesError) {
          memberList.innerHTML =
            '<div class="member-empty">Gagal memuat data anggota.</div>';
          showToast("Gagal memuat anggota: " + profilesError.message, "danger");
          return;
        }

        if (borrowingsError) {
          showToast(
            "Data peminjaman belum lengkap: " + borrowingsError.message,
            "warning",
          );
        }

        allMemberProfiles = profiles || [];
        memberBorrowCounts = new Map();
        (borrowings || []).forEach((row) => {
          if (row.status === "dipinjam" && row.user_id) {
            memberBorrowCounts.set(
              row.user_id,
              (memberBorrowCounts.get(row.user_id) || 0) + 1,
            );
          }
        });

        renderMemberList();
      }

      function renderMemberList() {
        const memberList = document.getElementById("memberList");
        if (!memberList) return;

        const query = document
          .getElementById("member-search")
          ?.value.trim()
          .toLowerCase();

        const filteredMembers = allMemberProfiles.filter((member) => {
          if (!query) return true;
          const searchable = [
            member.full_name,
            member.email,
            member.phone,
            member.member_id,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return searchable.includes(query);
        });

        if (!filteredMembers.length) {
          memberList.innerHTML =
            '<div class="member-empty">Tidak ada anggota yang cocok.</div>';
          return;
        }

        memberList.innerHTML = filteredMembers
          .map((member) => {
            const memberName = member.full_name || member.email || "-";
            const initials = memberName.trim().charAt(0).toUpperCase() || "?";
            const activeBooks = memberBorrowCounts.get(member.id) || 0;
            const joinDate = formatMemberDate(member.created_at);

            return `
              <div class="member-card">
                <div class="member-avatar" style="background:${getMemberAvatarStyle(memberName)}">${escapeHtml(initials)}</div>
                <div class="member-main">
                  <div class="member-name">${escapeHtml(memberName)}</div>
                  <div class="member-meta">${escapeHtml(member.email || "-")} · ID: ${escapeHtml(member.member_id || "-")}</div>
                  <div class="member-info">📚 ${activeBooks} buku aktif · 🗓️ Bergabung ${joinDate}${member.phone ? ` · 📱 ${escapeHtml(member.phone)}` : ""}</div>
                </div>
                <div class="member-actions">
                  <span class="badge badge-green">Terdaftar</span>
                  <div class="member-actions-row">
                    <button class="btn btn-outline btn-sm" onclick="lihatDetailAnggota('${escapeHtml(member.id)}')">👁️ Detail</button>
                  </div>
                </div>
              </div>
            `;
          })
          .join("");
      }

      function lihatDetailAnggota(memberId) {
        const member = allMemberProfiles.find((item) => item.id === memberId);
        if (!member) {
          showToast("Anggota tidak ditemukan.", "warning");
          return;
        }

        const activeBooks = memberBorrowCounts.get(member.id) || 0;
        alert(
          `👤 Detail Anggota:\n\n` +
            `Nama: ${member.full_name || "-"}\n` +
            `Email: ${member.email || "-"}\n` +
            `ID Anggota: ${member.member_id || "-"}\n` +
            `Telepon: ${member.phone || "-"}\n` +
            `Buku aktif: ${activeBooks}\n` +
            `Bergabung: ${formatMemberDate(member.created_at)}`,
        );
      }
