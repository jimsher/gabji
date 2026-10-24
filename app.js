import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc,
  setDoc, 
  collection, 
  getDocs, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// შენი ორიგინალი Firebase კონფიგურაცია
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

// მოდალის გარეთ დაკლიკებისას დახურვა
window.addEventListener("click", (e) => {
  if (loginModal && e.target === loginModal) {
    loginModal.style.display = "none";
  }
});

// Email & პაროლით შესვლა
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

// Google-ით შესვლა
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
   2. რეგისტრაცია და მონაცემების შენახვა (signup.html & Firestore)
   ========================================================================== */

// ინტერესების ტეგების მონიშვნა
const interestBtns = document.querySelectorAll(".interest-pill");
interestBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.classList.toggle("active");
  });
});

// ფოტოს არჩევა (Base64-ის გარეშე)
const userPhotoInput = document.getElementById("userPhoto");
const uploadCard = document.getElementById("uploadCard");
const uploadLabel = document.getElementById("uploadLabel");

if (uploadCard && userPhotoInput) {
  uploadCard.addEventListener("click", () => userPhotoInput.click());
  userPhotoInput.addEventListener("change", () => {
    if (userPhotoInput.files && userPhotoInput.files[0]) {
      const file = userPhotoInput.files[0];
      if (uploadLabel) uploadLabel.textContent = "არჩეულია: " + file.name;
    }
  });
}

// ფორმის გაგზავნა
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
    const phone = document.getElementById("regPhone")?.value.trim() || "";

    // მონიშნული ინტერესების ამოღება
    const selectedInterests = [];
    document.querySelectorAll(".interest-pill.active").forEach((tag) => {
      selectedInterests.push(tag.textContent.trim());
    });

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerText = "რეგისტრაცია მიმდინარეობს...";
    }

    try {
      // 1. იქმნება იუზერი Firebase Authentication-ში
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. მონაცემები იწერება Firestore ბაზაში 'users' კოლექციაში
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        firstName: firstName,
        lastName: lastName,
        birthDate: birthDate,
        country: country,
        city: city,
        email: email,
        phone: phone,
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
        submitBtn.innerText = "შესვლა";
      }
    }
  });
}

/* ==========================================================================
   3. ფიდზე მონაცემების წამოღება (FEED.HTML & FIRESTORE)
   ========================================================================== */
const cardTitle = document.querySelector(".card-user-title");

if (cardTitle) {
  let feedProfiles = [];
  let currentCardIndex = 0;

  // ასაკის დათვლა
  const calculateAge = (dateStr) => {
    if (!dateStr) return "";
    const birth = new Date(dateStr);
    const diff = Date.now() - birth.getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  // ბარათზე მონაცემების გამოჩენა
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

    // სახელი და ასაკი
    if (nameEl) {
      nameEl.textContent = `${item.firstName || ""} ${item.lastName || ""}${age ? ", " + age : ""}`.trim();
    }

    // ლოკაცია (ქალაქი, ქვეყანა)
    if (locEl) {
      const fullLoc = [item.city, item.country].filter(Boolean).join(", ");
      locEl.textContent = fullLoc ? `📍 ${fullLoc}` : "";
    }

    // ტელეფონი / კონტაქტი
    if (bioEl) {
      bioEl.textContent = item.phone ? `📞 ${item.phone}` : (item.email || "");
    }

    // ინტერესების ტეგები
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

    // ფოტო
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

  // ბაზიდან წამოღება
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

  // Like და Pass ღილაკებით შემდეგ მომხმარებელზე გადასვლა
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

  // მონაცემების წამოღების გაშვება
  getProfilesFromDb();
}

/* ==========================================================================
   4. პროფილის მონაცემების წამოღება (PROFILE.HTML & FIRESTORE)
   ========================================================================== */
const profileNameEl = document.getElementById("profileName");

if (profileNameEl) {
  // ასაკის დათვლა პროფილისთვის
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

    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        const age = getAge(data.birthDate);

        // სახელი და ასაკი
        profileNameEl.textContent = `${data.firstName || ""} ${data.lastName || ""}${age ? ", " + age : ""}`.trim() || "მომხმარებელი";

        // ლოკაცია
        const distEl = document.getElementById("profileDistance");
        if (distEl) {
          const locParts = [data.city, data.country].filter(Boolean).join(", ");
          distEl.textContent = locParts ? `📍 ${locParts}` : "ლოკაცია მითითებული არ არის";
        }

        // ბიო / კონტაქტი
        const bioEl = document.getElementById("profileBio");
        if (bioEl) {
          bioEl.textContent = data.phone ? `📞 ${data.phone}` : (data.email || "");
        }

        // ავატარის ფოტო
        const avatarImg = document.getElementById("profileMainAvatar");
        const avatarSvg = document.getElementById("profileAvatarPlaceholder");

        if (data.photoUrl) {
          if (avatarImg) {
            avatarImg.src = data.photoUrl;
            avatarImg.style.display = "block";
          }
          if (avatarSvg) {
            avatarSvg.style.display = "none";
          }
        } else {
          if (avatarImg) avatarImg.style.display = "none";
          if (avatarSvg) avatarSvg.style.display = "block";
        }
      } else {
        profileNameEl.textContent = "პროფილი ვერ მოიძებნა";
      }
    } catch (err) {
      console.error("პროფილის ჩატვირთვის შეცდომა:", err);
      profileNameEl.textContent = "შეცდომა ჩატვირთვისას";
    }
  });
}
