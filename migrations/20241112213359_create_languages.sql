-- migrate:up
-- create the 'languages' table
create table languages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    locale TEXT NOT NULL,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
);
CREATE TRIGGER update_languages_updated_at BEFORE
UPDATE ON languages FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- migrate:down
DROP TRIGGER IF EXISTS update_languages_updated_at ON users;
DROP TABLE IF EXISTS languages;