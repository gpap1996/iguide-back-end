-- migrate:up
create table areas (
  id serial primary key,
  title varchar(255) not null, -- required
  description text not null, -- required
  parent_id integer, -- null for areas, integer for subareas
  weight integer default 0, -- default 0
  created_at timestamp default current_timestamp,
  updated_at timestamp default current_timestamp
);

-- migrate:down

