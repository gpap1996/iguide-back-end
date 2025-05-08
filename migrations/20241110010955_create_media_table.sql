-- migrate:up
-- Create the 'media' table
CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
-- Attach the trigger function to the 'media' table
CREATE TRIGGER update_media_updated_at BEFORE
UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_media_updated_at ON media;
DROP TABLE IF EXISTS media;