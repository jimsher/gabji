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
   3. ფიდი (feed.html - FACEBOOK STYLE FEED & CREATE POST)
   ========================================================================== */
const feedContainer = document.getElementById("feedPostsContainer");

if (feedContainer) {
  const loadingIndicator = document.getElementById("feedLoadingText");
  const feedCurrentUserAvatar = document.getElementById("feedCurrentUserAvatar");
  const openPostCreatorBtn = document.getElementById("openPostCreatorBtn");
  const btnPickGalleryPhoto = document.getElementById("btnPickGalleryPhoto");
  const feedPostFileInput = document.getElementById("feedPostFileInput");
  const btnHeaderCreate = document.getElementById("btnHeaderCreate");

  let currentLoggedInUser = null;
  let currentLoggedInUserData = null;

  if (btnPickGalleryPhoto && feedPostFileInput) {
    btnPickGalleryPhoto.onclick = (e) => {
      e.stopPropagation();
      feedPostFileInput.click();
    };
  }

  const triggerPostCreation = () => {
    if (!currentLoggedInUser) {
      alert("პოსტის დასადებად გაიარეთ ავტორიზაცია");
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

      const postCaption = prompt("დაწერეთ პოსტის აღწერა:", "");
      if (postCaption === null) {
        feedPostFileInput.value = "";
        return;
      }

      const placeholderText = document.querySelector(".fb-create-placeholder");
      const originalPlaceholder = placeholderText ? placeholderText.textContent : "";
      if (placeholderText) placeholderText.textContent = "პოსტი იტვირთება...";

      uploadPhotoToR2(
        file,
        (percent) => {
          if (placeholderText) placeholderText.textContent = `იტვირთება... ${percent}%`;
        },
        async (uploadedUrl) => {
          if (uploadedUrl) {
            try {
              const authorName = currentLoggedInUserData ? 
                `${currentLoggedInUserData.firstName || ''} ${currentLoggedInUserData.lastName || ''}`.trim() || 'მომხმარებელი' : 
                'მომხმარებელი';
              const authorPhoto = currentLoggedInUserData?.photoUrl || 'icons/user-circle-linear.svg';
              const isVideo = file.type.startsWith("video/");

              const postData = {
                authorUid: currentLoggedInUser.uid,
                userId: currentLoggedInUser.uid,
                authorName: authorName,
                authorPhoto: authorPhoto,
                caption: postCaption.trim(),
                likesCount: 0,
                commentsCount: 0,
                sharesCount: 0,
                createdAt: serverTimestamp()
              };

              if (isVideo) {
                postData.videoUrl = uploadedUrl;
              } else {
                postData.photoUrl = uploadedUrl;
              }

              await setDoc(doc(collection(db, "posts")), postData);
              feedPostFileInput.value = "";
              loadFeedPosts(currentLoggedInUser.uid);
            } catch (postErr) {
              console.error("პოსტის შექმნის შეცდომა:", postErr);
              alert("პოსტის დადება ვერ მოხერხდა");
            }
          }
          if (placeholderText) placeholderText.textContent = originalPlaceholder;
        }
      );
    };
  }

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

      // შეცდომის თავიდან ასაცილებლად: ვიღებთ პოსტებს და კოდში ვალაგებთ დროით
      let postsSnap = await getDocs(collection(db, "posts"));
      let allPosts = [];

      postsSnap.forEach((d) => allPosts.push({ id: d.id, ...d.data() }));

      if (allPosts.length === 0) {
        const reelsSnap = await getDocs(collection(db, "reels"));
        reelsSnap.forEach((d) => allPosts.push({ id: d.id, ...d.data() }));
      }

      // დალაგება უახლესის მიხედვით
      allPosts.sort((a, b) => {
        const tA = a.createdAt?.seconds || 0;
        const tB = b.createdAt?.seconds || 0;
        return tB - tA;
      });

      if (allPosts.length === 0) {
        if (loadingIndicator) loadingIndicator.textContent = "პოსტები არ არის";
        return;
      }

      if (loadingIndicator) loadingIndicator.remove();
      feedContainer.innerHTML = "";

      for (const post of allPosts) {
        const postId = post.id;
        const authorUid = post.authorUid || post.userId;

        let authorName = post.authorName || "მომხმარებელი";
        let authorPhoto = post.authorPhoto || "icons/user-circle-linear.svg";

        if (authorUid) {
          try {
            const userSnap = await getDoc(doc(db, "users", authorUid));
            if (userSnap.exists()) {
              const u = userSnap.data();
              authorName = `${u.firstName || ''} ${u.lastName || ''}`.trim() || authorName;
              if (u.photoUrl) authorPhoto = u.photoUrl;
            }
          } catch (_) {}
        }

        const isMe = currentUid && (currentUid === authorUid);
        const isFollowed = followedSet.has(authorUid);

        const followHtml = (!isMe && !isFollowed && authorUid) ? `
          <span class="fb-bullet">·</span>
          <button type="button" class="fb-follow-link" data-uid="${authorUid}">გამოწერა</button>
        ` : '';

        let mediaBoxHtml = "";
        if (post.videoUrl) {
          mediaBoxHtml = `
            <div class="fb-media-box">
              <video src="${post.videoUrl}" class="fb-media-item" loop muted playsinline autoplay></video>
              <button type="button" class="fb-mute-btn" aria-label="Audio">
                <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              </button>
            </div>
          `;
        } else if (post.photoUrl) {
          mediaBoxHtml = `
            <div class="fb-media-box">
              <img src="${post.photoUrl}" class="fb-media-item" alt="Photo" loading="lazy">
            </div>
          `;
        }

        const card = document.createElement("article");
        card.className = "fb-card";
        card.id = `fb_post_${postId}`;

        card.innerHTML = `
          <div class="fb-header">
            <div class="fb-header-left">
              <img src="${authorPhoto}" class="fb-avatar" alt="${authorName}" onclick="window.location.href='profile.html?uid=${authorUid}'">
              <div class="fb-user-details">
                <div class="fb-name-row">
                  <span class="fb-user-name" onclick="window.location.href='profile.html?uid=${authorUid}'">${authorName}</span>
                  ${followHtml}
                </div>
                <div class="fb-meta-sub">
                  <span>1 დღე</span>
                  <span>·</span>
                  <svg class="fb-globe-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
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

          <div class="fb-caption">
            <span>${post.caption || post.text || ''}</span>
            <span class="fb-see-more-link">სხვა</span>
          </div>

          ${mediaBoxHtml}

          <div class="fb-footer-bar">
            <button type="button" class="fb-action-btn btn-fb-like" data-id="${postId}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" fill="#65676b"/>
              </svg>
              <span class="fb-like-count">${post.likesCount || post.likes || 0}</span>
            </button>

            <button type="button" class="fb-action-btn btn-fb-comment" data-id="${postId}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" fill="#65676b"/>
              </svg>
              <span>${post.commentsCount || 0}</span>
            </button>

            <button type="button" class="fb-action-btn btn-fb-share">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92c0-1.61-1.31-2.92-2.92-2.92z" fill="#65676b"/>
              </svg>
              <span>${post.sharesCount || 0}</span>
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
              await setDoc(doc(db, "users", currentUid, "following", authorUid), {
                followedUid: authorUid,
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
          let currentLikes = parseInt(countSpan.textContent) || 0;

          if (!isLiked) {
            btnLike.classList.add("liked");
            countSpan.textContent = currentLikes + 1;
            await updateDoc(doc(db, "posts", postId), { likesCount: increment(1) }).catch(async () => {
              await updateDoc(doc(db, "reels", postId), { likesCount: increment(1) }).catch(() => {});
            });
          } else {
            btnLike.classList.remove("liked");
            countSpan.textContent = Math.max(0, currentLikes - 1);
            await updateDoc(doc(db, "posts", postId), { likesCount: increment(-1) }).catch(async () => {
              await updateDoc(doc(db, "reels", postId), { likesCount: increment(-1) }).catch(() => {});
            });
          }
        };

        const muteBtn = card.querySelector(".fb-mute-btn");
        const vid = card.querySelector("video");
        if (muteBtn && vid) {
          muteBtn.onclick = () => {
            vid.muted = !vid.muted;
            muteBtn.innerHTML = vid.muted
              ? `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`
              : `<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
          };
        }

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

