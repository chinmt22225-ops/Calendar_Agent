from pathlib import Path


def test_chat_request_fingerprint_belongs_to_operation_table():
    schema = (Path(__file__).parents[2] / "supabase" / "schema.sql").read_text(encoding="utf-8")
    chat_table = schema.split("create table if not exists public.chat_messages", 1)[1].split(");", 1)[0]
    operation_table = schema.split("create table if not exists public.ai_chat_operations", 1)[1].split(");", 1)[0]
    assert "request_fingerprint" not in chat_table
    assert "request_fingerprint" in operation_table


def test_rate_limit_function_does_not_shadow_current_time_keyword():
    schema = (Path(__file__).parents[2] / "supabase" / "schema.sql").read_text(encoding="utf-8")
    function = schema.split("create or replace function public.consume_api_rate_limit", 1)[1]
    assert "current_time timestamptz" not in function
    assert "current_timestamp_value timestamptz" in function


def test_fresh_schema_contains_atomic_event_mutation_contract():
    schema = (Path(__file__).parents[2] / "supabase" / "schema.sql").read_text(encoding="utf-8")
    assert "pg_advisory_xact_lock" in schema
    assert "create_calendar_event_atomic" in schema
    assert "update_calendar_event_atomic" in schema
    assert "restore_calendar_event_atomic" in schema
    assert "create_calendar_events_atomic" in schema
