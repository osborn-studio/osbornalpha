-- Independent anchor checkpoint registry (ADR 2026-10-18 §4, candidate C1).
-- Install ONCE in a dedicated database on the Shanghai managed PostgreSQL instance, as the
-- NOLOGIN schema owner alpha_checkpoint_owner (SET ROLE from an administrator session).
-- Pre-create alpha_checkpoint_client NOLOGIN; the runner login may inherit only that role.
-- Not an Alpha migration. Never restore this database together with the Alpha database or
-- the Brain host. The registry holds hashes, sequences and generations only.
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolsuper OR rolcanlogin)) THEN
  RAISE EXCEPTION 'install as non-login, non-superuser schema owner';
 END IF;
END $$;
CREATE SCHEMA anchor_private;
REVOKE ALL ON SCHEMA anchor_private FROM PUBLIC;

CREATE TABLE anchor_private.registry (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 registry_id uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO anchor_private.registry (singleton) VALUES (true);

CREATE TABLE anchor_private.identities (
 database_identity uuid PRIMARY KEY,
 store_id uuid NOT NULL UNIQUE,
 generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE anchor_private.generations (
 database_identity uuid NOT NULL REFERENCES anchor_private.identities (database_identity),
 generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
 reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 200),
 advanced_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (database_identity, generation)
);
CREATE TABLE anchor_private.checkpoints (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL,
 database_identity uuid NOT NULL REFERENCES anchor_private.identities (database_identity),
 owner_scope_hash text NOT NULL CHECK (owner_scope_hash ~ '^[0-9a-f]{64}$'),
 store_id uuid NOT NULL,
 last_sequence bigint NOT NULL CHECK (last_sequence BETWEEN 1 AND 9007199254740991),
 last_hash text NOT NULL CHECK (last_hash ~ '^[0-9a-f]{64}$'),
 generation bigint NOT NULL CHECK (generation BETWEEN 1 AND 9007199254740991),
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (database_identity, owner_scope_hash, request_id)
);
CREATE INDEX checkpoints_latest ON anchor_private.checkpoints (database_identity, owner_scope_hash, last_sequence DESC, id DESC);

-- History is append-only for everyone, including the schema owner.
CREATE FUNCTION anchor_private.append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'append_only' USING ERRCODE = '42501'; END $$;
CREATE TRIGGER checkpoints_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON anchor_private.checkpoints FOR EACH STATEMENT EXECUTE FUNCTION anchor_private.append_only();
CREATE TRIGGER generations_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON anchor_private.generations FOR EACH STATEMENT EXECUTE FUNCTION anchor_private.append_only();
CREATE TRIGGER registry_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON anchor_private.registry FOR EACH STATEMENT EXECUTE FUNCTION anchor_private.append_only();

CREATE FUNCTION anchor_private.durability_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, anchor_private, pg_temp AS $$
 SELECT current_setting('fsync') = 'on' AND current_setting('full_page_writes') = 'on' AND NOT pg_is_in_recovery()
$$;

-- Operator only (no EXECUTE for the client): first registration binds identity to store and generation.
CREATE FUNCTION anchor_private.register_identity(p_identity uuid, p_store uuid, p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, anchor_private, pg_temp AS $$
DECLARE existing anchor_private.identities%ROWTYPE;
BEGIN
 IF p_identity IS NULL OR p_store IS NULL OR p_generation IS NULL OR p_generation < 1 THEN RAISE EXCEPTION 'invalid_schema' USING ERRCODE = '22023'; END IF;
 SELECT * INTO existing FROM anchor_private.identities WHERE database_identity = p_identity FOR UPDATE;
 IF FOUND THEN
  IF existing.store_id <> p_store THEN RAISE EXCEPTION 'anchor_store_mismatch' USING ERRCODE = '42501'; END IF;
  IF existing.generation <> p_generation THEN RAISE EXCEPTION 'anchor_generation_fenced' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('registered', false, 'generation', existing.generation);
 END IF;
 INSERT INTO anchor_private.identities (database_identity, store_id, generation) VALUES (p_identity, p_store, p_generation);
 INSERT INTO anchor_private.generations (database_identity, generation, reason) VALUES (p_identity, p_generation, 'registered');
 RETURN jsonb_build_object('registered', true, 'generation', p_generation);
END $$;

-- Operator only: advance the deployment generation first here, then in the journal, then in Alpha.
CREATE FUNCTION anchor_private.advance_generation(p_identity uuid, p_new bigint, p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, anchor_private, pg_temp AS $$
DECLARE existing anchor_private.identities%ROWTYPE;
BEGIN
 SELECT * INTO existing FROM anchor_private.identities WHERE database_identity = p_identity FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'anchor_identity_unregistered' USING ERRCODE = '42501'; END IF;
 IF p_new IS NULL OR p_new <= existing.generation THEN RAISE EXCEPTION 'anchor_generation_fenced' USING ERRCODE = '42501'; END IF;
 INSERT INTO anchor_private.generations (database_identity, generation, reason) VALUES (p_identity, p_new, coalesce(p_reason, 'advanced'));
 UPDATE anchor_private.identities SET generation = p_new WHERE database_identity = p_identity;
 RETURN jsonb_build_object('generation', p_new, 'previous', existing.generation);
END $$;

CREATE FUNCTION anchor_private.identity_state(p_identity uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, anchor_private, pg_temp AS $$
DECLARE existing anchor_private.identities%ROWTYPE;
BEGIN
 SELECT * INTO existing FROM anchor_private.identities WHERE database_identity = p_identity;
 IF NOT FOUND THEN RAISE EXCEPTION 'anchor_identity_unregistered' USING ERRCODE = '42501'; END IF;
 RETURN jsonb_build_object('database_identity', existing.database_identity, 'store_id', existing.store_id,
  'generation', existing.generation, 'durability_ready', anchor_private.durability_ready());
END $$;

CREATE FUNCTION anchor_private.latest_checkpoint(p_identity uuid, p_owner text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, anchor_private, pg_temp AS $$
DECLARE latest anchor_private.checkpoints%ROWTYPE;
BEGIN
 IF p_owner !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_schema' USING ERRCODE = '22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anchor_private.identities WHERE database_identity = p_identity) THEN RAISE EXCEPTION 'anchor_identity_unregistered' USING ERRCODE = '42501'; END IF;
 SELECT * INTO latest FROM anchor_private.checkpoints WHERE database_identity = p_identity AND owner_scope_hash = p_owner ORDER BY last_sequence DESC, id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('last_sequence', latest.last_sequence::text, 'last_hash', latest.last_hash, 'generation', latest.generation,
  'store_id', latest.store_id, 'confirmed_at', latest.confirmed_at);
END $$;

-- Confirm one checkpoint. Idempotent per request id and per (sequence, hash); never backwards;
-- fenced by generation; refused when the server cannot promise durability.
CREATE FUNCTION anchor_private.confirm_checkpoint(p_request uuid, p_identity uuid, p_owner text, p_store uuid, p_sequence bigint, p_hash text, p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, anchor_private, pg_temp AS $$
DECLARE existing anchor_private.identities%ROWTYPE; same anchor_private.checkpoints%ROWTYPE; latest anchor_private.checkpoints%ROWTYPE; inserted anchor_private.checkpoints%ROWTYPE;
BEGIN
 IF p_request IS NULL OR p_identity IS NULL OR p_store IS NULL OR p_sequence IS NULL OR p_sequence < 1 OR p_generation IS NULL OR p_generation < 1
    OR p_owner !~ '^[0-9a-f]{64}$' OR p_hash !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'invalid_schema' USING ERRCODE = '22023';
 END IF;
 IF NOT anchor_private.durability_ready() THEN RAISE EXCEPTION 'durability unavailable' USING ERRCODE = '58000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_identity::text || ':' || p_owner, 0));
 SELECT * INTO existing FROM anchor_private.identities WHERE database_identity = p_identity;
 IF NOT FOUND THEN RAISE EXCEPTION 'anchor_identity_unregistered' USING ERRCODE = '42501'; END IF;
 IF existing.store_id <> p_store THEN RAISE EXCEPTION 'anchor_store_mismatch' USING ERRCODE = '42501'; END IF;
 IF existing.generation <> p_generation THEN RAISE EXCEPTION 'anchor_generation_fenced' USING ERRCODE = '42501'; END IF;
 SELECT * INTO same FROM anchor_private.checkpoints WHERE database_identity = p_identity AND owner_scope_hash = p_owner AND request_id = p_request;
 IF FOUND THEN
  IF same.last_sequence <> p_sequence OR same.last_hash <> p_hash OR same.store_id <> p_store THEN RAISE EXCEPTION 'anchor_request_conflict'; END IF;
  RETURN jsonb_build_object('checkpoint_id', same.id::text, 'confirmed_at', same.confirmed_at, 'duplicate', true, 'last_sequence', same.last_sequence::text, 'generation', same.generation);
 END IF;
 SELECT * INTO latest FROM anchor_private.checkpoints WHERE database_identity = p_identity AND owner_scope_hash = p_owner ORDER BY last_sequence DESC, id DESC LIMIT 1;
 IF FOUND THEN
  IF latest.last_sequence > p_sequence THEN RAISE EXCEPTION 'anchor_checkpoint_regression'; END IF;
  IF latest.last_sequence = p_sequence THEN
   IF latest.last_hash <> p_hash THEN RAISE EXCEPTION 'anchor_hash_conflict'; END IF;
   RETURN jsonb_build_object('checkpoint_id', latest.id::text, 'confirmed_at', latest.confirmed_at, 'duplicate', true, 'last_sequence', latest.last_sequence::text, 'generation', latest.generation);
  END IF;
 END IF;
 INSERT INTO anchor_private.checkpoints (request_id, database_identity, owner_scope_hash, store_id, last_sequence, last_hash, generation)
  VALUES (p_request, p_identity, p_owner, p_store, p_sequence, p_hash, p_generation) RETURNING * INTO inserted;
 RETURN jsonb_build_object('checkpoint_id', inserted.id::text, 'confirmed_at', inserted.confirmed_at, 'duplicate', false, 'last_sequence', inserted.last_sequence::text, 'generation', inserted.generation);
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA anchor_private FROM PUBLIC, alpha_checkpoint_client;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA anchor_private FROM PUBLIC, alpha_checkpoint_client;
GRANT USAGE ON SCHEMA anchor_private TO alpha_checkpoint_client;
GRANT EXECUTE ON FUNCTION anchor_private.identity_state(uuid), anchor_private.latest_checkpoint(uuid, text),
 anchor_private.confirm_checkpoint(uuid, uuid, text, uuid, bigint, text, bigint) TO alpha_checkpoint_client;
COMMIT;
