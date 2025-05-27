-- migrate:up
-- create the 'external)file_translations' table
create table external_file_translations (
    id SERIAL PRIMARY KEY,
    external_file_id INTEGER NOT NULL REFERENCES external_files(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_external_file_translations_updated_at BEFORE
UPDATE ON external_file_translations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_external_file_translations_updated_at ON external_file_translations;
DROP TABLE IF EXISTS external_file_translations;