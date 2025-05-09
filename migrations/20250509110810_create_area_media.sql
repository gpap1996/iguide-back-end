-- migrate:up
-- create the 'area_media' table
create table area_media (
    id SERIAL PRIMARY KEY,
    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_area_media_updated_at BEFORE
UPDATE ON area_media FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_area_media_updated_at ON users;
DROP TABLE IF EXISTS area_media;