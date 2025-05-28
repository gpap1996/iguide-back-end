-- migrate:up
-- Create the 'external_files' table
CREATE TABLE IF NOT EXISTS external_files (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
-- Create index for faster lookups
CREATE INDEX idx_external_files_project_id ON external_files(project_id);
-- Attach the trigger function to the 'external_files' table
CREATE TRIGGER update_external_files_updated_at BEFORE
UPDATE ON external_files FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_external_files_updated_at ON external_files;
DROP INDEX IF EXISTS idx_external_files_project_id;
DROP TABLE IF EXISTS external_files;