#!/usr/bin/env bash
# Purpose: Inspect or recover one interrupted production deployment from its recorded remote state.
# Owner: project-skill:ai-life-sim
# Responsibility: Remote recovery-state inspection and deterministic rollback or completion only.

set -Eeuo pipefail

mode="$1"
lock_file=/run/lock/ai-life-sim-deploy.lock
state_root=/root/ai-life-sim-deploy-state
memory_root=/var/lib/ai-life-sim/narrative-memory
round_root=/var/log/ai-life-sim/narrative-rounds

cleanup_recovery_input() {
  if [[ "$0" =~ ^/tmp/ai-life-sim-recover-[0-9a-f]{32}\.sh$ ]]; then
    rm -f -- "$0"
  fi
}
trap cleanup_recovery_input EXIT

for required_command in flock grep sed stat readlink sha256sum; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "RECOVERY_PREREQUISITE_MISSING $required_command" >&2
    exit 69
  }
done
exec 9>"$lock_file"
if flock -w 900 9; then
  :
else
  lock_status=$?
  if [ "$lock_status" -eq 1 ]; then echo 'RECOVERY_LOCK_TIMEOUT' >&2; fi
  exit "$lock_status"
fi

list_unresolved() {
  local candidate status run_id recovery_script recovery_sha256
  local -a status_lines schema_lines recovery_script_lines recovery_sha256_lines
  local count=0
  shopt -s nullglob
  for candidate in "$state_root"/*.state; do
    run_id="${candidate##*/}"
    run_id="${run_id%.state}"
    if [[ ! "$run_id" =~ ^[0-9a-f]{32}$ ]] ||
       [ ! -f "$candidate" ] ||
       [ "$(stat -c %u:%a "$candidate" 2>/dev/null || true)" != '0:600' ]; then
      printf 'UNRESOLVED run_id=UNKNOWN status=CORRUPT state=%s\n' "$candidate"
      count=$((count + 1))
      continue
    fi
    mapfile -t status_lines < <(sed -n 's/^status=//p' "$candidate")
    if [ "${#status_lines[@]}" -ne 1 ]; then
      printf 'UNRESOLVED run_id=%s status=CORRUPT state=%s\n' "$run_id" "$candidate"
      count=$((count + 1))
      continue
    fi
    status="${status_lines[0]}"
    case "$status" in
      RUNNING_*|ROLLBACK_FAILED|RECOVERY_ROLLBACK_FAILED)
        mapfile -t schema_lines < <(sed -n 's/^state_schema=//p' "$candidate")
        mapfile -t recovery_script_lines < <(sed -n 's/^recovery_script=//p' "$candidate")
        mapfile -t recovery_sha256_lines < <(sed -n 's/^recovery_sha256=//p' "$candidate")
        recovery_script="$state_root/$run_id.recover.sh"
        if [ "${#schema_lines[@]}" -ne 1 ] || [ "${schema_lines[0]}" != 2 ] ||
           [ "${#recovery_script_lines[@]}" -ne 1 ] || [ "${recovery_script_lines[0]}" != "$recovery_script" ] ||
           [ "${#recovery_sha256_lines[@]}" -ne 1 ] ||
           [[ ! "${recovery_sha256_lines[0]}" =~ ^[0-9a-f]{64}$ ]] ||
           [ ! -f "$recovery_script" ] ||
           [ "$(stat -c %u:%a "$recovery_script" 2>/dev/null || true)" != '0:700' ]; then
          printf 'UNRESOLVED run_id=%s status=CORRUPT state=%s\n' "$run_id" "$candidate"
          count=$((count + 1))
          continue
        fi
        recovery_sha256="${recovery_sha256_lines[0]}"
        if ! echo "$recovery_sha256  $recovery_script" | sha256sum -c - >/dev/null 2>&1; then
          printf 'UNRESOLVED run_id=%s status=CORRUPT state=%s\n' "$run_id" "$candidate"
          count=$((count + 1))
          continue
        fi
        printf 'UNRESOLVED run_id=%s status=%s state=%s\n' "$run_id" "$status" "$candidate"
        count=$((count + 1))
        ;;
      ACTIVE_CHANGED|ACTIVE_PERSISTENCE_PATHS_INVALID|ACTIVE_RELEASE_INVALID|ACTIVE_UNHEALTHY|BLOCKED_UNRESOLVED|DEPLOY_INPUT_INVALID|DEPLOY_OK|NOOP|PREACTIVATION_CLEANUP_OK|PREACTIVATION_FAILED_UNCHANGED|RECOVERY_ROLLBACK_OK|RELEASE_EXISTS|ROLLBACK_OK)
        ;;
      *)
        printf 'UNRESOLVED run_id=%s status=CORRUPT state=%s\n' "$run_id" "$candidate"
        count=$((count + 1))
        ;;
    esac
  done
  printf 'UNRESOLVED_COUNT=%s\n' "$count"
}

if [ "$mode" = list ]; then
  test "$#" = 1
  if [ ! -d "$state_root" ]; then
    echo 'UNRESOLVED_COUNT=0'
    exit 0
  fi
  list_unresolved
  exit 0
fi

test "$mode" = recover
test "$#" = 3
target_run_id="$2"
recovery_run_id="$3"
active=/root/ai-life-sim
release_root=/root/ai-life-sim-releases
backup_root=/root/ai-life-sim-backups
state_file="$state_root/$target_run_id.state"
recovery_link="/root/ai-life-sim-recovery-$recovery_run_id-$$"
unit_names=(
  ai-life-sim-account-cleanup.service
  ai-life-sim-account-cleanup.timer
  ai-life-sim-release-cleanup.service
  ai-life-sim-release-cleanup.timer
  ai-life-sim-operations-dashboard.service
)
enabled_units=(
  ai-life-sim-account-cleanup.timer
  ai-life-sim-release-cleanup.timer
  ai-life-sim-operations-dashboard.service
)

[[ "$target_run_id" =~ ^[0-9a-f]{32}$ ]] || exit 64
[[ "$recovery_run_id" =~ ^[0-9a-f]{32}$ ]] || exit 64
test "$state_file" = "$state_root/$target_run_id.state"

unresolved_report="$(list_unresolved)"
printf '%s\n' "$unresolved_report"
mapfile -t unresolved_count_lines < <(sed -n 's/^UNRESOLVED_COUNT=//p' <<< "$unresolved_report")
mapfile -t target_unresolved_lines < <(
  grep -E "^UNRESOLVED run_id=$target_run_id status=(RUNNING_[A-Z_]+|ROLLBACK_FAILED) state=" <<< "$unresolved_report" || true
)
if [ "${#unresolved_count_lines[@]}" -ne 1 ] ||
   [[ ! "${unresolved_count_lines[0]}" =~ ^[0-9]+$ ]] ||
   [ "${unresolved_count_lines[0]}" != 1 ] ||
   [ "${#target_unresolved_lines[@]}" -ne 1 ]; then
  echo "RECOVERY_AMBIGUOUS_UNRESOLVED target=$target_run_id" >&2
  exit 75
fi

for required_command in curl pm2 systemctl grep sed stat readlink install find; do
  command -v "$required_command" >/dev/null 2>&1 || {
    echo "RECOVERY_PREREQUISITE_MISSING $required_command" >&2
    exit 69
  }
done
test -f "$state_file"
test "$(stat -c %u "$state_file")" = 0
test "$(stat -c %a "$state_file")" = 600

read_field() {
  local key="$1"
  local -a values
  mapfile -t values < <(sed -n "s/^${key}=//p" "$state_file")
  [ "${#values[@]}" -eq 1 ] || return 1
  printf '%s\n' "${values[0]}"
}

status="$(read_field status)"
state_schema="$(read_field state_schema)"
commit="$(read_field commit)"
expected_previous="$(read_field expected_previous)"
expected_previous_commit="$(read_field expected_previous_commit)"
release="$(read_field release)"
backup="$(read_field backup)"
archive_sha256="$(read_field archive_sha256)"
recovery_script="$(read_field recovery_script)"
recovery_sha256="$(read_field recovery_sha256)"
persistence_migration="$(read_field persistence_migration)"
case "$status" in
  RUNNING_*) interrupted_status="$status" ;;
  ROLLBACK_FAILED)
    interrupted_status="$(read_field interrupted_status)"
    [[ "$interrupted_status" = RUNNING_* ]] || exit 65
    ;;
  *) echo "RECOVERY_NOT_REQUIRED status=$status" >&2; exit 75 ;;
esac
[ "$state_schema" = 2 ] || exit 65
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || exit 65
[[ "$expected_previous_commit" =~ ^[0-9a-f]{40}$ ]] || exit 65
[[ "$expected_previous" =~ ^/root/ai-life-sim-releases/([0-9a-f]{7}|[0-9a-f]{40})$ ]] || exit 65
[[ "$archive_sha256" =~ ^[0-9a-f]{64}$ ]] || exit 65
[[ "$recovery_sha256" =~ ^[0-9a-f]{64}$ ]] || exit 65
case "$persistence_migration" in
  none|player-mailbox-v5|game-record-lifespan-adjustments|log-archive-v1) ;;
  *) exit 65 ;;
esac
test "$release" = "$release_root/$commit"
test "$backup" = "$backup_root/$commit-$target_run_id"
test "$recovery_script" = "$state_root/$target_run_id.recover.sh"
test "$(readlink -f "$0")" = "$recovery_script"
test "$(stat -c %u:%a "$recovery_script")" = '0:700'
echo "$recovery_sha256  $recovery_script" | sha256sum -c - >/dev/null
previous_id="${expected_previous##*/}"
if [ "${#previous_id}" -eq 40 ]; then
  test "$previous_id" = "$expected_previous_commit"
else
  test "$previous_id" = "${expected_previous_commit:0:7}"
fi

recovery_failure_exit=''

write_recovery_state() {
  local new_status="$1"
  local temp_state="$state_file.tmp.$$"
  umask 077
  {
    printf 'state_schema=2\n'
    printf 'status=%s\n' "$new_status"
    printf 'commit=%s\n' "$commit"
    printf 'expected_previous=%s\n' "$expected_previous"
    printf 'expected_previous_commit=%s\n' "$expected_previous_commit"
    printf 'release=%s\n' "$release"
    printf 'backup=%s\n' "$backup"
    printf 'archive_sha256=%s\n' "$archive_sha256"
    printf 'recovery_script=%s\n' "$recovery_script"
    printf 'recovery_sha256=%s\n' "$recovery_sha256"
    printf 'persistence_migration=%s\n' "$persistence_migration"
    printf 'interrupted_status=%s\n' "$interrupted_status"
    printf 'recovered_by=%s\n' "$recovery_run_id"
    printf 'recovered_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    if [ -n "$recovery_failure_exit" ]; then
      printf 'recovery_failure_exit=%s\n' "$recovery_failure_exit"
    fi
  } > "$temp_state"
  chmod 0600 "$temp_state"
  mv -f "$temp_state" "$state_file"
}

runtime_check_failed() {
  local check="$1"
  shift
  printf 'RUNTIME_CHECK_FAILED check=%s' "$check" >&2
  while [ "$#" -gt 0 ]; do
    printf ' %s' "$1" >&2
    shift
  done
  printf '\n' >&2
}

wait_http() {
  local check="$1"
  local url="$2"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  runtime_check_failed "$check" "url=$url"
  return 1
}

verify_runtime() {
  local expected="$1"
  local expected_commit="$2"
  local pids found_pid pid name build_id
  test -d "$expected" || { runtime_check_failed release-directory "path=$expected"; return 1; }
  test -f "$expected/.next/BUILD_ID" || { runtime_check_failed build-id-file "path=$expected/.next/BUILD_ID"; return 1; }
  if [[ "$expected" =~ /[0-9a-f]{40}$ ]]; then
    test -f "$expected/.release-commit" || { runtime_check_failed release-commit-file "path=$expected/.release-commit"; return 1; }
    test "$(cat "$expected/.release-commit")" = "$expected_commit" || { runtime_check_failed release-commit-content "expected=$expected_commit"; return 1; }
    test "${expected##*/}" = "$expected_commit" || { runtime_check_failed release-directory-commit "expected=$expected_commit"; return 1; }
  fi
  test "$(readlink -f "$active")" = "$expected" || { runtime_check_failed active-link "expected=$expected"; return 1; }
  pids="$(pm2 pid ai-life-sim 2>/dev/null)" || { runtime_check_failed pm2-pid-query; return 1; }
  found_pid=0
  for pid in $pids; do
    [[ "$pid" =~ ^[1-9][0-9]*$ ]] || { runtime_check_failed pm2-pid-format "value=$pid"; return 1; }
    test "$(readlink -f "/proc/$pid/cwd")" = "$expected" || { runtime_check_failed pm2-working-directory "pid=$pid" "expected=$expected"; return 1; }
    found_pid=1
  done
  test "$found_pid" = 1 || { runtime_check_failed pm2-running-process; return 1; }
  for name in "${enabled_units[@]}"; do
    systemctl is-enabled --quiet "$name" || { runtime_check_failed systemd-enabled "unit=$name"; return 1; }
    systemctl is-active --quiet "$name" || { runtime_check_failed systemd-active "unit=$name"; return 1; }
  done
  build_id="$(cat "$expected/.next/BUILD_ID")" || { runtime_check_failed build-id-read; return 1; }
  [[ "$build_id" =~ ^[A-Za-z0-9_-]+$ ]] || { runtime_check_failed build-id-format; return 1; }
  wait_http loopback-home http://127.0.0.1:3000/ || return 1
  wait_http build-manifest "http://127.0.0.1:3000/_next/static/$build_id/_buildManifest.js" || return 1
  wait_http operations-dashboard http://127.0.0.1:4317/api/stats || return 1
}

env_has_unique_value() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local key_count expected_count
  key_count="$(grep -Ec "^${key}=" "$file" || true)"
  expected_count="$(grep -Fxc "$key=$expected" "$file" || true)"
  [ "$key_count" = 1 ] && [ "$expected_count" = 1 ]
}

resolve_log_database_path() {
  local file="$1"
  local value=''
  local -a database_lines directory_lines
  mapfile -t database_lines < <(sed -n 's/^AI_LOG_DB_PATH=//p' "$file")
  mapfile -t directory_lines < <(sed -n 's/^AI_LOG_DIR=//p' "$file")
  [ "${#database_lines[@]}" -le 1 ] || return 1
  [ "${#directory_lines[@]}" -le 1 ] || return 1
  if [ "${#database_lines[@]}" -eq 1 ] && [ -n "${database_lines[0]}" ]; then
    value="${database_lines[0]}"
  elif [ "${#directory_lines[@]}" -eq 1 ] && [ -n "${directory_lines[0]}" ]; then
    value="${directory_lines[0]%/}/logs.sqlite"
  else
    value='/var/lib/ai-life-sim/logs.sqlite'
  fi
  [[ "$value" =~ ^/[A-Za-z0-9._/-]+$ ]] || return 1
  printf '%s\n' "$value"
}

legacy_persistence_is_empty() {
  local legacy_path entry
  for legacy_path in \
    "$expected_previous/.data/narrative-memory" \
    "$expected_previous/.data/narrative-rounds"; do
    if [ -e "$legacy_path" ]; then
      [ ! -L "$legacy_path" ] || return 1
      [ -d "$legacy_path" ] || return 1
      entry="$(find "$legacy_path" -mindepth 1 -print -quit)" || return 1
      [ -z "$entry" ] || return 1
    fi
  done
}

persistence_migration_may_be_applied() {
  [ "$persistence_migration" != none ] || return 1
  case "$interrupted_status" in
    RUNNING_BACKED_UP|RUNNING_MIGRATING|RUNNING_MIGRATED|RUNNING_SWITCHED) return 0 ;;
    *) return 1 ;;
  esac
}

quiesce_for_persistence_rollback() {
  local cleanup_idle=0 write_stopped=0 cleanup_state
  local pm2_pid_output pm2_pid_code listener_output listener_code pid positive_pid
  systemctl stop ai-life-sim-account-cleanup.timer
  for _ in $(seq 1 60); do
    cleanup_state="$(systemctl show ai-life-sim-account-cleanup.service --property=ActiveState --value)"
    case "$cleanup_state" in
      inactive|failed) cleanup_idle=1; break ;;
    esac
    sleep 2
  done
  test "$cleanup_idle" = 1
  pm2 stop ai-life-sim
  for _ in $(seq 1 30); do
    set +e
    pm2_pid_output="$(pm2 pid ai-life-sim 2>&1)"
    pm2_pid_code=$?
    listener_output="$(ss -H -ltn 'sport = :3000' 2>&1)"
    listener_code=$?
    set -e
    test "$pm2_pid_code" -eq 0
    test "$listener_code" -eq 0
    positive_pid=0
    for pid in $pm2_pid_output; do
      [[ "$pid" =~ ^[0-9]+$ ]]
      if [[ "$pid" =~ ^[1-9][0-9]*$ ]]; then positive_pid=1; fi
    done
    if [ "$positive_pid" = 0 ] && [ -z "$listener_output" ]; then
      write_stopped=1
      break
    fi
    sleep 1
  done
  test "$write_stopped" = 1
}

rollback_persistence_migration() {
  local migration_script log_database
  case "$persistence_migration" in
    player-mailbox-v5) migration_script=scripts/ops/migrate-player-mailbox-v5.ts ;;
    game-record-lifespan-adjustments) migration_script=scripts/ops/migrate-game-record-lifespan-adjustments.ts ;;
    log-archive-v1)
      migration_script=scripts/ops/migrate-log-archive-v1.ts
      log_database="$(resolve_log_database_path "$expected_previous/.env.production.local")"
      (
        cd "$release"
        node --no-warnings=ExperimentalWarning \
          --loader ./scripts/check/lib/typescript-loader.mjs \
          "$migration_script" rollback \
          --log-database "$log_database" \
          --backup-directory "$backup"
      )
      return
      ;;
    *) return 0 ;;
  esac
  (
    cd "$release"
    node --no-warnings=ExperimentalWarning \
      --loader ./scripts/check/lib/typescript-loader.mjs \
      "$migration_script" rollback \
      --player-content-database /var/lib/ai-life-sim/player-content.sqlite \
      --account-database /var/lib/ai-life-sim/accounts.sqlite \
      --backup-directory "$backup"
  )
}

recovery_failed() {
  local failure_status="$1"
  trap - ERR HUP INT TERM
  set +e
  rm -f -- "$recovery_link"
  recovery_failure_exit="$failure_status"
  write_recovery_state RECOVERY_ROLLBACK_FAILED || true
  echo "RECOVERY_ROLLBACK_FAILED target_run=$target_run_id previous=$expected_previous release=$release backup=$backup" >&2
  echo "recovery command failed with original exit $failure_status" >&2
  exit 86
}

current_active="$(readlink -f "$active" 2>/dev/null || true)"
if [ "$current_active" != "$expected_previous" ] && [ "$current_active" != "$release" ]; then
  echo "RECOVERY_ACTIVE_UNRELATED current=$current_active expected_previous=$expected_previous release=$release" >&2
  exit 75
fi

on_recovery_error() { local failure_status=$?; recovery_failed "$failure_status"; }
trap on_recovery_error ERR
trap 'recovery_failed 129' HUP
trap 'recovery_failed 130' INT
trap 'recovery_failed 143' TERM

test -d "$expected_previous"
test -f "$expected_previous/.env.production.local"
env_has_unique_value "$expected_previous/.env.production.local" NARRATIVE_MEMORY_DIR "$memory_root"
env_has_unique_value "$expected_previous/.env.production.local" NARRATIVE_ROUND_LOG_DIR "$round_root"
test -d "$memory_root"
test -d "$round_root"
test "$(stat -c %u "$memory_root")" = 0
test "$(stat -c %u "$round_root")" = 0
test "$(stat -c %a "$memory_root")" = 700
test "$(stat -c %a "$round_root")" = 700
legacy_persistence_is_empty
if [[ "$expected_previous" =~ /[0-9a-f]{40}$ ]]; then
  test -f "$expected_previous/.release-commit"
  test "$(cat "$expected_previous/.release-commit")" = "$expected_previous_commit"
fi
previous_units="$expected_previous/scripts/ops/systemd"
for name in "${unit_names[@]}"; do test -f "$previous_units/$name"; done

if persistence_migration_may_be_applied; then
  command -v node >/dev/null 2>&1
  command -v ss >/dev/null 2>&1
  test -d "$backup"
  case "$persistence_migration" in
    player-mailbox-v5) test -f "$backup/player-content.sqlite" ;;
    game-record-lifespan-adjustments)
      test -f "$backup/accounts.sqlite"
      test -f "$backup/player-content.sqlite"
      ;;
    log-archive-v1) test -f "$backup/logs.sqlite" ;;
  esac
  quiesce_for_persistence_rollback
  rollback_persistence_migration
fi

ln -s "$expected_previous" "$recovery_link"
mv -Tf "$recovery_link" "$active"
for name in "${unit_names[@]}"; do
  install -m 0644 "$previous_units/$name" "/etc/systemd/system/$name"
done
systemctl daemon-reload
for name in "${enabled_units[@]}"; do systemctl enable "$name"; done
pm2 restart ai-life-sim --update-env
pm2 save
for name in "${enabled_units[@]}"; do systemctl restart "$name"; done
verify_runtime "$expected_previous" "$expected_previous_commit"

if [ "$release" != "$expected_previous" ] && [ -e "$release" ]; then
  test "$(readlink -f "$active")" = "$expected_previous"
  rm -rf --one-file-system -- "$release"
fi
rm -f -- "/tmp/ai-life-sim-$commit-$target_run_id.tar.gz"
rm -f -- "/tmp/ai-life-sim-deploy-$target_run_id.upload.sh" "/tmp/ai-life-sim-deploy-$target_run_id.sh"
write_recovery_state RECOVERY_ROLLBACK_OK
trap - ERR HUP INT TERM
echo "RECOVERY_ROLLBACK_OK target_run=$target_run_id previous=$expected_previous discarded=$release backup_preserved=$backup"
