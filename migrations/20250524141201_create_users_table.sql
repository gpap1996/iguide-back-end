-- migrate:up
-- Create users table
create table users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT,
    role TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email CITEXT UNIQUE NOT NULL,
    nationality TEXT,
    country_of_residence TEXT,
    project_id INTEGER REFERENCES projects(id) ON DELETE
    SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Create index for faster lookups
CREATE INDEX idx_users_project_id ON users(project_id);
-- Attach the trigger function to the users table
CREATE TRIGGER update_users_updated_at BEFORE
UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP INDEX IF EXISTS idx_users_project_id;
DROP TABLE IF EXISTS users;