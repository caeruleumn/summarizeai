create table if not exists pdf_files (
    id uuid primary key,
    original_name text not null,
    stored_path text not null,
    size_bytes bigint not null,
    mime_type text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
);

create table if not exists pdf_summaries (
    id uuid primary key,
    pdf_id uuid not null references pdf_files(id) on delete cascade,
    summary_text text,
    status text not null,
    process_time_ms integer,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (pdf_id)
);
