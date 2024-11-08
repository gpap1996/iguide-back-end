-- migrate:up
-- Create users table
create table users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT,
    role TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    email CITEXT UNIQUE NOT NULL,
    nationality TEXT,
    country_of_residence TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Attach the trigger function to the users table
CREATE TRIGGER update_users_updated_at BEFORE
UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE IF EXISTS users;