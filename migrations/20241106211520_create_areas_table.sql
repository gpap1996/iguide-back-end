-- migrate:up
-- Enable the uuid-ossp extension (required for UUID generation)
-- Create extensions outside of any transaction block
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS citext;
-- Create the 'areas' table
CREATE TABLE IF NOT EXISTS areas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title CITEXT UNIQUE NOT NULL,
  description CITEXT UNIQUE NOT NULL,
  parent_id TEXT,
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
-- Drop the trigger and function for cleanup
DROP TRIGGER IF EXISTS update_areas_updated_at ON areas;
DROP FUNCTION IF EXISTS update_updated_at;
-- Drop the 'areas' table
DROP TABLE IF EXISTS areas;