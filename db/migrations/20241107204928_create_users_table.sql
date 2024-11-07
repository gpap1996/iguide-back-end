-- migrate:up
create table users (
    id serial primary key,
    user_id varchar(255),
    username varchar(50),
    role varchar(255) not null,
    -- required
    first_name varchar(255),
    last_name varchar(255),
    email varchar(100) not null,
    -- required
    nationality varchar(255),
    country_of_residence varchar(255),
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
);
-- migrate:down