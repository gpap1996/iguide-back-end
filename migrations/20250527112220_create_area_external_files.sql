-- migrate:up
-- create the 'area_external_files' table
create table area_external_files (
    id SERIAL PRIMARY KEY,
    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    external_file_id INTEGER NOT NULL REFERENCES external_files(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT current_timestamp,
    updated_at TIMESTAMP DEFAULT current_timestamp
);
CREATE TRIGGER update_area_external_files_updated_at BEFORE
UPDATE ON area_external_files FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_area_external_files_updated_at ON users;
DROP TABLE IF EXISTS area_external_files;