-- migrate:up
-- Create the 'media' table
CREATE TABLE IF NOT EXISTS media (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
-- Attach the trigger function to the 'media' table
CREATE TRIGGER update_media_updated_at BEFORE
UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_media_updated_at ON media;
DROP TABLE IF EXISTS media;