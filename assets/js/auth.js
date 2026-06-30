// ====== AUTH ======
      function showSplash() {
        resetNavigationHistory();
        document.getElementById("login-screen").classList.remove("active");
        document.getElementById("register-screen").classList.remove("active");
        document.getElementById("splash-screen").style.display = "flex";
      }

      function showLogin() {
        document.getElementById("splash-screen").style.display = "none";
        document.getElementById("register-screen").classList.remove("active");
        document.getElementById("login-screen").classList.add("active");
      }

      function showRegister() {
        document.getElementById("splash-screen").style.display = "none";
        document.getElementById("login-screen").classList.remove("active");
        document.getElementById("register-screen").classList.add("active");
      }

      async function doLogin() {
        const emailOrId = document.getElementById("login-email").value.trim();
        const pw = document.getElementById("login-pw").value;

        if (!emailOrId || !pw) {
          showToast("Isi semua field terlebih dahulu");
          return;
        }

        // Tampilkan loading
        const btn = document.querySelector("#login-screen .btn-teal");
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Masuk...";
        }

        let emailToUse = emailOrId;

        // Jika input bukan email (tidak ada @), coba cari email dari tabel profiles berdasarkan member_id
        if (!emailOrId.includes("@")) {
          const { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("email")
            .eq("member_id", emailOrId)
            .single();

          if (profileError || !profile) {
            showToast("ID anggota tidak ditemukan");
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Masuk";
            }
            return;
          }
          emailToUse = profile.email;
        }

        // Login ke Supabase Auth
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: emailToUse,
          password: pw,
        });

        if (error) {
          // Pesan error ramah
          let msg = "Email/ID atau password salah";
          if (error.message.includes("Email not confirmed")) {
            msg =
              "⚠️ Email belum dikonfirmasi.\n\nSilakan cek inbox email kamu dan klik link konfirmasi, lalu coba login lagi.\n\nTips: Jika tidak ada email, cek folder Spam.";
            showToast("Email belum dikonfirmasi — cek inbox/spam kamu");
          } else if (
            error.message.includes("Invalid login") ||
            error.message.includes("invalid_credentials")
          ) {
            msg = "Email/ID atau password salah";
            showToast(msg);
          } else if (error.message.includes("Too many requests")) {
            msg = "Terlalu banyak percobaan. Coba lagi nanti.";
            showToast(msg);
          } else {
            showToast(msg);
          }
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Masuk";
          }
          return;
        }

        // ====== CEK APAKAH USER INI ADMIN / OWNER ======
        const { data: adminRow } = await supabaseClient
          .from("admin_users")
          .select("role, full_name")
          .eq("id", data.user.id)
          .maybeSingle();

        if (adminRow) {
          // User ini staff (admin/owner) -> arahkan ke dashboard admin.html
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Masuk";
          }
          showToast(
            "Login berhasil! Mengarahkan ke dashboard " + adminRow.role + "...",
          );
          setTimeout(() => {
            window.location.href = "admin.html";
          }, 600);
          return;
        }

        // Ambil atau buat profil dari tabel profiles
        const profile = await ensureMemberProfile(data.user, {
          full_name:
            data.user.user_metadata?.full_name || emailToUse.split("@")[0],
        });

        currentUser = {
          name: profile?.full_name || data.user.email.split("@")[0],
          email: data.user.email,
          id: profile?.member_id || "LIT-???",
          tl: profile?.tanggal_lahir || "-",
          phone: profile?.phone || "-",
          photo: getProfilePhoto(profile),
          joinDate: profile?.created_at
            ? new Date(profile.created_at).toLocaleDateString("id-ID")
            : "-",
        };

        if (btn) {
          btn.disabled = false;
          btn.textContent = "Masuk";
        }
        showToast("Login berhasil!");
        enterApp();
      }

      async function ensureMemberProfile(authUser, fallback = {}) {
        if (!authUser?.id || !authUser.email) return null;

        const { data: existingProfile, error: lookupError } =
          await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", authUser.id)
            .maybeSingle();

        if (lookupError) {
          console.warn("Gagal mengecek profil anggota:", lookupError.message);
        }

        if (existingProfile) {
          return existingProfile;
        }

        const profilePayload = {
          id: authUser.id,
          email: authUser.email,
          full_name:
            fallback.full_name ||
            authUser.user_metadata?.full_name ||
            authUser.email.split("@")[0],
          phone: fallback.phone || null,
          member_id:
            fallback.member_id || `LIT-${String(Date.now()).slice(-6)}`,
          tanggal_lahir: fallback.tanggal_lahir || "-",
        };

        const { data: insertedProfile, error: insertError } =
          await supabaseClient
            .from("profiles")
            .insert(profilePayload)
            .select("*")
            .single();

        if (insertError) {
          console.error(
            "Auto-create profil anggota gagal:",
            insertError.message,
            insertError,
          );
          if (
            insertError.code === "23505" ||
            insertError.message?.includes("duplicate key")
          ) {
            const { data: retryProfile } = await supabaseClient
              .from("profiles")
              .select("*")
              .eq("id", authUser.id)
              .maybeSingle();

            if (retryProfile) {
              localStorage.setItem(
                "literasea_profiles_updated",
                JSON.stringify({
                  ts: Date.now(),
                  source: "auto-profile-rerun",
                }),
              );
              return retryProfile;
            }
          }
          return profilePayload;
        }

        localStorage.setItem(
          "literasea_profiles_updated",
          JSON.stringify({
            ts: Date.now(),
            source: "auto-profile",
          }),
        );

        return insertedProfile || profilePayload;
      }

      async function doRegister() {
        const name = document.getElementById("reg-name").value.trim();
        const phone = document.getElementById("reg-phone").value.trim();
        const email = document.getElementById("reg-email").value.trim();
        const pw = document.getElementById("reg-pw").value;
        const pw2 = document.getElementById("reg-pw2").value;

        // Validasi lokal
        if (!name || !phone || !email || !pw || !pw2) {
          showToast("Isi semua field");
          return;
        }
        if (pw.length < 6) {
          showToast("Password minimal 6 karakter");
          return;
        }
        if (pw !== pw2) {
          showToast("Password tidak cocok");
          return;
        }

        const btn = document.querySelector("#register-screen .btn-teal");
        if (btn) {
          btn.disabled = true;
          btn.textContent = "Mendaftar...";
        }

        // Daftar ke Supabase Auth
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: pw,
          options: {
            data: { full_name: name, phone },
            emailRedirectTo: undefined,
          },
        });

        if (error) {
          let msg = "Pendaftaran gagal";
          if (
            error.message.includes("already registered") ||
            error.message.includes("already been registered") ||
            error.message.includes("User already registered")
          ) {
            msg = "Email sudah terdaftar. Silakan login.";
          } else if (error.message.includes("weak password")) {
            msg = "Password terlalu lemah. Gunakan minimal 6 karakter.";
          } else if (error.message.includes("invalid email")) {
            msg = "Format email tidak valid.";
          }
          showToast(msg);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Daftar Sekarang";
          }
          return;
        }

        if (data.user) {
          if (data.session) {
            const profile = await ensureMemberProfile(data.user, {
              full_name: name,
              phone,
            });

            localStorage.setItem(
              "literasea_profiles_updated",
              JSON.stringify({
                ts: Date.now(),
                source: "register",
              }),
            );

            currentUser = {
              name: profile?.full_name || name,
              email: email,
              id: profile?.member_id || `LIT-${String(Date.now()).slice(-6)}`,
              tl: profile?.tanggal_lahir || "-",
              phone: profile?.phone || phone || "-",
              photo: getProfilePhoto(profile),
              joinDate: profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString("id-ID")
                : new Date().toLocaleDateString("id-ID"),
            };
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Daftar Sekarang";
            }
            showToast("Pendaftaran berhasil! Selamat datang 🎉");
            setTimeout(() => enterApp(), 800);
          } else {
            if (btn) {
              btn.disabled = false;
              btn.textContent = "Daftar Sekarang";
            }
            showToast("Pendaftaran berhasil! Silakan login sekarang.");
            setTimeout(() => showLogin(), 1500);
          }
        } else {
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Daftar Sekarang";
          }
          showToast("Pendaftaran gagal. Coba lagi.");
        }
      }

      async function doLogout() {
        await supabaseClient.auth.signOut();
        if (bukuRealtimeChannel) {
          supabaseClient.removeChannel(bukuRealtimeChannel);
          bukuRealtimeChannel = null;
        }
        if (helpdeskRealtimeChannel) {
          supabaseClient.removeChannel(helpdeskRealtimeChannel);
          helpdeskRealtimeChannel = null;
        }
        currentUser = null;
        accountSuspensionState = {
          isSuspended: false,
          blockedLoans: [],
          totalFine: 0,
          maxBlockedDays: 0,
        };
        previousSuspensionFlag = false;
        document.getElementById("app").classList.remove("active");
        document.getElementById("app").style.display = "";
        showSplash();
        showToast("Berhasil logout");
      }

      function enterApp() {
        document.getElementById("login-screen").classList.remove("active");
        document.getElementById("register-screen").classList.remove("active");
        document.getElementById("splash-screen").style.display = "none";

        document.getElementById("app").style.display = "flex";
        document.getElementById("app").classList.add("active");
        startBukuRealtimeSync();
        startHelpdeskRealtimeSync();
        loadBukuUser();
        loadPengembalianUser();

        document.getElementById("sidebar-user").textContent =
          currentUser.name || "Pengguna";
        document.getElementById("card-nama").textContent =
          currentUser.name || "-";
        document.getElementById("card-id").textContent = currentUser.id || "-";
        document.getElementById("card-tl").textContent = currentUser.tl || "-";
        document.getElementById("card-back-nama").textContent =
          currentUser.name || "-";
        document.getElementById("card-back-id").textContent =
          currentUser.id || "-";
        document.getElementById("card-back-phone").textContent =
          currentUser.phone || "-";
        document.getElementById("card-back-join").textContent =
          currentUser.joinDate || "-";
        const memberCardValidDate = new Date().toLocaleDateString("id-ID");
        document.getElementById("card-valid").textContent =
          memberCardValidDate;
        document.getElementById("card-back-valid").textContent =
          memberCardValidDate;

        renderMemberBarcode("barcode-lines");
        renderMemberBarcode("back-barcode-lines");
        hydrateMemberCardPhoto();

        renderDashboardNews();
        renderCategories();
        navigate("dashboard", { resetHistory: true });
        updateAccountSuspensionUI();
        setWelcomeTime();
        showToast("Selamat datang, " + currentUser.name + "!");
      }

document.addEventListener("DOMContentLoaded", async () => {
        renderDashboardNews();
        renderCategories();
        document.getElementById("stat-kategori").textContent =
          categories.length;

        // ====== CEK SESSION SUPABASE (Auto-login jika sudah pernah login) ======
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        if (session && session.user) {
          // ====== CEK APAKAH USER INI ADMIN / OWNER ======
          const { data: adminRow } = await supabaseClient
            .from("admin_users")
            .select("role")
            .eq("id", session.user.id)
            .maybeSingle();

          if (adminRow) {
            window.location.href = "admin.html";
            return;
          }

          // Ambil atau buat profil dari tabel profiles
          const profile = await ensureMemberProfile(session.user, {
            full_name:
              session.user.user_metadata?.full_name ||
              session.user.email.split("@")[0],
          });

          currentUser = {
            name: profile?.full_name || session.user.email.split("@")[0],
            email: session.user.email,
            id: profile?.member_id || "LIT-???",
            tl: profile?.tanggal_lahir || "-",
            phone: profile?.phone || "-",
            photo: getProfilePhoto(profile),
            joinDate: profile?.created_at
              ? new Date(profile.created_at).toLocaleDateString("id-ID")
              : "-",
          };

          enterApp();
        }

        // Listener untuk perubahan auth state
        supabaseClient.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_OUT") {
            if (bukuRealtimeChannel) {
              supabaseClient.removeChannel(bukuRealtimeChannel);
              bukuRealtimeChannel = null;
            }
            if (helpdeskRealtimeChannel) {
              supabaseClient.removeChannel(helpdeskRealtimeChannel);
              helpdeskRealtimeChannel = null;
            }
            currentUser = null;
            accountSuspensionState = {
              isSuspended: false,
              blockedLoans: [],
              totalFine: 0,
              maxBlockedDays: 0,
            };
            previousSuspensionFlag = false;
          }
        });
      });
