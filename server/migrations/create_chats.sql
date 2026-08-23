/*
  Supabase schema for chat functionality used by the patient dashboard.
  Two tables are created:
    - chat_rooms: represents a conversation between a patient and a staff member (or group).
    - chat_messages: stores individual messages belonging to a chat room.

  Both tables reference the existing `users` and `patients` tables.
*/

-- Chat rooms table
create table chat_rooms (
  id            uuid primary key default uuid_generate_v4(),
  patient_id    uuid references patients(id) on delete cascade,
  created_by    uuid references users(id) on delete set null,
  title         text not null default 'Chat',
  created_at    timestamp with time zone default now(),
  updated_at    timestamp with time zone default now()
);

-- Chat messages table
create table chat_messages (
  id            uuid primary key default uuid_generate_v4(),
  room_id       uuid references chat_rooms(id) on delete cascade,
  sender_id     uuid references users(id) on delete set null,
  content       text not null,
  sent_at       timestamp with time zone default now(),
  is_read       boolean default false
);

-- Disable RLS for quick testing (remove in production)
alter table chat_rooms    disable row level security;
alter table chat_messages disable row level security;
