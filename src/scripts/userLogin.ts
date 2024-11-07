import "dotenv/config";
import firebaseAuth from "../firebaseAuth";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";

// client SDK
const firebaseApp = initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
});

const auth = getAuth(firebaseApp);

(async () => {
  const user = await firebaseAuth.getUserByEmail(process.env.TEST_USER_EMAIL!);

  const customToken = await firebaseAuth.createCustomToken(user.uid);

  const { user: loggedInUser } = await signInWithCustomToken(auth, customToken);

  const jwt = await loggedInUser.getIdToken();

  console.log(jwt);
})();
