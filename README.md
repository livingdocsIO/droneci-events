# DroneCI Event Listener

An event listener for droneci < v1.0.0.
This needs an upgrade to get it to work with droneci > v1.0.0.

## Setup

```sql
CREATE OR REPLACE FUNCTION drone_notification_trigger()
RETURNS trigger AS
$BODY$
DECLARE
  payload text;
BEGIN
  if NEW.proc_name = '' then
    return NEW;
  end if;

  payload := (
    SELECT row_to_json(row)
    FROM (
      SELECT
      proc_id as id,
      CURRENT_TIMESTAMP as time,
      build_repo_id AS repo_id,
      proc_build_id as build_id,
      proc_name as name,
      proc_pid as number,
      proc_state as state
      FROM procs
      LEFT JOIN builds on (proc_build_id = build_id)
      WHERE proc_id = NEW.proc_id
     ) row
    );

  if NEW.proc_state = 'running' then
    PERFORM pg_notify('step.started', payload);
  end if;

  if NEW.proc_state = 'success' then
    PERFORM pg_notify('step.succeeded', payload);
  end if;

  if NEW.proc_state = 'error' then
    PERFORM pg_notify('step.errored', payload);
  end if;

  if NEW.proc_state = 'failure' then
    PERFORM pg_notify('step.failed', payload);
  end if;

  RETURN new;
END;
$BODY$
LANGUAGE 'plpgsql' VOLATILE COST 100;

CREATE TRIGGER drone_events_trigger AFTER INSERT OR UPDATE ON procs
FOR EACH ROW EXECUTE PROCEDURE drone_notification_trigger();
```
