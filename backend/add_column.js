const db = require("./models");

async function addColumn() {
  try {
    await db.sequelize.query(
      'ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS profile_picture TEXT;'
    );
    console.log("Column profile_picture added successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error adding column:", error.message);
    process.exit(1);
  }
}

addColumn();
