-- migrate:up
-- create the 'area_translations' table
create table area_translations (
    id SERIAL PRIMARY KEY,
    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    language_id INTEGER NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    title TEXT,
    subtitle TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_area_translations_updated_at BEFORE
UPDATE ON area_translations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_area_translations_updated_at ON users;
DROP TABLE IF EXISTS area_translations;