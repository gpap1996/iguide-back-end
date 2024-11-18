-- migrate:up
-- create the 'media_translations' table
create table media_translations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    language_id UUID NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_media_translations_updated_at BEFORE
UPDATE ON media_translations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_media_translations_updated_at ON users;
DROP TABLE IF EXISTS media_translations;