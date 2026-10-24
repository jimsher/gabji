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
  setDoc, 
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

// თუ მომხმარებელი უკვე ავტორიზებულია, გადადის feed.html-ზე (თუ signup-ზე არ არის)
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (!window.location.pathname.includes("signup.html")) {
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

// ფოტოს არჩევა და Base64-ში გადაყვანა
let userPhotoBase64 = "";
const userPhotoInput = document.getElementById("userPhoto");
const uploadCard = document.getElementById("uploadCard");
const uploadLabel = document.getElementById("uploadLabel");

if (uploadCard && userPhotoInput) {
  uploadCard.addEventListener("click", () => userPhotoInput.click());
  userPhotoInput.addEventListener("change", () => {
    if (userPhotoInput.files && userPhotoInput.files[0]) {
      const file = userPhotoInput.files[0];
      if (uploadLabel) uploadLabel.textContent = "არჩეულია: " + file.name;

      const reader = new FileReader();
      reader.onload = (e) => {
        userPhotoBase64 = e.target.result;
      };
      reader.readAsDataURL(file);
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
        photoUrl: userPhotoBase64 || null,
        interests: selectedInterests,
        createdAt: serverTimestamp()
      });

      alert("რეგისტრაცია წარმატებით დასრულდა!");
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
