import "dotenv/config";
import firebaseAuth from "../firebaseAuth";
import { db } from "../db";
import { users } from "../db/schema/users";

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
      username: "testadmin",
      role: "admin",
      firstName: "Test",
      lastName: "Admin",
      email: userRecord.email!,
      nationality: "Greece",
      countryOfResidence: "Greece",
    };

    const insertedUser = await db.insert(users).values(newUser).returning();

    return insertedUser;
  } catch (error) {
    console.error("Error creating user or setting custom claims:", error);
    throw new Error("Failed to create user or set claims");
  }
}

const email = "testadmin@test.com";
const password = "asdf1958";

createUserWithRoleAndSaveToDB(email, password)
  .then((user) => {
    console.log("User created and written to database:", user);
  })
  .catch((err) => {
    console.error("Error:", err);
  });
