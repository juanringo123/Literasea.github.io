function getProfilePhoto(profile) {
        return (
          profile?.foto_url ||
          profile?.foto ||
          profile?.photo_url ||
          profile?.avatar_url ||
          profile?.image_url ||
          ""
        );
      }

      function getMemberPhotoStorageKey() {
        const owner = currentUser?.email || currentUser?.id || "guest";
        return `literasea_member_photo_${encodeURIComponent(owner)}`;
      }

      function getMemberPhotoSource() {
        return localStorage.getItem(getMemberPhotoStorageKey()) || currentUser?.photo || "";
      }

      function setMemberCardPhoto(source) {
        const box = document.getElementById("card-photo-box");
        const img = document.getElementById("card-photo-img");
        const removeBtn = document.getElementById("btn-remove-member-photo");
        if (!box || !img) return;

        if (source) {
          img.src = source;
          img.alt = `Foto ${currentUser?.name || "anggota"}`;
          box.classList.add("has-photo");
          if (removeBtn) removeBtn.style.display = "inline-flex";
          decorateHelpdeskAvatars();
          return;
        }

        img.removeAttribute("src");
        box.classList.remove("has-photo");
        if (removeBtn) removeBtn.style.display = "none";
        decorateHelpdeskAvatars();
      }

      function hydrateMemberCardPhoto() {
        setMemberCardPhoto(getMemberPhotoSource());
      }

      async function syncMemberPhotoToProfile(photoData) {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) return false;

        const photoColumns = ["foto_url", "foto", "photo_url", "avatar_url"];
        for (const column of photoColumns) {
          const { error } = await supabaseClient
            .from("profiles")
            .update({ [column]: photoData || null })
            .eq("id", user.id);

          if (!error) return true;
        }

        return false;
      }

      function handleMemberPhotoUpload(event) {
        const input = event.target;
        const file = input.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
          showToast("File harus berupa gambar.");
          input.value = "";
          return;
        }

        if (file.size > 2 * 1024 * 1024) {
          showToast("Ukuran foto maksimal 2 MB.");
          input.value = "";
          return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const imageData = String(reader.result || "");
            localStorage.setItem(getMemberPhotoStorageKey(), imageData);
            currentUser.photo = imageData;
            setMemberCardPhoto(imageData);
            decorateHelpdeskAvatars();
            await syncMemberPhotoToProfile(imageData).catch((error) =>
              console.warn("Gagal sinkron foto profil:", error),
            );
            showToast("Foto kartu berhasil ditambahkan.");
          } catch (error) {
            console.error("Gagal menyimpan foto kartu:", error);
            showToast("Gagal menyimpan foto. Coba gambar yang lebih kecil.");
          } finally {
            input.value = "";
          }
        };
        reader.onerror = () => {
          showToast("Gagal membaca file foto.");
          input.value = "";
        };
        reader.readAsDataURL(file);
      }

      function removeMemberPhoto() {
        localStorage.removeItem(getMemberPhotoStorageKey());
        if (currentUser) currentUser.photo = "";
        setMemberCardPhoto("");
        syncMemberPhotoToProfile("").catch((error) =>
          console.warn("Gagal sinkron hapus foto profil:", error),
        );
        const input = document.getElementById("member-photo-input");
        if (input) input.value = "";
        showToast("Foto kartu dihapus.");
      }

      function renderMemberBarcode(elementId) {
        const barcodeEl = document.getElementById(elementId);
        if (!barcodeEl) return;
        barcodeEl.innerHTML = "";
        const memberCode = String(currentUser?.id || "LIT-000000");
        for (let i = 0; i < 40; i++) {
          const div = document.createElement("div");
          const charCode = memberCode.charCodeAt(i % memberCode.length) || 49;
          div.style.width = `${(charCode + i) % 3 === 0 ? 3 : (charCode + i) % 2 === 0 ? 2 : 1}px`;
          div.style.height = `${20 + ((charCode + i) % 5) * 2}px`;
          div.style.background = "#1e293b";
          barcodeEl.appendChild(div);
        }
      }

      // ====== MEMBER CARD TOGGLE ======
      function toggleCard(side) {
        const front = document.getElementById("card-front-view");
        const back = document.getElementById("card-back-view");
        const btnD = document.getElementById("btn-depan");
        const btnB = document.getElementById("btn-belakang");

        if (side === "depan") {
          front.classList.remove("hidden");
          back.classList.remove("active");
          btnD.className = "btn btn-primary btn-sm";
          btnB.className = "btn btn-outline btn-sm";
        } else {
          front.classList.add("hidden");
          back.classList.add("active");
          btnD.className = "btn btn-outline btn-sm";
          btnB.className = "btn btn-primary btn-sm";
        }
      }

      // ====== TAB GROUP ======
      function setTab(el, type) {
        const scope = el?.closest(".tab-group");
        (scope ? scope.querySelectorAll(".tab-btn") : document.querySelectorAll(".tab-btn"))
          .forEach((b) => b.classList.remove("active"));
        el.classList.add("active");
      }
