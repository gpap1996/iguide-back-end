-- migrate:up
-- create the 'file_translations' table
create table file_translations (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_file_translations_updated_at BEFORE
UPDATE ON file_translations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_file_translations_updated_at ON users;
DROP TABLE IF EXISTS file_translations;