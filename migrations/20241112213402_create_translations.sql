-- migrate:up
-- create the 'translations' table
create table translations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    entity_type TEXT NOT NULL,
    -- area, poi, trail, trail_segment etc etc
    entity_id TEXT NOT NULL,
    -- ID of the entity
    field TEXT NOT NULL,
    -- Field to be translated, e.g., title, subtitle, description
    locale TEXT REFERENCES languages(locale),
    -- required
    field_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_translations_updated_at BEFORE
UPDATE ON translations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_translations_updated_at ON users;
DROP TABLE IF EXISTS translations;