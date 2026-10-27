import { applyTranslations } from "./translations.js";
applyTranslations();

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection, 
  getDocs, 
  query,
  where,
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase კონფიგურაცია
const firebaseConfig = {
  apiKey: "AIzaSyAj8VZVZYI_UVZlflTQk3MAljdS5Rxfrv0",
  authDomain: "gabji-b583c.firebaseapp.com",
  projectId: "gabji-b583c",
  storageBucket: "gabji-b583c.firebasestorage.app",
  messagingSenderId: "359136388859",
  appId: "1:359136388859:web:5c3448fecd29052755f25e",
  measurementId: "G-CM03PR8K8S"
};

// ინიციალიზაცია
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// თუ მომხმარებელი უკვე ავტორიზებულია, გადადის feed.html-ზე (მხოლოდ index-ზე ყოფნისას)
onAuthStateChanged(auth, (user) => {
  if (user) {
    const currentPath = window.location.pathname.toLowerCase();
    const isIndex = currentPath.endsWith("index.html") || currentPath === "/" || currentPath === "";
    if (isIndex) {
      window.location.href = "feed.html";
    }
  }
});

/* ==========================================================================
   0. Cloudflare R2 ატვირთვა (თქვენი ზუსტი კონფიგურაციით)
   ========================================================================== */
function uploadPhotoToR2(file, onProgress, callback) {
  if (!file) {
    callback(null);
    return;
  }

  // Canvas ოპტიმიზატორი (ზომის შემცირება)
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      const maxDimension = 960;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((optimizedBlob) => {
        proceedUpload(optimizedBlob || file);
      }, "image/jpeg", 0.8);
    };
    img.onerror = () => proceedUpload(file);
  };
  reader.onerror = () => proceedUpload(file);

  function proceedUpload(blob) {
    // ზუსტი Cloudflare S3 ინიციალიზაცია
    const r2S3 = new AWS.S3({
      endpoint: "https://b06701b6405e891a274a6d40ae52c940.r2.cloudflarestorage.com",
      accessKeyId: "fca43a92ab1d3b3e7c89912f8d525977",
      secretAccessKey: "d051531e40a19cfaedade242eac6b6d506dad44be370224ba2e5c3ea298f1ad6",
      signatureVersion: "v4",
      region: "auto",
      s3ForcePathStyle: true
    });

    const fileKey = "avatars/" + Date.now() + "_" + Math.random().toString(36).substring(2, 7) + ".jpg";

    const params = {
      Bucket: "emigrantbook-videos",
      Key: fileKey,
      Body: blob,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable"
    };

    const uploader = r2S3.upload(params);

    uploader.on("httpUploadProgress", (evt) => {
      if (evt.total && typeof onProgress === "function") {
        const percent = Math.round((evt.loaded / evt.total) * 100);
        onProgress(percent);
      }
    });

    uploader.send((err, data) => {
      if (err) {
        console.error("R2 Upload Error:", err);
        alert("ატვირთვის შეცდომა: " + err.message);
        callback(null);
      } else {
        const publicUrl = "https://pub-d077cb13f6ec46cebeca95f2f25b9a08.r2.dev/" + fileKey;
        callback(publicUrl);
      }
    });
  }
}

/* ==========================================================================
   1. შესვლა / მოდალი (index.html)
   ========================================================================== */
const loginModal = document.getElementById("loginModal");
const openModalBtn = document.getElementById("openLoginModal");
const quickEmailBtn = document.getElementById("quickEmailBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const submitLoginBtn = document.getElementById("submitLoginBtn");

if (openModalBtn && loginModal) {
  openModalBtn.onclick = () => loginModal.style.display = "flex";
}
if (quickEmailBtn && loginModal) {
  quickEmailBtn.onclick = () => loginModal.style.display = "flex";
}
if (closeModalBtn && loginModal) {
  closeModalBtn.onclick = () => loginModal.style.display = "none";
}

window.addEventListener("click", (e) => {
  if (loginModal && e.target === loginModal) {
    loginModal.style.display = "none";
  }
});

if (submitLoginBtn) {
  submitLoginBtn.onclick = async () => {
    const emailEl = document.getElementById("loginEmail");
    const passEl = document.getElementById("loginPass");

    const email = emailEl ? emailEl.value.trim() : "";
    const pass = passEl ? passEl.value.trim() : "";

    if (!email || !pass) {
      alert("გთხოვთ შეავსოთ ელ-ფოსტა და პაროლი");
      return;
    }

    try {
      submitLoginBtn.disabled = true;
      submitLoginBtn.innerText = "შედის...";
      await signInWithEmailAndPassword(auth, email, pass);
      window.location.href = "feed.html";
    } catch (err) {
      alert("შესვლის შეცდომა: " + err.message);
      submitLoginBtn.disabled = false;
      submitLoginBtn.innerText = "შესვლა";
    }
  };
}

const googleLoginBtn = document.getElementById("googleLoginBtn");
if (googleLoginBtn) {
  googleLoginBtn.onclick = async () => {
    try {
      await signInWithPopup(auth, provider);
      window.location.href = "feed.html";
    } catch (err) {
      alert("Google ავტორიზაციის შეცდომა: " + err.message);
    }
  };
}

/* ==========================================================================
   2. რეგისტრაცია (signup.html) - ტელეფონისა და ფოტოს გარეშე
   ========================================================================== */
const interestBtns = document.querySelectorAll(".interest-pill");
interestBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
  });
});

const signupForm = document.getElementById("signupForm");
const submitBtn = document.getElementById("submitBtn");

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const firstName = document.getElementById("regFirstName")?.value.trim() || "";
    const lastName = document.getElementById("regLastName")?.value.trim() || "";
    const birthDate = document.getElementById("regBirthDate")?.value || "";
    const country = document.getElementById("regCountry")?.value.trim() || "";
    const city = document.getElementById("regCity")?.value.trim() || "";
    const email = document.getElementById("regEmail")?.value.trim() || "";
    const password = document.getElementById("regPassword")?.value.trim() || "";

    const selectedInterests = [];
    document.querySelectorAll(".interest-pill.active").forEach((tag) => {
      selectedInterests.push(tag.textContent.trim());
    });

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "რეგისტრაცია მიმდინარეობს...";
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        firstName: firstName,
        lastName: lastName,
        birthDate: birthDate,
        country: country,
        city: city,
        email: email,
        photoUrl: null,
        interests: selectedInterests,
        createdAt: serverTimestamp()
      });

      window.location.href = "feed.html";
    } catch (error) {
      console.error("Firebase Error:", error);
      alert("შეცდომა რეგისტრაციისას: " + error.message);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerText = "რეგისტრაცია";
      }
    }
  });
}

/* ==========================================================================
   3. ფიდი (feed.html)
   ========================================================================== */
const cardTitle = document.querySelector(".card-user-title");

if (cardTitle) {
  let feedProfiles = [];
  let currentCardIndex = 0;

  const calculateAge = (dateStr) => {
    if (!dateStr) return "";
    const birth = new Date(dateStr);
    const diff = Date.now() - birth.getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const displayProfile = (index) => {
    const nameEl = document.querySelector(".card-user-title");
    const locEl = document.querySelector(".card-distance-text");
    const bioEl = document.querySelector(".card-bio-text");
    const pillsWrap = document.querySelector(".card-interest-pills");
    const photoBox = document.querySelector(".card-image-placeholder");

    if (!feedProfiles.length || index >= feedProfiles.length) {
      if (nameEl) nameEl.textContent = "მომხმარებლები არ არის";
      if (locEl) locEl.textContent = "";
      if (bioEl) bioEl.textContent = "";
      if (pillsWrap) pillsWrap.innerHTML = "";
      return;
    }

    const item = feedProfiles[index];
    const age = calculateAge(item.birthDate);

    if (nameEl) {
      nameEl.textContent = `${item.firstName || ""} ${item.lastName || ""}${age ? ", " + age : ""}`.trim();
    }

    if (locEl) {
      const fullLoc = [item.city, item.country].filter(Boolean).join(", ");
      locEl.textContent = fullLoc ? `📍 ${fullLoc}` : "";
    }

    if (bioEl) {
      bioEl.textContent = item.email || "";
    }

    if (pillsWrap) {
      pillsWrap.innerHTML = "";
      if (Array.isArray(item.interests)) {
        item.interests.forEach((intr) => {
          const span = document.createElement("span");
          span.className = "card-pill";
          span.textContent = intr;
          pillsWrap.appendChild(span);
        });
      }
    }

    if (photoBox) {
      const oldImg = photoBox.querySelector(".profile-pic");
      if (oldImg) oldImg.remove();

      const placeholderSvg = photoBox.querySelector("svg");

      if (item.photoUrl) {
        if (placeholderSvg) placeholderSvg.style.display = "none";
        const img = document.createElement("img");
        img.className = "profile-pic";
        img.src = item.photoUrl;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        photoBox.appendChild(img);
      } else {
        if (placeholderSvg) placeholderSvg.style.display = "block";
      }
    }
  };

  const getProfilesFromDb = async () => {
    try {
      const snapshot = await getDocs(collection(db, "users"));
      feedProfiles = [];
      snapshot.forEach((docSnap) => {
        feedProfiles.push(docSnap.data());
      });
      displayProfile(currentCardIndex);
    } catch (e) {
      console.error("ბაზის შეცდომა:", e);
      if (cardTitle) cardTitle.textContent = "ვერ ჩაიტვირთა";
    }
  };

  const likeBtn = document.getElementById("likeBtn");
  const passBtn = document.getElementById("passBtn");

  if (likeBtn) {
    likeBtn.onclick = () => {
      currentCardIndex++;
      displayProfile(currentCardIndex);
    };
  }

  if (passBtn) {
    passBtn.onclick = () => {
      currentCardIndex++;
      displayProfile(currentCardIndex);
    };
  }

  getProfilesFromDb();
}



   /* ==========================================================================
   4. პროფილის მონაცემების წამოღება (PROFILE.HTML & FIRESTORE)
   ========================================================================== */
const profileNameEl = document.getElementById("profileName");

if (profileNameEl) {
  const getAge = (dateStr) => {
    if (!dateStr) return "";
    const birth = new Date(dateStr);
    const diff = Date.now() - birth.getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  onAuthStateChanged(auth, async (currentUser) => {
    if (!currentUser) {
      window.location.href = "index.html";
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const targetUid = urlParams.get("uid") || currentUser.uid;

    const myActions = document.getElementById("myUserActions");
    const otherActions = document.getElementById("otherUserActions");

    if (targetUid === currentUser.uid) {
      if (otherActions) otherActions.style.display = "none";
      if (myActions) myActions.style.display = "flex";
    } else {
      if (otherActions) otherActions.style.display = "flex";
      if (myActions) myActions.style.display = "none";
    }

    const userDocRef = doc(db, "users", targetUid);

    try {
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        const age = getAge(data.birthDate);

        profileNameEl.textContent = `${data.firstName || ""} ${data.lastName || ""}${age ? ", " + age : ""}`.trim() || "მომხმარებელი";

        const userTag = document.getElementById("profileUsername");
        if (userTag) {
          userTag.textContent = data.username ? `@${data.username}` : (data.email ? `@${data.email.split("@")[0]}` : "@user");
        }

        const statFollowing = document.getElementById("statFollowing");
        const statFollowers = document.getElementById("statFollowers");
        const statLikes = document.getElementById("statLikes");

        if (statFollowing) statFollowing.textContent = (data.followingCount !== undefined && data.followingCount !== null) ? data.followingCount : 0;
        if (statFollowers) statFollowers.textContent = (data.followersCount !== undefined && data.followersCount !== null) ? data.followersCount : 0;
        if (statLikes) statLikes.textContent = (data.likesCount !== undefined && data.likesCount !== null) ? data.likesCount : 0;

        const distEl = document.getElementById("profileDistance");
        const locEl = document.getElementById("profileLocation");
        const locParts = [data.city, data.country].filter(Boolean).join(", ");
        if (distEl) distEl.textContent = locParts ? `📍 ${locParts}` : "ლოკაცია მითითებული არ არის";
        if (locEl) locEl.textContent = locParts ? `🇬🇪 ${locParts}` : "🇬🇪";

        const bioEl = document.getElementById("profileBio");
        if (bioEl) {
          bioEl.textContent = data.phone ? `📞 ${data.phone}` : (data.email || "");
        }

        const avatarImg = document.getElementById("profileMainAvatar");
        const avatarSvg = document.getElementById("profileAvatarPlaceholder");

        if (data.photoUrl) {
          if (avatarImg) {
            avatarImg.src = data.photoUrl;
            avatarImg.style.display = "block";
          }
          if (avatarSvg) avatarSvg.style.display = "none";
        } else {
          if (avatarImg) avatarImg.style.display = "none";
          if (avatarSvg) avatarSvg.style.display = "block";
        }

        // გამოწერის სტატუსის შემოწმება Firestore-ში (უკვე გამოწერილი გყავს თუ არა)
        const btnFollow = document.getElementById("btnFollowAction");
        if (btnFollow && targetUid !== currentUser.uid) {
          const followDocRef = doc(db, "users", currentUser.uid, "following", targetUid);
          const followSnap = await getDoc(followDocRef);

          let isFollowed = followSnap.exists() && followSnap.data()?.active === true;

          if (isFollowed) {
            btnFollow.textContent = "გამოწერილია";
            btnFollow.style.background = "#252525";
          } else {
            btnFollow.textContent = "გამოწერა";
            btnFollow.style.background = "#fe2c55";
          }

          // ბაზაში რეალური ჩაწერა / წაშლა
          btnFollow.onclick = async () => {
            btnFollow.disabled = true;
            let currentCount = parseInt(statFollowers?.textContent) || 0;

            try {
              if (!isFollowed) {
                // 1. იქმნება following ქვეკოლექცია
                await setDoc(followDocRef, { 
                  followedUid: targetUid,
                  active: true,
                  timestamp: serverTimestamp() 
                });

                // 2. რიცხვების განახლება users დოკუმენტებში merge-ით
                currentCount += 1;
                await setDoc(userDocRef, { followersCount: currentCount }, { merge: true });
                const myRef = doc(db, "users", currentUser.uid);
                const mySnap = await getDoc(myRef);
                const myFollowing = (mySnap.exists() && Number(mySnap.data().followingCount)) || 0;
                await setDoc(myRef, { followingCount: myFollowing + 1 }, { merge: true });

                btnFollow.textContent = "გამოწერილია";
                btnFollow.style.background = "#252525";
                if (statFollowers) statFollowers.textContent = currentCount;
                isFollowed = true;
              } else {
                // გამოწერის გაუქმება
                await setDoc(followDocRef, { active: false }, { merge: true });

                currentCount = Math.max(0, currentCount - 1);
                await setDoc(userDocRef, { followersCount: currentCount }, { merge: true });
                const myRef = doc(db, "users", currentUser.uid);
                const mySnap = await getDoc(myRef);
                const myFollowing = (mySnap.exists() && Number(mySnap.data().followingCount)) || 0;
                await setDoc(myRef, { followingCount: Math.max(0, myFollowing - 1) }, { merge: true });

                btnFollow.textContent = "გამოწერა";
                btnFollow.style.background = "#fe2c55";
                if (statFollowers) statFollowers.textContent = currentCount;
                isFollowed = false;
              }
            } catch (followErr) {
              console.error("გამოწერის ბაზაში შენახვის შეცდომა:", followErr);
            } finally {
              btnFollow.disabled = false;
            }
          };
        }

      } else {
        profileNameEl.textContent = "პროფილი ვერ მოიძებნა";
      }
    } catch (err) {
      console.error("პროფილის ჩატვირთვის შეცდომა:", err);
      profileNameEl.textContent = "შეცდომა ჩატვირთვისას";
    }

    const avatarRingBtn = document.getElementById("avatarRingBtn");
    const avatarFileInput = document.getElementById("avatarFileInput");
    const uploadProgressText = document.getElementById("uploadProgressText");
    const avatarImg = document.getElementById("profileMainAvatar");
    const avatarSvg = document.getElementById("profileAvatarPlaceholder");

    if (avatarRingBtn && avatarFileInput) {
      avatarRingBtn.onclick = () => avatarFileInput.click();

      avatarFileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (uploadProgressText) uploadProgressText.textContent = "იტვირთება...";

        uploadPhotoToR2(
          file,
          (percent) => {
            if (uploadProgressText) uploadProgressText.textContent = `${percent}%`;
          },
          async (uploadedUrl) => {
            if (uploadedUrl) {
              try {
                await updateDoc(userDocRef, { photoUrl: uploadedUrl });

                if (avatarImg) {
                  avatarImg.src = uploadedUrl;
                  avatarImg.style.display = "block";
                }
                if (avatarSvg) avatarSvg.style.display = "none";

                if (uploadProgressText) uploadProgressText.textContent = "აქტიურია";
              } catch (updateErr) {
                console.error("Firestore განახლების შეცდომა:", updateErr);
                alert("ფოტოს შენახვა ბაზაში ვერ მოხერხდა");
                if (uploadProgressText) uploadProgressText.textContent = "აქტიურია";
              }
            } else {
              if (uploadProgressText) uploadProgressText.textContent = "აქტიურია";
            }
          }
        );
      };
    }

    /* ==========================================================================
       🔥 ახალი: რელსების ბადის ჩატვირთვა და მარჯვნიდან მარცხნივ სლაიდი
       ========================================================================== */
    const reelsGrid = document.getElementById("profileReelsGrid");
    const galleryGrid = document.getElementById("profileGalleryGrid");
    const gridsSlider = document.getElementById("gridsSlider");
    const tabReelsBtn = document.getElementById("tabReelsBtn");
    const tabGalleryBtn = document.getElementById("tabGalleryBtn");
    const tabIndicator = document.getElementById("tabIndicator");

    // რეალური ვიდეოების წამოღება მხოლოდ ამ მომხმარებლისთვის
    const loadUserReels = async () => {
      if (!reelsGrid) return;
      reelsGrid.innerHTML = '<div class="reels-empty-grid">ვიდეოები იტვირთება...</div>';

      // 1x1 გამჭვირვალე Base64 პოსტერი სისტემური Play ღილაკის დასაბლოკად
      const blackPoster = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

      try {
        const snap = await getDocs(collection(db, "reels"));

        reelsGrid.innerHTML = "";

        const myReels = [];
        snap.forEach((docSnap) => {
          const r = docSnap.data();
          if (r.authorUid === targetUid || r.userId === targetUid) {
            myReels.push({ id: docSnap.id, ...r });
          }
        });

        if (myReels.length === 0) {
          reelsGrid.innerHTML = '<div class="reels-empty-grid">ატვირთული ვიდეოები არ არის</div>';
          return;
        }

        myReels.forEach((reel) => {
          const card = document.createElement("div");
          card.className = "tt-post-card";

          // რეალური ნახვები ბაზიდან
          const views = reel.viewsCount || reel.views || 0;

          card.innerHTML = `
            <div class="tt-post-thumb">
              <video src="${reel.videoUrl}#t=0.1" 
                     poster="${blackPoster}" 
                     class="tt-post-thumb-video" 
                     preload="metadata" 
                     muted 
                     playsinline 
                     webkit-playsinline></video>
            </div>
            <div class="tt-post-views">
              <span class="tt-play-triangle">▷</span>
              <span class="tt-views-count">${views}</span>
            </div>
          `;

          // ვიდეოზე შეხებისას პირდაპირ გადადის რელსებზე
          card.onclick = () => {
            window.location.href = `reels.html?reelId=${reel.id}`;
          };

          reelsGrid.appendChild(card);
        });
      } catch (err) {
        console.error("რელსების ბადის ჩატვირთვის შეცდომა:", err);
        reelsGrid.innerHTML = '<div class="reels-empty-grid">ვიდეოების ჩატვირთვა ვერ მოხერხდა</div>';
      }
    };


    // ტაბების გადართვისა და მარჯვნიდან სლაიდის ლოგიკა
    if (tabReelsBtn && gridsSlider) {
      tabReelsBtn.onclick = () => {
        document.querySelectorAll(".tt-tab-item").forEach((btn) => btn.classList.remove("active"));
        tabReelsBtn.classList.add("active");

        // ბადე მოცურდება მარჯვნიდან მარცხნივ
        gridsSlider.classList.add("show-reels");

        // მოძრავი თეთრი ხაზი გადადის მე-2 პოზიციაზე
        if (tabIndicator) tabIndicator.style.transform = "translateX(100%)";

        // ვიდეოების ჩატვირთვა ბაზიდან
        loadUserReels();
      };
    }

    if (tabGalleryBtn && gridsSlider) {
      tabGalleryBtn.onclick = () => {
        document.querySelectorAll(".tt-tab-item").forEach((btn) => btn.classList.remove("active"));
        tabGalleryBtn.classList.add("active");

        // ბადე ბრუნდება პირველ პოზიციაზე
        gridsSlider.classList.remove("show-reels");

        // მოძრავი თეთრი ხაზი ბრუნდება მე-1 პოზიციაზე
        if (tabIndicator) tabIndicator.style.transform = "translateX(0%)";
      };
    }

    // ვიდეოების წინასწარ წამოღება
    loadUserReels();

    

        // ბურგერ მენიუს გახსნა / დახურვა
    const btnMenu = document.getElementById("btnSettingsProfile");
    const menuDrawer = document.getElementById("menuDrawer");
    const menuBackdrop = document.getElementById("menuBackdrop");

    const openMenuDrawer = () => {
      if (menuDrawer && menuBackdrop) {
        menuDrawer.classList.add("active");
        menuBackdrop.classList.add("active");
      }
    };

    const closeMenuDrawer = () => {
      if (menuDrawer && menuBackdrop) {
        menuDrawer.classList.remove("active");
        menuBackdrop.classList.remove("active");
      }
    };

    if (btnMenu) {
      btnMenu.onclick = (e) => {
        e.stopPropagation();
        openMenuDrawer();
      };
    }

    if (menuBackdrop) {
      menuBackdrop.onclick = closeMenuDrawer;
    }

    // მარცხნიდან მარჯვნივ გაწევით (Swipe-ით) დახურვა
    let touchStartX = 0;
    if (menuDrawer) {
      menuDrawer.addEventListener("touchstart", (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });

      menuDrawer.addEventListener("touchend", (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        if (touchEndX - touchStartX > 50) {
          closeMenuDrawer();
        }
      }, { passive: true });
    }

  });
}
      





 /* ==========================================================================
   5. ხალხის სია (USERS.HTML & FIRESTORE)
   ========================================================================== */
const usersListContainer = document.getElementById("usersListContainer");

if (usersListContainer) {
  const userSearchInput = document.getElementById("userSearchInput");
  let allUsersList = [];
  let myFollowedSet = new Set(); // ბაზიდან უკვე გამოწერილების ID-ების სია

  const renderUsersList = (users, currentUid) => {
    usersListContainer.innerHTML = "";

    // საკუთარი თავი არ გამოჩნდეს სიაში
    const filtered = users.filter((u) => u.userId !== currentUid && u.uid !== currentUid);

    if (filtered.length === 0) {
      usersListContainer.innerHTML = '<div class="users-empty-state">მომხმარებელი ვერ მოიძებნა</div>';
      return;
    }

    filtered.forEach((user) => {
      const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "მომხმარებელი";
      const usernameTag = user.username ? `@${user.username}` : (user.email ? `@${user.email.split("@")[0]}` : "@user");
      const targetId = user.userId || user.uid;

      // ვამოწმებთ, უკვე გამოწერილი გვყავს თუ არა ბაზაში
      let isFollowed = myFollowedSet.has(targetId);

      const row = document.createElement("div");
      row.className = "user-list-item";

      let avatarHtml = "";
      if (user.photoUrl) {
        avatarHtml = `<img src="${user.photoUrl}" alt="${fullName}" class="user-row-avatar-img">`;
      } else {
        avatarHtml = `<img src="icons/user-circle-linear.svg" alt="Default Avatar" class="user-row-avatar-svg">`;
      }

      row.innerHTML = `
        <div class="user-item-left" style="cursor: pointer;">
          <div class="user-row-avatar-box">
            ${avatarHtml}
          </div>
          <div class="user-row-info">
            <div class="user-row-name">${fullName}</div>
            <div class="user-row-handle">${usernameTag}</div>
          </div>
        </div>
        <div class="user-item-right">
          <button type="button" class="btn-user-follow ${isFollowed ? 'following' : ''}" style="${isFollowed ? 'background: #252525;' : ''}">${isFollowed ? 'გამოწერილია' : 'გამოწერა'}</button>
          <button type="button" class="btn-user-dots" aria-label="More">•••</button>
        </div>
      `;

      // სწორედ ეს ხაზი გადაიყვანს კონკრეტული ადამიანის პროფილზე
      const leftPart = row.querySelector(".user-item-left");
      if (leftPart) {
        leftPart.onclick = () => {
          window.location.href = `profile.html?uid=${targetId}`;
        };
      }

      const followBtn = row.querySelector(".btn-user-follow");
      if (followBtn) {
        followBtn.onclick = async (e) => {
          e.stopPropagation();
          followBtn.disabled = true;

          const followDocRef = doc(db, "users", currentUid, "following", targetId);

          try {
            if (!isFollowed) {
              await setDoc(followDocRef, {
                followedUid: targetId,
                active: true,
                createdAt: serverTimestamp()
              });
              myFollowedSet.add(targetId);
              followBtn.textContent = "გამოწერილია";
              followBtn.style.background = "#252525";
              followBtn.classList.add("following");
              isFollowed = true;
            } else {
              await setDoc(followDocRef, { active: false }, { merge: true });
              myFollowedSet.delete(targetId);
              followBtn.textContent = "გამოწერა";
              followBtn.style.background = "";
              followBtn.classList.remove("following");
              isFollowed = false;
            }
          } catch (err) {
            console.error("გამოწერის ბაზაში შენახვის შეცდომა:", err);
          } finally {
            followBtn.disabled = false;
          }
        };
      }

      usersListContainer.appendChild(row);
    });
  };

  onAuthStateChanged(auth, async (currentUser) => {
    if (!currentUser) {
      window.location.href = "index.html";
      return;
    }

    try {
      // 1. ვკითხულობთ, ვინ გვყავს უკვე გამოწერილი
      const followSnap = await getDocs(collection(db, "users", currentUser.uid, "following"));
      myFollowedSet.clear();
      followSnap.forEach((docItem) => {
        const itemData = docItem.data();
        if (itemData.active !== false) {
          myFollowedSet.add(docItem.id);
        }
      });

      // 2. გამოგვაქვს ხალხის სია
      const snap = await getDocs(collection(db, "users"));
      allUsersList = [];
      snap.forEach((d) => {
        const uData = d.data();
        uData.userId = d.id; // ზუსტი უნიკალური ID ბაზიდან
        allUsersList.push(uData);
      });
      renderUsersList(allUsersList, currentUser.uid);
    } catch (err) {
      console.error("ხალხის წამოღების შეცდომა:", err);
      usersListContainer.innerHTML = '<div class="users-empty-state">ჩატვირთვა ვერ მოხერხდა</div>';
    }

    if (userSearchInput) {
      userSearchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase().trim();
        const matched = allUsersList.filter((u) => {
          const fName = (u.firstName || "").toLowerCase();
          const lName = (u.lastName || "").toLowerCase();
          const email = (u.email || "").toLowerCase();
          const uName = (u.username || "").toLowerCase();
          return fName.includes(query) || lName.includes(query) || email.includes(query) || uName.includes(query);
        });
        renderUsersList(matched, currentUser.uid);
      };
    }
  });
}
