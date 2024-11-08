import "dotenv/config";
import firebaseAuth from "../firebaseAuth";
import { db } from "../database";

async function createUserWithRoleAndSaveToDB(email: string, password: string) {
  try {
    const userRecord = await firebaseAuth.createUser({
      email,
      password,
    });

    console.log("Successfully created new user in Firebase:", userRecord.uid);

    // Step 2: Set custom claims (role: "admin", userWritten: true)
    await firebaseAuth.setCustomUserClaims(userRecord.uid, {
      role: "admin",
      userWritten: true,
    });

    console.log(
      "Custom claims set successfully for Firebase user:",
      userRecord.uid
    );

    const newUser = {
      id: userRecord.uid,
      username: "gpap",
      nationality: "Greece",
      country_of_residence: "Greece",
      email: userRecord.email!,
      role: "admin",
      first_name: "Giorgos",
      last_name: "Papapanos",
    };

    const insertedUser = await db
      .insertInto("users")
      .values(newUser)
      .returningAll()
      .executeTakeFirstOrThrow();

    return insertedUser;
  } catch (error) {
    console.error("Error creating user or setting custom claims:", error);
    throw new Error("Failed to create user or set claims");
  }
}

const email = "g.papapanos1996@gmail.com";
const password = "asdf1958";

createUserWithRoleAndSaveToDB(email, password)
  .then((user) => {
    console.log("User created and written to database:", user);
  })
  .catch((err) => {
    console.error("Error:", err);
  });
