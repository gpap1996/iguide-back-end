-- migrate:up
-- Create the 'files' table
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    thumbnail_path TEXT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
-- Create index for faster lookups
CREATE INDEX idx_files_project_id ON files(project_id);
-- Attach the trigger function to the 'files' table
CREATE TRIGGER update_files_updated_at BEFORE
UPDATE ON files FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_files_updated_at ON files;
DROP INDEX IF EXISTS idx_files_project_id;
DROP TABLE IF EXISTS files;