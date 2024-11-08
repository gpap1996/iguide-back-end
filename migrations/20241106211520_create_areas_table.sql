-- migrate:up
create table areas (
  id serial primary key,
  title varchar(255) not null,
  -- required
  description text not null,
  -- required
  parent_id integer,
  -- null for areas, integer for subareas
  weight integer default 0,
  -- default 0
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);
-- Create a trigger function to update updated_at on each update. This can be reused for other tables.
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
-- Attach the trigger function to the areas table
CREATE TRIGGER update_areas_updated_at BEFORE
UPDATE ON areas FOR EACH ROW EXECUTE FUNCTION update_updated_at();
$$ LANGUAGE plpgsql;
-- migrate:down
DROP TRIGGER IF EXISTS update_areas_updated_at ON areas;
DROP FUNCTION IF EXISTS update_updated_at();
DROP TABLE IF EXISTS areas;