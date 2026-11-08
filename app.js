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
  increment,
  collection, 
  getDocs, 
  query,
  where,
  serverTimestamp, 
  onSnapshot
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
  /* ==========================================================================
   3. ფიდი (feed.html - FACEBOOK STYLE FEED: USERS & PHOTOS)
   ========================================================================== */
const feedContainer = document.getElementById("feedPostsContainer");

if (feedContainer) {
  const loadingIndicator = document.getElementById("feedLoadingText");
  const feedCurrentUserAvatar = document.getElementById("feedCurrentUserAvatar");
  const openPostCreatorBtn = document.getElementById("openPostCreatorBtn");
  const btnPickGalleryPhoto = document.getElementById("btnPickGalleryPhoto");
  const feedPostFileInput = document.getElementById("feedPostFileInput");
  const btnHeaderCreate = document.getElementById("btnHeaderCreate");

  if (feedPostFileInput) {
    feedPostFileInput.accept = "image/jpeg,image/png,image/webp,image/jpg";
  }

  let currentLoggedInUser = null;
  let currentLoggedInUserData = null;

  // ციფრების ფორმატირება (თუ 0-ია აბრუნებს ცარიელს, თუ 1000+ აბრუნებს "1,2 ათასი")
  const formatCount = (count) => {
    const num = Number(count) || 0;
    if (num <= 0) return "";
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(".", ",") + " ათასი";
    }
    return String(num);
  };

  // რეალური დროის გამოთვლა
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "ახლახან";
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return "ახლახან";

    const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffInSeconds < 60) return "ახლახან";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} წთ`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} სთ`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays} დღე`;
    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) return `${diffInMonths} თვე`;
    return `${Math.floor(diffInMonths / 12)} წელი`;
  };

  // 1. ფოტოს ატვირთვა პირდაპირ users/{uid}/photos ქვეკოლექციაში
  if (btnPickGalleryPhoto && feedPostFileInput) {
    btnPickGalleryPhoto.onclick = (e) => {
      e.stopPropagation();
      if (!currentLoggedInUser) {
        alert("ფოტოს დასადებად გაიარეთ ავტორიზაცია");
        return;
      }
      feedPostFileInput.click();
    };
  }

  const triggerPostCreation = () => {
    if (!currentLoggedInUser) {
      alert("გაიარეთ ავტორიზაცია");
      return;
    }
    if (feedPostFileInput) feedPostFileInput.click();
  };

  if (openPostCreatorBtn) openPostCreatorBtn.onclick = triggerPostCreation;
  if (btnHeaderCreate) btnHeaderCreate.onclick = triggerPostCreation;

  if (feedPostFileInput) {
    feedPostFileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const postCaption = prompt("დაწერეთ აღწერა (სურვილისამებრ):", "") || "";

      const placeholderText = document.querySelector(".fb-create-placeholder");
      const originalPlaceholder = placeholderText ? placeholderText.textContent : "";
      if (placeholderText) placeholderText.textContent = "ფოტო იტვირთება...";

      uploadPhotoToR2(
        file,
        (percent) => {
          if (placeholderText) placeholderText.textContent = `იტვირთება... ${percent}%`;
        },
        async (uploadedUrl) => {
          if (uploadedUrl) {
            try {
              await setDoc(doc(collection(db, "users", currentLoggedInUser.uid, "photos")), {
                photoUrl: uploadedUrl,
                caption: postCaption.trim(),
                likesCount: 0,
                commentsCount: 0,
                sharesCount: 0,
                createdAt: serverTimestamp()
              });

              feedPostFileInput.value = "";
              loadFeedPosts(currentLoggedInUser.uid);
            } catch (postErr) {
              console.error("ფოტოს შენახვის შეცდომა:", postErr);
              alert("ფოტოს დადება ვერ მოხერხდა");
            }
          }
          if (placeholderText) placeholderText.textContent = originalPlaceholder;
        }
      );
    };
  }

  // 2. ფოტოების წამოღება
  const loadFeedPosts = async (currentUid) => {
    try {
      const followedSet = new Set();
      if (currentUid) {
        try {
          const followSnap = await getDocs(collection(db, "users", currentUid, "following"));
          followSnap.forEach((fDoc) => {
            if (fDoc.data().active !== false) followedSet.add(fDoc.id);
          });
        } catch (_) {}
      }

      let allCards = [];
      const usersSnap = await getDocs(collection(db, "users"));

      for (const uDoc of usersSnap.docs) {
        const uData = uDoc.data();
        const uId = uDoc.id;
        const authorName = `${uData.firstName || ''} ${uData.lastName || ''}`.trim() || 'მომხმარებელი';
        const authorAvatar = uData.photoUrl || 'icons/user-circle-linear.svg';

        try {
          const photosSnap = await getDocs(collection(db, "users", uId, "photos"));
          photosSnap.forEach((pDoc) => {
            const pData = pDoc.data();
            if (pData.photoUrl) {
              allCards.push({
                id: pDoc.id,
                authorUid: uId,
                authorName: authorName,
                authorPhoto: authorAvatar,
                photoUrl: pData.photoUrl,
                caption: pData.caption || '',
                likesCount: pData.likesCount || 0,
                commentsCount: pData.commentsCount || 0,
                sharesCount: pData.sharesCount || 0,
                createdAt: pData.createdAt || null,
                isSubcollection: true
              });
            }
          });

          if (photosSnap.empty && uData.photoUrl) {
            allCards.push({
              id: `profile_${uId}`,
              authorUid: uId,
              authorName: authorName,
              authorPhoto: authorAvatar,
              photoUrl: uData.photoUrl,
              caption: uData.city ? `📍 ${uData.city}` : '',
              likesCount: uData.likesCount || 0,
              commentsCount: 0,
              sharesCount: 0,
              createdAt: uData.createdAt || null,
              isSubcollection: false
            });
          }
        } catch (err) {
          console.error(`შეცდომა ${uId}-ს ფოტოებზე:`, err);
        }
      }

      allCards.sort((a, b) => {
        const tA = a.createdAt?.seconds || (a.createdAt ? new Date(a.createdAt).getTime() / 1000 : 0);
        const tB = b.createdAt?.seconds || (b.createdAt ? new Date(b.createdAt).getTime() / 1000 : 0);
        return tB - tA;
      });

      if (allCards.length === 0) {
        if (loadingIndicator) loadingIndicator.textContent = "ფოტოები არ არის";
        return;
      }

      if (loadingIndicator) loadingIndicator.remove();
      feedContainer.innerHTML = "";

      for (const item of allCards) {
        const isMe = currentUid && (currentUid === item.authorUid);
        const isFollowed = followedSet.has(item.authorUid);

        const followHtml = (!isMe && !isFollowed && item.authorUid) ? `
          <span class="fb-bullet">·</span>
          <button type="button" class="fb-follow-link" data-uid="${item.authorUid}">გამოწერა</button>
        ` : '';

        const realTimeAgo = formatTimeAgo(item.createdAt);

        let captionHtml = "";
        if (item.caption && item.caption.trim()) {
          const isLong = item.caption.length > 90;
          captionHtml = `
            <div class="fb-caption">
              <span class="fb-caption-text">${item.caption}</span>
              ${isLong ? '<span class="fb-see-more-link">სხვა</span>' : ''}
            </div>
          `;
        }

        const likesText = formatCount(item.likesCount);
        const commentsText = formatCount(item.commentsCount);
        const sharesText = formatCount(item.sharesCount);

        const card = document.createElement("article");
        card.className = "fb-card";
        card.id = `fb_card_${item.id}`;

        card.innerHTML = `
          <div class="fb-header">
            <div class="fb-header-left">
              <img src="${item.authorPhoto}" class="fb-avatar" alt="${item.authorName}" onclick="window.location.href='profile.html?uid=${item.authorUid}'">
              <div class="fb-user-details">
                <div class="fb-name-row">
                  <span class="fb-user-name" onclick="window.location.href='profile.html?uid=${item.authorUid}'">${item.authorName}</span>
                  ${followHtml}
                </div>
                <div class="fb-meta-sub">
                  <span>${realTimeAgo}</span>
                  <span>·</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#65676b" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                </div>
              </div>
            </div>

            <div class="fb-header-right">
              <button type="button" class="fb-icon-action btn-post-more" aria-label="More">
                <span class="fb-dots-text">•••</span>
              </button>
              <button type="button" class="fb-icon-action btn-post-remove" aria-label="Close">
                <span class="fb-close-x">✕</span>
              </button>
            </div>
          </div>

          ${captionHtml}

          <div class="fb-media-box">
            <img src="${item.photoUrl}" class="fb-media-item" alt="Photo" loading="lazy">
          </div>

                    <!-- ქვედა მოქმედებები: შენი აიკონები (0 არ იწერება) -->
          <div class="fb-footer-bar">
            <!-- Like (შენი აიკონი) -->
            <button type="button" class="fb-action-btn btn-fb-like" data-id="${item.id}" data-author="${item.authorUid}" data-sub="${item.isSubcollection}">
              <img src="icons/like-linear.svg" class="fb-action-icon" alt="Like">
              <span class="fb-action-count fb-like-count">${likesText}</span>
            </button>

            <!-- Comment (შენი აიკონი) -->
            <button type="button" class="fb-action-btn btn-fb-comment" onclick="window.location.href='photo-viewer.html?uid=${item.authorUid}&photoId=${item.id}'">
              <img src="icons/chat-round-dots-linear.svg" class="fb-action-icon" alt="Comment">
              <span class="fb-action-count">${commentsText}</span>
            </button>

            <!-- Share (შენი აიკონი) -->
            <button type="button" class="fb-action-btn btn-fb-share">
              <img src="icons/forward-right-linear.svg" class="fb-action-icon" alt="Share">
              <span class="fb-action-count">${sharesText}</span>
            </button>
          </div>
        `;

        const btnRemove = card.querySelector(".btn-post-remove");
        btnRemove.onclick = () => card.remove();

        const btnFollow = card.querySelector(".fb-follow-link");
        if (btnFollow) {
          btnFollow.onclick = async () => {
            if (!currentUid) {
              alert("გაიარეთ ავტორიზაცია");
              return;
            }
            btnFollow.disabled = true;
            try {
              await setDoc(doc(db, "users", currentUid, "following", item.authorUid), {
                followedUid: item.authorUid,
                active: true,
                createdAt: serverTimestamp()
              });
              btnFollow.remove();
              const b = card.querySelector(".fb-bullet");
              if (b) b.remove();
            } catch (err) {
              console.error("გამოწერის შეცდომა:", err);
              btnFollow.disabled = false;
            }
          };
        }

        const btnLike = card.querySelector(".btn-fb-like");
        const countSpan = card.querySelector(".fb-like-count");
        btnLike.onclick = async () => {
          if (!currentUid) {
            alert("გაიარეთ ავტორიზაცია");
            return;
          }
          const isLiked = btnLike.classList.contains("liked");
          let currentLikes = Number(item.likesCount) || 0;

          if (!isLiked) {
            btnLike.classList.add("liked");
            currentLikes += 1;
            item.likesCount = currentLikes;
            countSpan.textContent = formatCount(currentLikes);

            if (item.isSubcollection) {
              await updateDoc(doc(db, "users", item.authorUid, "photos", item.id), { likesCount: increment(1) }).catch(() => {});
            } else {
              await updateDoc(doc(db, "users", item.authorUid), { likesCount: increment(1) }).catch(() => {});
            }
          } else {
            btnLike.classList.remove("liked");
            currentLikes = Math.max(0, currentLikes - 1);
            item.likesCount = currentLikes;
            countSpan.textContent = formatCount(currentLikes);

            if (item.isSubcollection) {
              await updateDoc(doc(db, "users", item.authorUid, "photos", item.id), { likesCount: increment(-1) }).catch(() => {});
            } else {
              await updateDoc(doc(db, "users", item.authorUid), { likesCount: increment(-1) }).catch(() => {});
            }
          }
        };

        feedContainer.appendChild(card);
      }

    } catch (e) {
      console.error("ფიდის შეცდომა:", e);
      if (loadingIndicator) loadingIndicator.textContent = "ჩატვირთვის შეცდომა";
    }
  };

  onAuthStateChanged(auth, async (user) => {
    currentLoggedInUser = user;
    if (user) {
      try {
        const uSnap = await getDoc(doc(db, "users", user.uid));
        if (uSnap.exists()) {
          currentLoggedInUserData = uSnap.data();
          if (feedCurrentUserAvatar && currentLoggedInUserData.photoUrl) {
            feedCurrentUserAvatar.src = currentLoggedInUserData.photoUrl;
          }
        }
      } catch (_) {}
      loadFeedPosts(user.uid);
    } else {
      loadFeedPosts(null);
    }
  });
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

        // შეტყობინების ღილაკი (გადასვლა პირად ჩატზე)
        const btnMessage = document.getElementById("btnMessageAction");
        if (btnMessage && targetUid !== currentUser.uid) {
          btnMessage.onclick = () => {
            window.location.href = `chat.html?uid=${targetUid}`;
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
       გალერეის ფოტოების ჩატვირთვა და კამერის პირველი ჩარჩო
       ========================================================================== */
    const galleryGrid = document.getElementById("profileGalleryGrid");
    const galleryInput = document.getElementById("galleryPhotoInput");

    const loadUserGallery = async (isOwner) => {
      if (!galleryGrid) return;
      galleryGrid.innerHTML = "";

      // 1. თუ საკუთარი პროფილია, პირველ ჩარჩოდ ვხატავთ კამერას
      if (isOwner) {
        const addCard = document.createElement("div");
        addCard.className = "gallery-add-card";
        addCard.innerHTML = `
          <svg class="gallery-add-icon" viewBox="0 0 24 24">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          <span class="gallery-add-text">დამატება</span>
        `;

        addCard.onclick = () => {
          if (galleryInput) galleryInput.click();
        };

        galleryGrid.appendChild(addCard);
      }

            // 2. წამოვიღოთ მომხმარებლის ფოტოები Firestore-დან
      try {
        const photosSnap = await getDocs(collection(db, "users", targetUid, "photos"));
        photosSnap.forEach((docSnap) => {
          const pData = docSnap.data();
          if (pData.photoUrl) {
            const itemCard = document.createElement("div");
            itemCard.className = "gallery-item-card";
            itemCard.innerHTML = `<img src="${pData.photoUrl}" alt="User Photo" loading="lazy">`;

            // ფოტოზე დაჭერისას გადასვლა სრულეკრანიან დათვალიერებაზე
            itemCard.onclick = () => {
              window.location.href = `photo-viewer.html?uid=${targetUid}&photoId=${docSnap.id}`;
            };

            galleryGrid.appendChild(itemCard);
          }
        });
      } catch (err) {
        console.error("გალერეის ჩატვირთვის შეცდომა:", err);
      }
    };


    // გალერეაში ფოტოს არჩევა და ატვირთვა R2-ში
    if (galleryInput) {
      galleryInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        uploadPhotoToR2(
          file,
          null,
          async (uploadedUrl) => {
            if (uploadedUrl) {
              try {
                await setDoc(doc(collection(db, "users", currentUser.uid, "photos")), {
                  photoUrl: uploadedUrl,
                  createdAt: serverTimestamp()
                });
                loadUserGallery(true);
              } catch (uploadErr) {
                console.error("გალერეაში ფოტოს შენახვის შეცდომა:", uploadErr);
              }
            }
          }
        );
      };
    }

    // გალერეის გაშვება
    loadUserGallery(targetUid === currentUser.uid);

    /* ==========================================================================
       რელსების ბადის ჩატვირთვა და მარჯვნიდან მარცხნივ სლაიდი
       ========================================================================== */
    const reelsGrid = document.getElementById("profileReelsGrid");
    const gridsSlider = document.getElementById("gridsSlider");
    const tabReelsBtn = document.getElementById("tabReelsBtn");
    const tabGalleryBtn = document.getElementById("tabGalleryBtn");
    const tabIndicator = document.getElementById("tabIndicator");

    // რეალური ვიდეოების წამოღება მხოლოდ ამ მომხმარებლისთვის
    const loadUserReels = async () => {
      if (!reelsGrid) return;
      reelsGrid.innerHTML = '<div class="reels-empty-grid">ვიდეოები იტვირთება...</div>';

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

        gridsSlider.classList.add("show-reels");

        if (tabIndicator) tabIndicator.style.transform = "translateX(100%)";

        loadUserReels();
      };
    }

    if (tabGalleryBtn && gridsSlider) {
      tabGalleryBtn.onclick = () => {
        document.querySelectorAll(".tt-tab-item").forEach((btn) => btn.classList.remove("active"));
        tabGalleryBtn.classList.add("active");

        gridsSlider.classList.remove("show-reels");

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
  let myFollowedSet = new Set();

  const renderUsersList = (users, currentUid) => {
    usersListContainer.innerHTML = "";

    const filtered = users.filter((u) => u.userId !== currentUid && u.uid !== currentUid);

    if (filtered.length === 0) {
      usersListContainer.innerHTML = '<div class="users-empty-state">მომხმარებელი ვერ მოიძებნა</div>';
      return;
    }

    filtered.forEach((user) => {
      const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || "მომხმარებელი";
      const usernameTag = user.username ? `@${user.username}` : (user.email ? `@${user.email.split("@")[0]}` : "@user");
      const targetId = user.userId || user.uid;

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
      const followSnap = await getDocs(collection(db, "users", currentUser.uid, "following"));
      myFollowedSet.clear();
      followSnap.forEach((docItem) => {
        const itemData = docItem.data();
        if (itemData.active !== false) {
          myFollowedSet.add(docItem.id);
        }
      });

      const snap = await getDocs(collection(db, "users"));
      allUsersList = [];
      snap.forEach((d) => {
        const uData = d.data();
        uData.userId = d.id;
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


/* ==========================================================================
   ინბოქსის ბეიჯის (წაუკითხავი შეტყობინებების) განახლება რეალურ დროში
   ========================================================================== */
onAuthStateChanged(auth, (currentUser) => {
  if (!currentUser) return;

  const badgeEl = document.getElementById("globalInboxBadge");
  if (!badgeEl) return;

  // ვუსმენთ მომხმარებლის ჩატების კოლექციას
  const chatsRef = collection(db, "users", currentUser.uid, "chats");

  onSnapshot(chatsRef, (snapshot) => {
    let unreadTotal = 0;

    snapshot.forEach((chatDoc) => {
      const data = chatDoc.data();
      // ვითვლით მხოლოდ იმ ჩატებს, რომლებშიც unreadCount > 0
      if (data.unreadCount && data.unreadCount > 0) {
        unreadTotal += data.unreadCount;
      }
    });

    if (unreadTotal > 0) {
      badgeEl.textContent = unreadTotal > 99 ? "99+" : unreadTotal;
      badgeEl.style.display = "flex";
    } else {
      badgeEl.style.display = "none";
    }
  });
});

