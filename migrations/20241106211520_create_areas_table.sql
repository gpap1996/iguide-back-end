-- migrate:up
-- Enable the uuid-ossp extension (required for UUID generation)
-- Create extensions outside of any transaction block
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS unaccent;
-- Create the 'areas' table
CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER,
  weight INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT current_timestamp,
  updated_at TIMESTAMP DEFAULT current_timestamp
);
-- Create a trigger function to update updated_at on each update. This can be reused for other tables.
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Attach the trigger function to the 'areas' table
CREATE TRIGGER update_areas_updated_at BEFORE
UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_areas_updated_at ON areas;
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE IF EXISTS areas;
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS unaccent;