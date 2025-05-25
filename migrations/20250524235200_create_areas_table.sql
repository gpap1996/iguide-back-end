-- migrate:up
-- Enable the uuid-ossp extension (required for UUID generation)
-- Create the 'areas' table
CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER,
    weight INTEGER DEFAULT 0,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
-- Attach the trigger function to the 'areas' table
CREATE TRIGGER update_areas_updated_at BEFORE
UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_areas_updated_at ON areas;
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE IF EXISTS areas;